/* ==========================================================================
   DILITOURS - SCRIPT CONTROLLER (GitHub Pages + Apps Script como proxy de AppSheet)
   ========================================================================== */

// ⚠️ PON AQUÍ LA URL DE TU ÚLTIMO DESPLIEGUE DE APPS SCRIPT
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz9LITVaHUmuJ2joxwNIuAGMyJfDVkljgwQTAAts7kp_yr4xK0bFXcmcGnJn1VOEFw/exec";

// ⚠️ Prefijo de las columnas de imagen en TODAS tus tablas (Catalogo_tours,
// Hotel, vehiculos, catalogo_productos). Si en alguna tabla el nombre real es
// distinto (ej. "foto" en vez de "imagen"), ajusta esa tabla en collectImages().
const IMAGE_COLUMN_PREFIX = 'imagen';

// Guarda TODOS los items cargados por tabla (para que el buscador filtre sin volver a pedir datos)
const fullData = { tours: [], hotels: [], cars: [], products: [] };

// Guarda lo que está actualmente pintado en pantalla (para que el modal abra el item correcto)
const lastRendered = { tours: [], hotels: [], cars: [], products: [] };

document.addEventListener('DOMContentLoaded', () => {
  initDynamicLoaders();
  initQuoteForms();
  initMobileNav();
  initImageModal();
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
    fetchTable('Catalogo_tours', (data) => {
      fullData.tours = data;
      renderCards(toursGrid, data, renderTourCard, 'tours');
    });
    wireSearchFilter('search-tours', toursGrid, 'tours', renderTourCard, (item, q) => {
      const campos = [item.nombre, item.categoria, item.descripcion, item.notas];
      return campos.some(c => (c || '').toLowerCase().includes(q));
    });
  }

  const hotelsGrid = document.getElementById('hotels-grid');
  if (hotelsGrid) {
    renderSkeletonGrid(hotelsGrid, 8, "🏨 Buscando los mejores hoteles y hospedajes...");
    fetchTable('Hotel', (data) => {
      fullData.hotels = data;
      renderCards(hotelsGrid, data, renderHotelCard, 'hotels');
    });
    wireSearchFilter('search-hotels', hotelsGrid, 'hotels', renderHotelCard, (item, q) => {
      const campos = [item.nombre, item.municipio, item.estado, item.pais, item.descripcion];
      return campos.some(c => (c || '').toLowerCase().includes(q));
    });
  }

  const carsGrid = document.getElementById('cars-grid');
  if (carsGrid) {
    renderSkeletonGrid(carsGrid, 8, "🚐 Cargando flotilla de vehículos disponibles...");
    fetchTable('vehiculos', (data) => {
      fullData.cars = data;
      renderCards(carsGrid, data, renderCarCard, 'cars');
    });
    wireSearchFilter('search-cars', carsGrid, 'cars', renderCarCard, (item, q) => {
      const campos = [item.tipo_vehiculo, item.nombre_vehiculo, item.marca, item.modelo];
      return campos.some((campo) => (campo || '').toLowerCase().includes(q));
    });
  }

  const productsGrid = document.getElementById('products-grid');
  if (productsGrid) {
    renderSkeletonGrid(productsGrid, 8, "✨ Cargando catálogo de opciones...");
    fetchTable('catalogo_productos', (data) => {
      fullData.products = data;
      renderCards(productsGrid, data, renderProductCard, 'products');
    });
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

/* --- Renderizado genérico (guarda "type" para que el modal sepa de dónde sacar el item) --- */
function renderCards(container, items, templateFn, type) {
  lastRendered[type] = items;

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

/* --- Construye URL de imagen alojada en AppSheet a partir del nombre de archivo crudo --- */
function buildAppSheetImageUrl(appId, tableName, rutaRelativa) {
  if (!rutaRelativa) return null;
  return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appId)}&tableName=${encodeURIComponent(tableName)}&fileName=${encodeURIComponent(rutaRelativa)}`;
}

/* --- Recolecta TODAS las imágenes de un item (imagen1, imagen2, imagen3...) ---
   Extensible: si mañana agregas "imagen4" o "imagen5" en AppSheet, no hay que
   tocar código, solo sube maxImages si algún día necesitas más de 6. */
function collectImages(item, maxImages = 6) {
  const images = [];
  for (let i = 1; i <= maxImages; i++) {
    const filename = item[`${IMAGE_COLUMN_PREFIX}${i}`];
    if (filename) {
      images.push(buildAppSheetImageUrl(item._appId, item._tableName, filename));
    }
  }
  return images;
}

/* --- Redimensiona/optimiza cualquier URL de imagen a webp liviano ---
   Funciona tanto con URLs de AppSheet como con URLs públicas directas. */
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
function wireSearchFilter(inputId, container, type, templateFn, matchFn) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const items = fullData[type];
    const filtered = !q ? items : items.filter((item) => matchFn(item, q));
    renderCards(container, filtered, templateFn, type);
  });
}

/* ==========================================================================
   CARDS — todas muestran SOLO la imagen principal (imagen1)
   ========================================================================== */

// Catalogo_tours
function renderTourCard(item, index) {
  const images = collectImages(item);
  const imgSrc = images.length ? resizedImage(images[0], 400, 250) : 'https://via.placeholder.com/400x250?text=Sin+Imagen';
  const desc = item.descripcion ? item.descripcion.substring(0, 100) + '...' : 'Sin descripción';

  return `
    <div class="card" data-type="tours" data-index="${index}" style="cursor:pointer;">
      <img src="${imgSrc}" alt="${item.nombre}" loading="lazy" style="height: 200px; object-fit: cover; width: 100%;">
      <div style="padding: 1.25rem; display: flex; flex-direction: column; flex: 1;">
        <span class="eyebrow">${item.categoria || 'Tour'}</span>
        <h3 style="margin-bottom: 0.5rem; font-size: 1.15rem;">${item.nombre}</h3>
        <p style="color: var(--clr-text-muted); font-size: 0.875rem; margin-bottom: 1rem; flex: 1;">${desc}</p>

        ${item.notas ? `<p style="font-size: 0.75rem; color: #eab308; margin-bottom: 0.75rem;">💡 ${item.notas}</p>` : ''}

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--clr-border); padding-top: 0.75rem;">
          <span style="font-weight: 700; color: var(--clr-brand-primary); font-size: 1.2rem;">$${item.precio || 0} MXN</span>
          <a href="https://wa.me/5210000000000?text=Hola,%20me%20interesa%20el%20tour%20${encodeURIComponent(item.nombre)}" class="btn btn-outline btn-sm" target="_blank" onclick="event.stopPropagation()">Reservar</a>
        </div>
      </div>
    </div>
  `;
}

// Hotel
function renderHotelCard(item, index) {
  const images = collectImages(item);
  const imgSrc = images.length ? resizedImage(images[0], 400, 250) : null;
  const ubicacion = [item.municipio, item.estado, item.pais].filter(Boolean).join(', ') || 'Ubicación no especificada';
  const direccion = [item.calle_numero, item.colonia].filter(Boolean).join(', ');

  return `
    <div class="card" data-type="hotels" data-index="${index}" style="cursor:pointer;">
      ${imgSrc ? `<img src="${imgSrc}" alt="${item.nombre}" loading="lazy" style="height: 200px; object-fit: cover; width: 100%;">` : ''}
      <div style="padding: 1.25rem; display: flex; flex-direction: column; flex: 1;">
        <span class="eyebrow">${item.categoria || 'Hotel'}</span>
        <h3 style="margin-bottom: 0.25rem; font-size: 1.2rem;">${item.nombre}</h3>
        <p style="color: var(--clr-brand-primary); font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem;">📍 ${ubicacion}</p>
        ${direccion ? `<p style="color: var(--clr-text-muted); font-size: 0.75rem; margin-bottom: 0.75rem;">${direccion}</p>` : ''}

        <p style="color: var(--clr-text-muted); font-size: 0.875rem; margin-bottom: 1.25rem; flex: 1;">${item.descripcion || ''}</p>

        <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--clr-border); padding-top: 0.75rem;">
          <a href="cotizar.html" class="btn btn-primary btn-sm" onclick="event.stopPropagation()">Cotizar Estancia</a>
        </div>
      </div>
    </div>
  `;
}

// vehiculos
function renderCarCard(item, index) {
  const images = collectImages(item);
  const imgSrc = images.length ? resizedImage(images[0], 500, 320) : null;

  return `
    <div class="card" data-type="cars" data-index="${index}" style="cursor:pointer;">
      ${imgSrc ? `<img src="${imgSrc}" alt="${item.marca || ''} ${item.modelo || ''}" loading="lazy" style="height: 200px; object-fit: cover; width: 100%;">` : ''}
      <div style="padding: 1.25rem; display: flex; flex-direction: column; flex: 1;">
        <span class="eyebrow">${item.tipo_vehiculo || 'Vehículo'}</span>
        <h3 style="margin-bottom: 0.25rem; font-size: 1.15rem;">${item.nombre_vehiculo || item.modelo}</h3>
        <p style="color: var(--clr-text-muted); font-size: 0.85rem; margin-bottom: 1rem;">${item.marca || ''} ${item.modelo || ''}</p>

        <div style="background: var(--clr-brand-surface); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.85rem; margin-bottom: 1rem;">
          <div>👥 <strong>Capacidad:</strong> ${item.capacidad || 'N/A'} pasajeros</div>
          ${item['km/l'] ? `<div>⛽ <strong>Rendimiento:</strong> ${item['km/l']} km/l</div>` : ''}
        </div>

        <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--clr-border); padding-top: 0.75rem; margin-top: auto;">
          <a href="cotizar.html" class="btn btn-outline btn-sm" onclick="event.stopPropagation()">Solicitar Vehículo</a>
        </div>
      </div>
    </div>
  `;
}

// catalogo_productos
function renderProductCard(item, index) {
  const images = collectImages(item);
  const imgSrc = images.length ? resizedImage(images[0], 400, 250) : 'https://via.placeholder.com/400x250?text=Sin+Imagen';

  return `
    <div class="card" data-type="products" data-index="${index}" style="cursor:pointer;">
      <img src="${imgSrc}" alt="${item.Nombre || ''}" loading="lazy" style="height: 200px; object-fit: cover; width: 100%;">
      <div style="padding: 1.25rem; display: flex; flex-direction: column; flex: 1;">
        <h3 style="margin-bottom: 0.5rem; font-size: 1.15rem;">${item.Nombre || '(Sin nombre)'}</h3>
        <div style="margin-top: auto; border-top: 1px solid var(--clr-border); padding-top: 0.75rem;">
          <span style="font-weight: 700; color: var(--clr-brand-primary); font-size: 1.2rem;">$${item.Precio || 0}</span>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   MODAL DE DETALLES — carga el resto de imágenes SOLO al abrir
   ========================================================================== */

