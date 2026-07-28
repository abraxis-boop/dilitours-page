/* ==========================================================================
   DILITOURS - SCRIPT CONTROLLER (GitHub Pages + Apps Script como proxy de AppSheet)
   ========================================================================== */

// ⚠️ PON AQUÍ LA URL DE TU ÚLTIMO DESPLIEGUE DE APPS SCRIPT
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxhD4cZFe_u7Ucic9DEZt591ZSBlv-MScoRHpJkeWg7xAU58uV9pkEYY3TAvwAFt_wW/exec";

document.addEventListener('DOMContentLoaded', () => {
  initDynamicLoaders();
  initQuoteForms();
  initMobileNav();
});

/* --- Inyecta la animación de carga (Skeleton Loader + Banner Animado) --- */
function renderSkeletonGrid(container, count = 8, label = "Buscando las mejores opciones...") {
  if (!container) return;
  const statusBanner = `
    <div class="catalog-loading-status">
      <div class="loading-spinner"></div>
      <span>${label}</span>
    </div>
  `;
  const skeletons = Array(count).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line full" style="height: 18px;"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line full" style="margin-top: auto; height: 32px;"></div>
      </div>
    </div>
  `).join('');
  container.innerHTML = statusBanner + skeletons;
}

/* --- Detecta en qué página está el usuario y carga solo los datos necesarios --- */
function initDynamicLoaders() {
  const toursGrid = document.getElementById('tours-grid');
  if (toursGrid) {
    renderSkeletonGrid(toursGrid, 8, "🔍 Buscando las mejores experiencias y tours...");
    const state = { items: [] };
    fetchTable('Catalogo_tours', (data) => {
      state.items = data;
      renderCards(toursGrid, data, renderTourCard);
    });
    wireSearchFilter('search-tours', toursGrid, state, renderTourCard, (item, q) => {
      const campos = [item.nombre, item.categoria, item.descripcion, item.notas];
      return campos.some(c => (c || '').toLowerCase().includes(q));
    });
  }

  const hotelsGrid = document.getElementById('hotels-grid');
  if (hotelsGrid) {
    renderSkeletonGrid(hotelsGrid, 8, "🏨 Buscando los mejores hoteles y hospedajes...");
    const state = { items: [] };
    fetchTable('Hotel', (data) => {
      state.items = data;
      renderCards(hotelsGrid, data, renderHotelCard);
    });
    wireSearchFilter('search-hotels', hotelsGrid, state, renderHotelCard, (item, q) => {
      const campos = [item.nombre, item.municipio, item.estado, item.pais, item.descripcion];
      return campos.some(c => (c || '').toLowerCase().includes(q));
    });
  }

  const carsGrid = document.getElementById('cars-grid');
  if (carsGrid) {
    renderSkeletonGrid(carsGrid, 8, "🚐 Cargando flotilla de vehículos disponibles...");
    initCarsSection(carsGrid);
  }

  const productsGrid = document.getElementById('products-grid');
  if (productsGrid) {
    renderSkeletonGrid(productsGrid, 8, "✨ Cargando catálogo de opciones...");
    fetchTable('catalogo_productos', (data) => renderCards(productsGrid, data, renderProductCard));
  }
}

/* --- Consulta cualquier tabla de AppSheet vía el proxy de Apps Script --- */
function fetchTable(tableName, callback) {
  const url = `${WEB_APP_URL}?action=getData&table=${encodeURIComponent(tableName)}`;

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('Respuesta no válida del servidor: ' + res.status);
      return res.json();
    })
    .then(data => {
      if (data && data.error) {
        console.error('Error del backend (' + tableName + '):', data.error);
        callback([]);
        return;
      }
      callback(data);
    })
    .catch(err => {
      console.error('Error al consultar ' + tableName + ':', err);
      callback([]);
    });
}

/* --- Renderizado genérico --- */
function renderCards(container, items, templateFn) {
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem;">
        <p style="font-size: 1.05rem; color: var(--clr-text-muted);">No hay opciones disponibles por el momento.</p>
      </div>
    `;
    return;
  }
  container.innerHTML = items.map((item, index) => {
    const cardHtml = templateFn(item, index);
    if (cardHtml.includes('class="card"')) {
      return cardHtml.replace('class="card"', 'class="card fade-in"');
    }
    return cardHtml;
  }).join('');
}

