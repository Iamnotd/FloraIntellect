import express from "express";
import cors from "cors";
import compression from "compression";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PIXABAY_KEY = process.env.PIXABAY_API_KEY;
const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type"] }));
app.use(express.json());
app.use(compression());
app.use(express.static(__dirname));

// ── Cargar plantas ────────────────────────────────────────────────────────────
function cargarPlantas() {
  const dataDir = join(__dirname, "data");
  let todas = [];
  try {
    const archivos = readdirSync(dataDir).filter(f => f.endsWith(".json"));
    for (const archivo of archivos) {
      const contenido = JSON.parse(readFileSync(join(dataDir, archivo), "utf-8"));
      todas = todas.concat(contenido);
    }
    console.log(`🌿 ${todas.length} plantas cargadas correctamente.`);
  } catch (error) {
    console.error("Error al cargar plantas:", error.message);
  }
  return todas;
}

const PLANTAS = cargarPlantas();

// ── Cache de fotos ────────────────────────────────────────────────────────────
const fotoCache = new Map();

// ── Buscar foto en Pixabay ────────────────────────────────────────────────────
async function buscarFotoPixabay(terminoBusqueda) {
  if (!terminoBusqueda) return null;

  if (fotoCache.has(terminoBusqueda)) {
    return fotoCache.get(terminoBusqueda);
  }

  try {
    const query = encodeURIComponent(terminoBusqueda);

    const url =
      `https://pixabay.com/api/?key=${PIXABAY_KEY}` +
      `&q=${query}` +
      `&image_type=photo` +
      `&category=nature` +
      `&per_page=5` +
      `&safesearch=true`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.hits && data.hits.length > 0) {
      const foto = data.hits[0].webformatURL;
      fotoCache.set(terminoBusqueda, foto);
      return foto;
    }

  } catch (err) {
    console.error("Pixabay:", err.message);
  }

  return null;
}

// ── GET /foto-planta/:id ──────────────────────────────────────────────────────
app.get("/foto-planta/:id", async (req, res) => {
  const planta = PLANTAS.find(p => p.id === parseInt(req.params.id));
  if (!planta) return res.status(404).json({ error: "No encontrada" });

  let foto = null;

  if (planta.imagen) {
    foto = planta.imagen;
  }

  if (!foto && planta.nombre_cientifico) {
    foto = await buscarFotoPixabay(planta.nombre_cientifico);
  }

  if (!foto && planta.nombre_comun) {
    foto = await buscarFotoPixabay(planta.nombre_comun);
  }

  if (!foto && planta.nombre_cientifico) {
    foto = await buscarFotoPixabay(`${planta.nombre_cientifico} medicinal plant`);
  }

  if (!foto && planta.nombre_comun) {
    foto = await buscarFotoPixabay(`${planta.nombre_comun} herb plant`);
  }

  res.json({ imagen: foto || null });;
});

function formatearContexto(plantas) {
  return plantas.map(p => `📌 ${p.nombre_comun} (${p.nombre_cientifico})
Usos: ${(p.usos||[]).join(", ")}
Preparación: ${p.preparacion}
Contraindicaciones: ${p.contraindicaciones}
Parte usada: ${p.parte_usada}`).join("\n---\n");
}

const SYSTEM_BASE = `Eres FloraIntellect, experto en plantas medicinales. Hablas con calidez, usas nombres científicos, mezclas sabiduría ancestral con ciencia moderna y siempre adviertes sobre contraindicaciones. No diagnostiques enfermedades. Máximo 3-4 párrafos por respuesta. Usa emojis de plantas con moderación 🌿🌸🍃.`;

// ── POST /chat ────────────────────────────────────────────────────────────────
function respuestaFallback(plantas, pregunta) {
  if (!plantas || plantas.length === 0) {
    return `🌿 No encontré una planta exacta relacionada con "${pregunta}".

Puedes intentar preguntarme por una planta específica como manzanilla, jengibre, lavanda, menta o aloe vera.`;
  }

  return plantas.map(p => `🌿 **${p.nombre_comun}** (*${p.nombre_cientifico}*)

**Usos:** ${(p.usos || []).join(", ")}

**Preparación:** ${p.preparacion}

**Parte usada:** ${p.parte_usada}

⚠️ **Contraindicaciones:** ${p.contraindicaciones}`).join("\n\n---\n\n");
}

app.post("/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages es obligatorio." });
  }

  const ultimo = messages[messages.length - 1]?.content || "";
  const relevantes = buscarPlantasRelevantes(ultimo);
  const contexto = formatearContexto(relevantes);

  const system = contexto
    ? `${SYSTEM_BASE}\n\nINFORMACIÓN DE LA BASE DE DATOS:\n${contexto}`
    : SYSTEM_BASE;

  const fotos = relevantes
    .slice(0, 2)
    .filter(p => p.imagen)
    .map(p => ({
      nombre: p.nombre_comun,
      url: p.imagen
    }));

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system,
      messages,
    });

    const reply = response.content[0].text;

    res.json({ reply, fotos });
  } catch (error) {
    console.error("Error:", error.message);

    const reply = respuestaFallback(relevantes, ultimo);

    res.json({
      reply: `${reply}

🍃 *Respuesta generada desde la base de datos local porque el servicio de IA no está disponible en este momento.*`,
      fotos
    });
  }
});

// ── GET /plantas ──────────────────────────────────────────────────────────────
app.get("/plantas", (req, res) => {
  const { buscar } = req.query;
  if (buscar) {
    const resultado = buscarPlantasRelevantes(buscar, 20);
    return res.json({ total: resultado.length, plantas: resultado });
  }
  res.json({ total: PLANTAS.length, plantas: PLANTAS });
});

app.get("/plantas/:id", (req, res) => {
  const p = PLANTAS.find(p => p.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: "No encontrada." });
  res.json(p);
});

app.get("/health", (_req, res) => res.json({
  status: "ok",
  service: "FloraIntellect",
  plantas_cargadas: PLANTAS.length,
  anthropic: process.env.ANTHROPIC_API_KEY ? "configurado" : "no configurado",
  pixabay: PIXABAY_KEY ? "configurado" : "no configurado"
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌿 FloraIntellect corriendo en http://localhost:${PORT}`);
  console.log(`🖼️  Pixabay: ${PIXABAY_KEY ? "✅ configurado" : "❌ no configurado"}`);
});