function buildModalContent(type, item) {
  const images = collectImages(item);
  let subtitle = '';
  let description = item.descripcion || '';
  let extraHtml = '';
  let ctaHtml = '';

  if (type === 'tours') {
    subtitle = item.categoria || 'Tour';
    extraHtml = `<p style="font-weight:700; color:var(--clr-brand-primary); font-size:1.3rem; margin-top:1rem;">$${item.precio || 0} MXN</p>`;
    ctaHtml = `<a href="https://wa.me/5210000000000?text=Hola,%20me%20interesa%20el%20tour%20${encodeURIComponent(item.nombre)}" class="btn btn-primary" target="_blank">Reservar por WhatsApp</a>`;
  } else if (type === 'hotels') {
    const ubicacion = [item.municipio, item.estado, item.pais].filter(Boolean).join(', ');
    const direccion = [item.calle_numero, item.colonia].filter(Boolean).join(', ');
    subtitle = `📍 ${ubicacion}`;
    extraHtml = direccion ? `<p style="color:var(--clr-text-muted); font-size:0.85rem;">${direccion}</p>` : '';
    ctaHtml = `<a href="cotizar.html" class="btn btn-primary">Cotizar Estancia</a>`;
  } else if (type === 'cars') {
    subtitle = item.tipo_vehiculo || 'Vehículo';
    description = `${item.marca || ''} ${item.modelo || ''}`;
    extraHtml = `
      <div style="background: var(--clr-brand-surface); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.9rem; margin-top:1rem;">
        <div>👥 <strong>Capacidad:</strong> ${item.capacidad || 'N/A'} pasajeros</div>
        ${item['km/l'] ? `<div>⛽ <strong>Rendimiento:</strong> ${item['km/l']} km/l</div>` : ''}
      </div>`;
    ctaHtml = `<a href="cotizar.html" class="btn btn-primary">Solicitar Vehículo</a>`;
  } else if (type === 'products') {
    extraHtml = `<p style="font-weight:700; color:var(--clr-brand-primary); font-size:1.3rem; margin-top:1rem;">$${item.Precio || 0}</p>`;
  }

  return {
    title: item.nombre || item.Nombre || item.nombre_vehiculo || '',
    subtitle,
    description,
    extraHtml,
    ctaHtml,
    images
  };
}