/* --- Construye URL de imagen alojada en AppSheet (tablas que guardan solo el nombre de archivo) --- */
function buildAppSheetImageUrl(appId, tableName, rutaRelativa) {
  if (!rutaRelativa) return null;
  return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appId)}&tableName=${encodeURIComponent(tableName)}&fileName=${encodeURIComponent(rutaRelativa)}`;
}

/* --- Redimensiona una imagen que ya es una URL pública directa (caso de "vehiculos") ---
   Usa un servicio gratuito de resize para que fotos pesadas de celular no hagan
   lenta la página cuando hay muchos vehículos. No modifica el archivo original. */
function resizedImage(url, width, height) {
  if (!url) return null;
  const clean = String(url).replace(/^https?:\/\//, '');
  return (
    'https://images.weserv.nl/?url=' +
    encodeURIComponent(clean) +
    '&w=' + width +
    (height ? '&h=' + height + '&fit=cover' : '') +
    '&q=75&output=webp'
  );
}

/* --- Buscador genérico: filtra los items ya cargados en memoria y vuelve a pintar --- */
function wireSearchFilter(inputId, container, state, templateFn, matchFn) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const filtered = !q ? state.items : state.items.filter((item) => matchFn(item, q));
    renderCards(container, filtered, templateFn);
  });
}

// Catalogo_tours
function renderTourCard(item) {
  const imgSrc = buildAppSheetImageUrl(item._appId, item._tableName, item.imagen1)
    || buildAppSheetImageUrl(item._appId, item._tableName, item.imagen2)
    || buildAppSheetImageUrl(item._appId, item._tableName, item.imagen3)
    || 'https://via.placeholder.com/400x250?text=Sin+Imagen';
  const desc = item.descripcion ? item.descripcion.substring(0, 100) + '...' : 'Sin descripción';

  return `
    <div class="card">
      <img src="${imgSrc}" alt="${item.nombre}" style="height: 200px; object-fit: cover; width: 100%;">
      <div style="padding: 1.25rem; display: flex; flex-direction: column; flex: 1;">
        <span class="eyebrow">${item.categoria || 'Tour'}</span>
        <h3 style="margin-bottom: 0.5rem; font-size: 1.15rem;">${item.nombre}</h3>
        <p style="color: var(--clr-text-muted); font-size: 0.875rem; margin-bottom: 1rem; flex: 1;">${desc}</p>

        ${item.notas ? `<p style="font-size: 0.75rem; color: #eab308; margin-bottom: 0.75rem;">💡 ${item.notas}</p>` : ''}

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--clr-border); padding-top: 0.75rem;">
          <span style="font-weight: 700; color: var(--clr-brand-primary); font-size: 1.2rem;">$${item.precio || 0} MXN</span>
          <a href="https://wa.me/5210000000000?text=Hola,%20me%20interesa%20el%20tour%20${encodeURIComponent(item.nombre)}" class="btn btn-outline btn-sm" target="_blank">Reservar</a>
        </div>
      </div>
    </div>
  `;
}

// Hotel
function renderHotelCard(item) {
  const ubicacion = [item.municipio, item.estado, item.pais].filter(Boolean).join(', ') || 'Ubicación no especificada';
  const direccion = [item.calle_numero, item.colonia].filter(Boolean).join(', ');

  return `
    <div class="card">
      <div style="padding: 1.25rem; display: flex; flex-direction: column; flex: 1;">
        <span class="eyebrow">${item.categoria || 'Hotel'}</span>
        <h3 style="margin-bottom: 0.25rem; font-size: 1.2rem;">${item.nombre}</h3>
        <p style="color: var(--clr-brand-primary); font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem;">📍 ${ubicacion}</p>
        ${direccion ? `<p style="color: var(--clr-text-muted); font-size: 0.75rem; margin-bottom: 0.75rem;">${direccion}</p>` : ''}

        <p style="color: var(--clr-text-muted); font-size: 0.875rem; margin-bottom: 1.25rem; flex: 1;">${item.descripcion || ''}</p>

        <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--clr-border); padding-top: 0.75rem;">
          <a href="cotizar.html" class="btn btn-primary btn-sm">Cotizar Estancia</a>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   VEHÍCULOS — carga, buscador y galería de fotos
   ========================================================================== */

