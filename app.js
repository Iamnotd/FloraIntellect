const fotoCache = {};

  async function cargarFoto(id) {
    if (fotoCache[id]) return fotoCache[id];
    try {
      const res = await fetch('/foto-planta/' + id);
      const data = await res.json();
      if (data.imagen) { fotoCache[id] = data.imagen; return data.imagen; }
    } catch(e) {}
    return null;
  }

  async function aplicarFotos() {
    const tarjetas = document.querySelectorAll('.plant-card[data-id]');
    for (const t of tarjetas) {
      const id = parseInt(t.getAttribute('data-id'));
      const container = t.querySelector('.plant-img');
      if (!container) continue;
      const url = await cargarFoto(id);
      if (url) {
        container.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML=\'🌿\'">';
      }
    }
  }

  const API = "https://floraintellect.onrender.com";
  let todasLasPlantas = [];
  let plantasFiltradas = [];
  let paginaActual = 1;
  const POR_PAGINA = 24;
  let historial = [];
  let cargando = false;
  let favoritos = cargarFavoritos();

  function cargarFavoritos() {
    try {
      const guardados = JSON.parse(localStorage.getItem("flora_favoritos")) || [];
      return [...new Set(guardados.map(Number).filter(Number.isFinite))];
    } catch (e) {
      return [];
    }
  }

  function guardarFavoritos() {
    localStorage.setItem("flora_favoritos", JSON.stringify(favoritos));
  }

  function esFavorito(id) {
    return favoritos.includes(Number(id));
  }

  function renderBotonFavorito(id) {
    const activo = esFavorito(id);
    return `<button class="plant-btn" style="margin-bottom:8px" onclick="toggleFavorito(${id}, event)">
      ${activo ? "★ Quitar de favoritos" : "☆ Guardar favorito"}
    </button>`;
  }

  function toggleFavorito(id, event) {
    if (event) event.stopPropagation();

    id = Number(id);
    if (esFavorito(id)) {
      favoritos = favoritos.filter(favId => favId !== id);
    } else {
      favoritos = [...new Set([...favoritos, id])];
    }

    guardarFavoritos();
    renderCatalogo();
    renderFavoritos();
  }

  // ── Inicializar ──────────────────────────────────────────────────────────
  async function init() {
    try {
      const res = await fetch(`${API}/plantas`);
      const data = await res.json();
      todasLasPlantas = data.plantas || [];
      plantasFiltradas = [...todasLasPlantas];
      document.getElementById('stat-plantas').textContent = todasLasPlantas.length;
      renderCatalogo();
    } catch (e) {
      console.error('No se pudo conectar al servidor:', e);
    }
    initChat();
  }

  // ── Navegación ───────────────────────────────────────────────────────────
  function showSection(nombre, btn) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`section-${nombre}`).classList.add('active');
    btn.classList.add('active');
    if (nombre === 'catalogo') renderCatalogo();
    if (nombre === 'favoritos') renderFavoritos();
  }

  // ── Catálogo ─────────────────────────────────────────────────────────────
  function filtrarPor(uso, btn) {
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    paginaActual = 1;
    if (!uso) {
      plantasFiltradas = [...todasLasPlantas];
    } else {
      plantasFiltradas = todasLasPlantas.filter(p =>
        (p.usos || []).some(u => u.toLowerCase().includes(uso))
      );
    }
    renderCatalogo();
  }

  function renderCatalogo() {
    const grid = document.getElementById('catalogo-grid');
    const inicio = (paginaActual - 1) * POR_PAGINA;
    const pagina = plantasFiltradas.slice(inicio, inicio + POR_PAGINA);

    if (pagina.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="icon">🌾</div>
        <h3>Sin resultados</h3>
        <p>No encontramos plantas con ese filtro</p>
      </div>`;
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    grid.innerHTML = pagina.map((p, i) => `
      <div class="plant-card" data-id="${p.id}" style="animation-delay:${i * 0.04}s" onclick="abrirModal(${p.id})">
        <div class="plant-img">
          ${p.imagen
            ? `<img src="${p.imagen}" alt="${p.nombre_comun}" onerror="this.parentElement.innerHTML='🌿'">`
            : '🌿'}
        </div>
        <div class="plant-body">
          <div class="plant-familia">${p.familia || ''}</div>
          <div class="plant-name">${p.nombre_comun}</div>
          <div class="plant-scientific">${p.nombre_cientifico}</div>
          <div class="plant-usos">
            ${(p.usos || []).slice(0, 3).map(u => `<span class="uso-tag">${u}</span>`).join('')}
          </div>
          ${renderBotonFavorito(p.id)}
          <button class="plant-btn">Ver detalles →</button>
        </div>
      </div>
    `).join('');

    renderPaginacion();
    setTimeout(aplicarFotos, 100);
  }

  function renderPaginacion() {
    const total = Math.ceil(plantasFiltradas.length / POR_PAGINA);
    const pag = document.getElementById('pagination');
    if (total <= 1) { pag.innerHTML = ''; return; }

    let html = '';
    for (let i = 1; i <= total; i++) {
      html += `<button class="page-btn ${i === paginaActual ? 'active' : ''}" onclick="irPagina(${i})">${i}</button>`;
    }
    pag.innerHTML = html;
  }

  function irPagina(n) {
    paginaActual = n;
    renderCatalogo();
    document.getElementById('section-catalogo').scrollIntoView({ behavior: 'smooth' });
  }

  function renderFavoritos() {
    const grid = document.getElementById('favoritos-grid');
    if (!grid) return;

    const plantasFavoritas = todasLasPlantas.filter(p => esFavorito(p.id));

    if (plantasFavoritas.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="icon">⭐</div>
        <h3>Aún no tienes favoritos</h3>
        <p>Guarda plantas desde el catálogo o el buscador para encontrarlas aquí.</p>
      </div>`;
      return;
    }

    grid.innerHTML = plantasFavoritas.map((p, i) => `
      <div class="plant-card" data-id="${p.id}" style="animation-delay:${i * 0.04}s" onclick="abrirModal(${p.id})">
        <div class="plant-img">
          ${p.imagen
            ? `<img src="${p.imagen}" alt="${p.nombre_comun}" onerror="this.parentElement.innerHTML='🌿'">`
            : '🌿'}
        </div>
        <div class="plant-body">
          <div class="plant-familia">${p.familia || ''}</div>
          <div class="plant-name">${p.nombre_comun}</div>
          <div class="plant-scientific">${p.nombre_cientifico}</div>
          <div class="plant-usos">
            ${(p.usos || []).slice(0, 3).map(u => `<span class="uso-tag">${u}</span>`).join('')}
          </div>
          ${renderBotonFavorito(p.id)}
          <button class="plant-btn">Ver detalles →</button>
        </div>
      </div>
    `).join('');

    setTimeout(aplicarFotos, 100);
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  function abrirModal(id) {
    const p = todasLasPlantas.find(x => x.id === id);
    if (!p) return;

    document.getElementById('modal').innerHTML = `
      <div class="modal-img">
        ${p.imagen
          ? `<img src="${p.imagen}" alt="${p.nombre_comun}" onerror="this.parentElement.innerHTML='🌿'">`
          : '🌿'}
      </div>
      <div class="modal-body">
        <div class="modal-familia">${p.familia}</div>
        <div class="modal-name">${p.nombre_comun}</div>
        <div class="modal-scientific">${p.nombre_cientifico}</div>

        <div class="modal-section">
          <h4>🌱 Usos medicinales</h4>
          <div class="modal-usos">
            ${(p.usos || []).map(u => `<span class="modal-tag">${u}</span>`).join('')}
          </div>
        </div>

        <div class="modal-section">
          <h4>🫖 Preparación</h4>
          <p>${p.preparacion}</p>
        </div>

        <div class="modal-section">
          <h4>🌿 Parte usada</h4>
          <p>${p.parte_usada}</p>
        </div>

        <div class="modal-section">
          <div class="warning-box">
            ⚠️ <span><strong>Contraindicaciones:</strong> ${p.contraindicaciones}</span>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-primary" onclick="preguntarSobrePlanta('${p.nombre_comun}')">
            💬 Preguntar a la IA
          </button>
          <button class="btn-secondary" onclick="cerrarModalDirecto()">Cerrar</button>
        </div>
      </div>
    `;

    document.getElementById('modal-overlay').classList.add('open');
  }

  function cerrarModal(e) {
    if (e.target === document.getElementById('modal-overlay')) cerrarModalDirecto();
  }

  function cerrarModalDirecto() {
    document.getElementById('modal-overlay').classList.remove('open');
  }

  function preguntarSobrePlanta(nombre) {
    cerrarModalDirecto();
    showSection('chat', document.querySelector('.nav-btn'));
    document.querySelector('.nav-btn').classList.add('active');
    setTimeout(() => sendMessage(`Cuéntame todo sobre ${nombre}: sus usos, cómo prepararla y sus contraindicaciones`), 300);
  }

  // ── Buscador ─────────────────────────────────────────────────────────────
  async function buscar() {
    const q = document.getElementById('search-input').value.trim();
    const results = document.getElementById('search-results');
    if (!q) return;

    results.innerHTML = `<div class="loading-grid">${Array(6).fill(`
      <div class="skeleton">
        <div class="skeleton-img"></div>
        <div class="skeleton-body">
          <div class="skeleton-line" style="width:60%"></div>
          <div class="skeleton-line" style="width:80%"></div>
          <div class="skeleton-line" style="width:40%"></div>
        </div>
      </div>`).join('')}</div>`;

    try {
      const res = await fetch(`${API}/plantas?buscar=${encodeURIComponent(q)}`);
      const data = await res.json();
      const plantas = data.plantas || [];

      if (plantas.length === 0) {
        results.innerHTML = `<div class="empty-state">
          <div class="icon">🔍</div>
          <h3>Sin resultados para "${q}"</h3>
          <p>Intenta con otro término o pregúntale a la IA</p>
        </div>`;
        return;
      }

      results.innerHTML = `
        <p style="margin-bottom:20px; color:var(--musgo)">
          <strong>${plantas.length}</strong> plantas encontradas para "<em>${q}</em>"
        </p>
        <div class="plants-grid">
          ${plantas.map((p, i) => `
            <div class="plant-card" data-id="${p.id}" style="animation-delay:${i*0.05}s" onclick="abrirModal(${p.id})">
              <div class="plant-img">
                ${p.imagen
                  ? `<img src="${p.imagen}" alt="${p.nombre_comun}" onerror="this.parentElement.innerHTML='🌿'">`
                  : '🌿'}
              </div>
              <div class="plant-body">
                <div class="plant-familia">${p.familia || ''}</div>
                <div class="plant-name">${p.nombre_comun}</div>
                <div class="plant-scientific">${p.nombre_cientifico}</div>
                <div class="plant-usos">
                  ${(p.usos || []).slice(0, 3).map(u => `<span class="uso-tag">${u}</span>`).join('')}
                </div>
                ${renderBotonFavorito(p.id)}
                <button class="plant-btn">Ver detalles →</button>
              </div>
            </div>
          `).join('')}
        </div>`;
      setTimeout(aplicarFotos, 100);
    } catch (e) {
      results.innerHTML = `<div class="empty-state">
        <div class="icon">⚠️</div>
        <h3>Error de conexión</h3>
        <p>Verifica que el servidor esté corriendo</p>
      </div>`;
    }
  }

  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') buscar();
  });

  // ── CHAT ─────────────────────────────────────────────────────────────────
  function initChat() {
    addBotMessage(`¡Hola! Soy **FloraIntellect** 🌿 — tu guía en el mundo de las plantas medicinales.

Puedo ayudarte con propiedades, preparaciones, contraindicaciones y mucho más. ¿Qué planta deseas conocer hoy?`);
  }

  function addBotMessage(text, fotos = []) {
    const msgs = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'msg bot';

    const formatted = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    let fotosHTML = '';
    if (fotos && fotos.length > 0) {
      fotosHTML = fotos.slice(0, 2).map(f => `
        <div class="plant-photo">
          <img src="${f.url}" alt="${f.nombre}" onerror="this.parentElement.style.display='none'">
          <div class="plant-photo-label">🌿 ${f.nombre}</div>
        </div>
      `).join('');
    }

    div.innerHTML = `
      <div class="msg-avatar">🌿</div>
      <div>
        <div class="bubble">${formatted}</div>
        ${fotosHTML}
      </div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addUserMessage(text) {
    const msgs = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'msg user';
    div.innerHTML = `
      <div class="bubble">${text}</div>
      <div class="msg-avatar">👤</div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addTyping() {
    const msgs = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'msg bot';
    div.id = 'typing';
    div.innerHTML = `
      <div class="msg-avatar">🌿</div>
      <div class="typing"><span></span><span></span><span></span></div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTyping() {
    document.getElementById('typing')?.remove();
  }

  async function sendMessage(texto) {
    const input = document.getElementById('chat-input');
    const text = texto || input.value.trim();
    if (!text || cargando) return;

    input.value = '';
    input.style.height = 'auto';
    document.getElementById('send-btn').disabled = true;
    cargando = true;

    addUserMessage(text);
    historial.push({ role: 'user', content: text });
    addTyping();

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historial })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      removeTyping();
      addBotMessage(data.reply, data.fotos);
      historial.push({ role: 'assistant', content: data.reply });

     } catch (e) {
      console.error('Error en chat:', e);
      removeTyping();
      addBotMessage('🌿 Error real: ' + e.message);
    } finally {
      cargando = false;
    }
  }

  function sendSuggestion(text) {
    sendMessage(text);
  }

  // Input events
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');

  chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    sendBtn.disabled = !this.value.trim() || cargando;
  });

  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  sendBtn.addEventListener('click', () => sendMessage());

  // Iniciar
  init();