function initImageModal() {
  const modalHtml = `
    <div class="modal-backdrop" id="details-modal">
      <div class="modal-window">
        <button class="modal-close" id="modal-close-btn">&times;</button>
        <div class="modal-body">
          <span class="eyebrow" id="modal-subtitle"></span>
          <h2 id="modal-title" style="margin-bottom: 0.75rem;"></h2>
          <img id="modal-main-img" style="width:100%; height:320px; object-fit:cover; border-radius: var(--radius-sm); display:none;">
          <div class="modal-gallery" id="modal-gallery"></div>
          <p id="modal-description" style="color:var(--clr-text-muted); margin-top:1rem;"></p>
          <div id="modal-extra"></div>
          <div id="modal-cta" style="margin-top:1.5rem;"></div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const modal = document.getElementById('details-modal');
  const closeBtn = document.getElementById('modal-close-btn');

  function closeModal() {
    modal.classList.remove('is-open');
    document.body.classList.remove('nav-open');
  }

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Delegación: cualquier card con data-type/data-index abre el modal
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card[data-type]');
    if (!card) return;

    const type = card.dataset.type;
    const index = parseInt(card.dataset.index, 10);
    const item = lastRendered[type] && lastRendered[type][index];
    if (!item) return;

    const content = buildModalContent(type, item);

    document.getElementById('modal-subtitle').textContent = content.subtitle;
    document.getElementById('modal-title').textContent = content.title;
    document.getElementById('modal-description').textContent = content.description;
    document.getElementById('modal-extra').innerHTML = content.extraHtml;
    document.getElementById('modal-cta').innerHTML = content.ctaHtml;

    const mainImg = document.getElementById('modal-main-img');
    const gallery = document.getElementById('modal-gallery');

    if (content.images.length > 0) {
      // Aquí es donde se piden imagen2, imagen3... (SOLO al abrir el modal)
      mainImg.src = resizedImage(content.images[0], 700, 450);
      mainImg.style.display = 'block';

      gallery.innerHTML = content.images.map(src => `
        <img src="${resizedImage(src, 200, 150)}" loading="lazy" data-full="${resizedImage(src, 700, 450)}">
      `).join('');
    } else {
      mainImg.style.display = 'none';
      gallery.innerHTML = '';
    }

    modal.classList.add('is-open');
  });

  document.getElementById('modal-gallery').addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
      document.getElementById('modal-main-img').src = e.target.dataset.full;
    }
  });
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