// Guarda los vehículos ya cargados para poder filtrarlos sin volver a llamar a la API.
function initCarsSection(carsGrid) {
  const state = { items: [] };

  fetchTable('vehiculos', (data) => {
    state.items = data;
    renderCards(carsGrid, data, renderCarCard);
  });

  wireSearchFilter('search-cars', carsGrid, state, renderCarCard, matchesCarQuery);

  // Delegación de eventos: un solo listener en el contenedor cubre todas las
  // miniaturas, incluidas las que se agregan después al filtrar o recargar.
  carsGrid.addEventListener('click', (e) => {
    const thumb = e.target.closest('.car-thumb');
    if (!thumb) return;

    const card = thumb.closest('.card');
    const mainImg = card && card.querySelector('.car-main-img');
    if (!mainImg) return;

    mainImg.src = thumb.dataset.full;
    card.querySelectorAll('.car-thumb').forEach((btn) => {
      btn.style.borderColor = 'var(--clr-border)';
    });
    thumb.style.borderColor = 'var(--clr-brand-primary)';
  });
}

function matchesCarQuery(item, q) {
  const campos = [item.tipo_vehiculo, item.nombre_vehiculo, item.marca, item.modelo];
  return campos.some((campo) => (campo || '').toLowerCase().includes(q));
}

// vehiculos
function renderCarCard(item, index) {
  const images = [item.imagen1_url, item.imagen2_url, item.imagen3_url].filter(
    (u) => u && String(u).trim().length > 0
  );

  const mainImg = images.length > 0 ? resizedImage(images[0], 500, 320) : null;

  const thumbsHtml = images.length > 1
    ? `<div style="display:flex; gap:6px; padding:8px; background: rgba(0,0,0,0.04);">
        ${images
      .map((src, i) => `
            <button type="button" class="car-thumb" data-full="${resizedImage(src, 500, 320)}"
              style="all:unset; cursor:pointer; width:48px; height:36px; border-radius:4px; overflow:hidden;
              border:1px solid ${i === 0 ? 'var(--clr-brand-primary)' : 'var(--clr-border)'}; flex-shrink:0;">
              <img src="${resizedImage(src, 100, 75)}" alt="" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block;">
            </button>`)
      .join('')}
      </div>`
    : '';

  return `
    <div class="card">
      ${mainImg
      ? `<img class="car-main-img" src="${mainImg}" alt="${item.marca || ''} ${item.modelo || ''}" loading="lazy" style="height: 200px; object-fit: cover; width: 100%;">`
      : ''}
      ${thumbsHtml}
      <div style="padding: 1.25rem; display: flex; flex-direction: column; flex: 1;">
        <span class="eyebrow">${item.tipo_vehiculo || 'Vehículo'}</span>
        <h3 style="margin-bottom: 0.25rem; font-size: 1.15rem;">${item.nombre_vehiculo || item.modelo}</h3>
        <p style="color: var(--clr-text-muted); font-size: 0.85rem; margin-bottom: 1rem;">${item.marca || ''} ${item.modelo || ''}</p>

        <div style="background: var(--clr-brand-surface); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.85rem; margin-bottom: 1rem;">
          <div>👥 <strong>Capacidad:</strong> ${item.capacidad || 'N/A'} pasajeros</div>
          ${item['km/l'] ? `<div>⛽ <strong>Rendimiento:</strong> ${item['km/l']} km/l</div>` : ''}
        </div>

        <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--clr-border); padding-top: 0.75rem; margin-top: auto;">
          <a href="cotizar.html" class="btn btn-outline btn-sm">Solicitar Vehículo</a>
        </div>
      </div>
    </div>
  `;
}

// catalogo_productos
function renderProductCard(item) {
  const imgSrc = buildAppSheetImageUrl(item._appId, item._tableName, item.imagen1)
    || buildAppSheetImageUrl(item._appId, item._tableName, item.imagen2)
    || buildAppSheetImageUrl(item._appId, item._tableName, item.imagen3)
    || 'https://via.placeholder.com/400x250?text=Sin+Imagen';

  return `
    <div class="card">
      <img src="${imgSrc}" alt="${item.Nombre || ''}" style="height: 200px; object-fit: cover; width: 100%;">
      <div style="padding: 1.25rem; display: flex; flex-direction: column; flex: 1;">
        <h3 style="margin-bottom: 0.5rem; font-size: 1.15rem;">${item.Nombre || '(Sin nombre)'}</h3>
        <div style="margin-top: auto; border-top: 1px solid var(--clr-border); padding-top: 0.75rem;">
          <span style="font-weight: 700; color: var(--clr-brand-primary); font-size: 1.2rem;">$${item.Precio || 0}</span>
        </div>
      </div>
    </div>
  `;
}

/* --- Procesar Cotizaciones vía fetch POST --- */
function initQuoteForms() {
  const forms = document.querySelectorAll('.quote-form');

  forms.forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Enviando...';
      submitBtn.disabled = true;

      const formData = {
        serviceType: form.dataset.service || 'Cotización General',
        route: form.querySelector('[name="route"]')?.value || '',
        passengers: form.querySelector('[name="passengers"]')?.value || '',
        dates: form.querySelector('[name="dates"]')?.value || '',
        name: form.querySelector('[name="name"]')?.value || '',
        contact: form.querySelector('[name="contact"]')?.value || '',
        details: form.querySelector('[name="details"]')?.value || ''
      };

      fetch(WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify(formData),
        headers: {
          'Content-Type': 'text/plain;charset=utf-8' // evita preflight OPTIONS con Apps Script
        }
      })
        .then(res => res.json())
        .then(res => {
          alert(res.message);
          form.reset();
        })
        .catch(err => {
          console.error('Error al enviar cotización:', err);
          alert('No se pudo enviar tu solicitud. Inténtalo más tarde.');
        })
        .finally(() => {
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        });
    });
  });
}
/* --- Menú hamburguesa (móvil) --- */
function initMobileNav() {
  const navToggle = document.querySelector('.nav-toggle');
  const mainNav = document.querySelector('.main-nav');
  const navOverlay = document.querySelector('.nav-overlay');

  if (!navToggle || !mainNav || !navOverlay) return;

  function toggleMenu() {
    const isOpen = mainNav.classList.toggle('is-active');
    navToggle.classList.toggle('is-active', isOpen);
    navOverlay.classList.toggle('is-active', isOpen);
    document.body.classList.toggle('nav-open', isOpen);
    navToggle.setAttribute('aria-expanded', isOpen);
  }

  navToggle.addEventListener('click', toggleMenu);
  navOverlay.addEventListener('click', toggleMenu);

  // Cierra el menú al hacer clic en un link
  mainNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (mainNav.classList.contains('is-active')) toggleMenu();
    });
  });

  // Cierra el menú si se redimensiona a escritorio con el menú abierto
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && mainNav.classList.contains('is-active')) {
      toggleMenu();
    }
  });
}