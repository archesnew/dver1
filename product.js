/**
 * ДВЕРИ №1 — СТРАНИЦА ТОВАРА (PRODUCT DETAIL PAGE)
 * Полноценная логика PDP в концепции Premium Showroom (V3.2)
 */

(function () {
  'use strict';

  // Состояние страницы
  const pdpState = {
    product: null,
    activeVariantIndex: 0,
    activeSize: '',
    activeOpening: '',
    activeScenario: 'standard_kit_with_hardware',
    wcTurn: false,
    freeMeasure: true,
    activeMainImage: '',
    cart: [],
    scenarioMultipliers: {
      standard_kit_with_hardware: 1.0,
      kit_without_hardware: 0.85,
      leaf_only: 0.65
    }
  };

  // --------------------------------------------------------------------------
  // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  // --------------------------------------------------------------------------

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function resolveImgPath(imgPath, preferHighRes = true) {
    if (!imgPath) return 'door-placeholder.svg';
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) return imgPath;
    if (imgPath.startsWith('data/catalog-output/webp/') || imgPath.startsWith('data/catalog-output/thumbs/')) return imgPath;
    if (imgPath.startsWith('thumbs/') || imgPath.startsWith('webp/')) return 'data/catalog-output/' + imgPath;

    const folder = preferHighRes ? 'webp' : 'thumbs';
    const clean = imgPath
      .replace(/^data\/catalog-output\/(catalog-images|thumbs|webp)\//, '')
      .replace(/^catalog-images\//, '')
      .replace(/^extracted_images\//, '')
      .replace(/\.[^.]+$/, '');

    return `data/catalog-output/${folder}/${clean}.webp`;
  }

  function formatPrice(val) {
    if (!val || isNaN(val) || val <= 0) return 'Уточнить цену';
    return new Intl.NumberFormat('ru-RU').format(Math.round(val)) + ' ₽';
  }

  function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  function showToast(message) {
    let toast = document.getElementById('siteToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'siteToast';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 3200);
  }

  // --------------------------------------------------------------------------
  // РАСЧЁТ ЦЕНЫ
  // --------------------------------------------------------------------------

  function calculateCurrentPrice() {
    const p = pdpState.product;
    if (!p) return null;

    let base = p.price;
    if (!base || isNaN(base) || base <= 0) {
      return null;
    }

    const mult = pdpState.scenarioMultipliers[pdpState.activeScenario] || 1.0;
    let total = base * mult;

    if (pdpState.wcTurn) {
      total += 1850;
    }

    return total;
  }

  function updatePriceDisplay() {
    const priceAmountEl = document.getElementById('pdpPriceAmount');
    const priceSubnoteEl = document.getElementById('pdpPriceSubnote');
    const stickyPriceEl = document.getElementById('stickyPriceVal');

    const total = calculateCurrentPrice();

    if (total !== null) {
      const formatted = formatPrice(total);
      if (priceAmountEl) priceAmountEl.textContent = formatted;
      if (stickyPriceEl) stickyPriceEl.textContent = formatted;
      if (priceSubnoteEl) {
        if (pdpState.activeScenario === 'standard_kit_with_hardware') {
          priceSubnoteEl.textContent = 'Полный комплект: полотно + коробка + наличники + фурнитура';
        } else if (pdpState.activeScenario === 'kit_without_hardware') {
          priceSubnoteEl.textContent = 'Комплект без фурнитуры (полотно + коробка + наличники)';
        } else {
          priceSubnoteEl.textContent = 'Только дверное полотно без погонажных изделий';
        }
      }
    } else {
      const text = 'Уточнить цену';
      if (priceAmountEl) priceAmountEl.textContent = text;
      if (stickyPriceEl) stickyPriceEl.textContent = text;
      if (priceSubnoteEl) {
        priceSubnoteEl.textContent = 'Стоимость рассчитывается индивидуально инженером по спецификации проёмов';
      }
    }
  }

  // --------------------------------------------------------------------------
  // ИНИЦИАЛИЗАЦИЯ И РЕНДЕР ТОВАРА
  // --------------------------------------------------------------------------

  async function initPDP() {
    loadCartFromStorage();
    updateCartCount();

    // Получаем ID товара из URL или hash
    let targetId = getQueryParam('id') || window.location.hash.replace('#', '') || 'PROD-FERR-001';

    // 1. Быстрая прямая загрузка индивидуального JSON товара (~5 KB вместо 3.74 MB)
    try {
      const res = await fetch(`data/products/${encodeURIComponent(targetId)}.json`);
      if (res.ok) {
        const prodData = await res.json();
        pdpState.product = prodData;
        setupProductState(prodData);
        renderProductPage();
        bindGlobalEvents();
        return;
      }
    } catch (e) {
      console.warn(`Не удалось загрузить data/products/${targetId}.json, пробуем fallback:`, e);
    }

    // 2. Fallback: загрузка через products.json
    try {
      const res = await fetch('data/catalog-output/products.json');
      const data = await res.json();
      window.CATALOG_PRODUCTS = data;
      loadTargetProduct(targetId, data);
    } catch (err) {
      console.error('Ошибка загрузки products.json:', err);
      showToast('Не удалось загрузить данные каталога');
    }

    bindGlobalEvents();
  }

  function loadTargetProduct(targetId, products) {
    let found = products.find(p => p.id === targetId);

    // Если не найден по id, пробуем найти по началу
    if (!found) {
      found = products.find(p => p.id && p.id.toUpperCase() === targetId.toUpperCase());
    }

    // Если всё равно не найден, берём дефолтный
    if (!found) {
      found = products.find(p => p.id === 'PROD-FERR-001') || products[0];
    }

    pdpState.product = found;
    setupProductState(found);
    renderProductPage();
  }

  function setupProductState(p) {
    // Начальное изображение
    let mainImg = '';
    if (p.images && p.images.length > 0) {
      mainImg = resolveImgPath(p.images[0]);
    } else {
      mainImg = 'door-placeholder.svg';
    }
    pdpState.activeMainImage = mainImg;

    // Варианты
    pdpState.activeVariantIndex = 0;

    // Размеры
    let sizes = extractProductSizes(p);
    pdpState.activeSize = sizes.length > 0 ? sizes[0] : '2000×800 мм';

    // Сторона открывания
    let openings = extractOpeningOptions(p);
    pdpState.activeOpening = openings.length > 0 ? openings[0] : 'Универсальное';

    // Сценарий комплектации
    pdpState.activeScenario = 'standard_kit_with_hardware';
    pdpState.wcTurn = false;
    pdpState.freeMeasure = true;
  }

  function extractProductSizes(p) {
    const list = [];
    if (p.specs && p.specs.available_sizes) {
      if (Array.isArray(p.specs.available_sizes)) {
        list.push(...p.specs.available_sizes);
      } else if (typeof p.specs.available_sizes === 'string') {
        const parts = p.specs.available_sizes.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        list.push(...parts);
      }
    }
    if (p.variants && p.variants.length > 0) {
      p.variants.forEach(v => {
        if (v.size && !list.includes(v.size)) {
          list.push(v.size);
        }
      });
    }
    // Если список пуст, берем типовые размеры
    if (list.length === 0) {
      if (p.category === 'Входные двери') {
        return ['860×2050 мм', '960×2050 мм', 'Индивидуальный размер'];
      } else {
        return ['2000×600 мм', '2000×700 мм', '2000×800 мм', '2000×900 мм'];
      }
    }
    return [...new Set(list)];
  }

  function extractOpeningOptions(p) {
    const list = [];
    if (p.variants && p.variants.length > 0) {
      p.variants.forEach(v => {
        if (v.opening && !list.includes(v.opening)) {
          list.push(v.opening);
        }
      });
    }
    if (p.specs && p.specs.opening_direction) {
      if (Array.isArray(p.specs.opening_direction)) {
        list.push(...p.specs.opening_direction);
      } else if (typeof p.specs.opening_direction === 'string') {
        list.push(...p.specs.opening_direction.split(/[,;]/).map(s => s.trim()).filter(Boolean));
      }
    }
    const clean = [...new Set(list)].filter(Boolean);
    if (clean.length > 0) return clean;

    if (p.category === 'Входные двери') {
      return ['Левое открывание (наружное)', 'Правое открывание (наружное)'];
    }
    if (p.category === 'Скрытые двери') {
      return ['Direct (на себя)', 'Reverse (от себя)'];
    }
    return ['Универсальное'];
  }

  // --------------------------------------------------------------------------
  // РЕНДЕР ВСЕЙ СТРАНИЦЫ
  // --------------------------------------------------------------------------

  function renderProductPage() {
    const p = pdpState.product;
    if (!p) return;

    // 1. Метаданные и заголовок страницы
    const brandName = p.brand || 'Двери №1';
    const modelName = p.model || 'Модель двери';
    const fullTitle = `${brandName} ${modelName} — Двери №1 Showroom`;
    document.title = fullTitle;

    const metaTitle = document.getElementById('pdpMetaTitle');
    if (metaTitle) metaTitle.textContent = fullTitle;

    const metaDesc = document.getElementById('pdpMetaDesc');
    if (metaDesc && p.description) {
      metaDesc.setAttribute('content', p.description.slice(0, 160));
    }

    // 2. Хлебные крошки
    const bcCat = document.getElementById('bcCategory');
    const bcMod = document.getElementById('bcModel');
    const navCatLink = document.getElementById('navCategoryLink');

    if (bcCat) bcCat.textContent = p.category || 'Межкомнатные двери';
    if (bcMod) bcMod.textContent = modelName;
    if (navCatLink) {
      navCatLink.textContent = p.category || 'Межкомнатные';
      navCatLink.href = `index.html#catalogContent`;
    }

    // 3. Главная фотография и миниатюры
    renderGallery(p);

    // 4. Правая колонка: сведения и выбор
    renderHeroDetails(p);

    // 5. Вкладки описания и деталей
    renderTabOverview(p);
    renderTabSpecs(p);
    renderTabVariants(p);
    renderTabComplect(p);
    renderTabGallery(p);

    // 6. Мобильный нижний бар
    renderStickyBar(p);
  }

  // --------------------------------------------------------------------------
  // ГАЛЕРЕЯ
  // --------------------------------------------------------------------------

  function renderGallery(p) {
    const mainImgEl = document.getElementById('pdpMainImage');
    const thumbsStrip = document.getElementById('pdpThumbnailsStrip');

    if (mainImgEl) {
      mainImgEl.src = pdpState.activeMainImage;
      mainImgEl.alt = `${p.brand || ''} ${p.model || 'Дверь'}`;
      mainImgEl.onerror = function () {
        this.onerror = null;
        this.src = 'door-placeholder.svg';
      };
    }

    if (!thumbsStrip) return;

    // Собираем уникальный список изображений
    const allImgs = [];
    if (p.images && Array.isArray(p.images)) {
      p.images.forEach(img => {
        const resolved = resolveImgPath(img);
        if (!allImgs.includes(resolved)) allImgs.push(resolved);
      });
    }
    if (p.variants && Array.isArray(p.variants)) {
      p.variants.forEach(v => {
        if (v.image) {
          const resolved = resolveImgPath(v.image);
          if (!allImgs.includes(resolved)) allImgs.push(resolved);
        }
      });
    }

    if (allImgs.length === 0) {
      allImgs.push('door-placeholder.svg');
    }

    thumbsStrip.innerHTML = allImgs.map((imgSrc, idx) => {
      const isActive = imgSrc === pdpState.activeMainImage ? 'active' : '';
      return `
        <button type="button" class="pdp-thumb-btn ${isActive}" data-src="${imgSrc}" title="Фотография ${idx + 1}">
          <img src="${imgSrc}" alt="Миниатюра ${idx + 1}" class="pdp-thumb-img" onerror="this.onerror=null; this.src='door-placeholder.svg';">
        </button>
      `;
    }).join('');

    // Навешиваем клик на миниатюры
    thumbsStrip.querySelectorAll('.pdp-thumb-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const src = btn.getAttribute('data-src');
        pdpState.activeMainImage = src;
        if (mainImgEl) mainImgEl.src = src;

        thumbsStrip.querySelectorAll('.pdp-thumb-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Зум / Лайтбокс
    const photoCard = document.getElementById('pdpPhotoCard');
    const zoomBtn = document.getElementById('pdpZoomBtn');

    if (photoCard) {
      photoCard.onclick = (e) => {
        openLightbox(pdpState.activeMainImage, `${p.brand || ''} ${p.model || ''}`);
      };
    }
  }

  // --------------------------------------------------------------------------
  // ПРАВАЯ КОЛОНКА ХАРАКТЕРИСТИК И ВЫБОРА
  // --------------------------------------------------------------------------

  function renderHeroDetails(p) {
    const brandKicker = document.getElementById('pdpBrandKicker');
    const modelTitle = document.getElementById('pdpModelTitle');
    const leadDesc = document.getElementById('pdpLeadDesc');

    const brandStr = p.brand || 'Фабричное производство';
    const collStr = p.collection ? ` • Коллекция «${p.collection}»` : '';
    if (brandKicker) brandKicker.textContent = `${brandStr}${collStr}`;

    if (modelTitle) modelTitle.textContent = p.model || 'Дверное полотно';

    if (leadDesc) {
      if (p.description) {
        leadDesc.textContent = p.description;
      } else {
        leadDesc.textContent = `Архитектурная конструкция ${p.category ? p.category.toLowerCase() : 'двери'} с высокоточной заводской врезкой, улучшенной звукоизоляцией и премиальными покрытиями.`;
      }
    }

    // 1. Исполнение / Отделка (Варианты)
    renderExecutionPills(p);

    // 2. Размеры
    renderSizePills(p);

    // 3. Открывание
    renderOpeningPills(p);

    // 4. Сценарии комплектации
    setupScenarioOptions();

    // 5. Чекбоксы доп. опций
    setupExtraAddons();

    // 6. Цены
    updatePriceDisplay();

    // 7. Кнопки добавления в корзину и заявки
    const btnAddCart = document.getElementById('btnAddToCart');
    if (btnAddCart) {
      btnAddCart.onclick = () => addCurrentProductToCart();
    }

    // 8. Мессенджеры и быстрый замер (Sprint 2)
    if (window.DVER_CONFIG) {
      const msg = window.DVER_CONFIG.getProductInquiryText(p);
      const btnWa = document.getElementById('pdpBtnWhatsApp');
      if (btnWa) btnWa.href = window.DVER_CONFIG.getWhatsAppUrl(msg);
      const btnTg = document.getElementById('pdpBtnTelegram');
      if (btnTg) btnTg.href = window.DVER_CONFIG.getTelegramUrl(msg);
    }
    const btnMeasure = document.getElementById('pdpBtnMeasure');
    if (btnMeasure) {
      btnMeasure.onclick = () => {
        if (window.DverLeads) {
          window.DverLeads.openLeadModal({
            product: p,
            source: 'Страница товара — Вызов замерщика'
          });
        }
      };
    }
  }

  function getVariantDisplayName(v, p) {
    if (!v) return 'Базовая отделка';
    if (v.name) {
      if (v.name.includes('Глухая') || v.name.includes('(ДГ)')) return 'Глухое полотно (ДГ)';
      if (v.name.includes('Остекленная') || v.name.includes('(ДО)')) return 'Остекленное полотно (ДО)';
    }
    if (v.color && v.color !== 'ПВХ декор по каталогу') {
      return v.color;
    }
    if (v.name && v.name !== p.model) {
      let clean = v.name
        .replace(p.model, '')
        .replace(/\d+х\d+\s*(мм)?/gi, '')
        .replace(/\(Левое\)|\(Правое\)|Левое|Правое/gi, '')
        .replace(/[,\(\)]/g, '')
        .trim();
      if (clean) return clean;
    }
    return v.color || 'Базовое исполнение';
  }

  function renderExecutionPills(p) {
    const group = document.getElementById('groupExecution');
    const wrap = document.getElementById('executionPillsWrap');
    const label = document.getElementById('selectedExecutionVal');

    if (!group || !wrap) return;

    if (!p.variants || p.variants.length === 0) {
      const defaultColor = (p.specs && p.specs.color) ? p.specs.color : 'Базовая отделка по каталогу';
      if (label) label.textContent = defaultColor;
      wrap.innerHTML = `<button type="button" class="pdp-pill-btn active">${escapeHtml(defaultColor)}</button>`;
      return;
    }

    group.style.display = 'block';

    // Собираем уникальные стили отделки
    const distinctMap = new Map();
    p.variants.forEach((v, idx) => {
      const dispName = getVariantDisplayName(v, p);
      if (!distinctMap.has(dispName)) {
        distinctMap.set(dispName, {
          displayName: dispName,
          firstIndex: idx,
          variant: v,
          indices: [idx]
        });
      } else {
        distinctMap.get(dispName).indices.push(idx);
      }
    });

    const distinctList = Array.from(distinctMap.values());

    // Определяем текущий активный стиль
    const currentV = p.variants[pdpState.activeVariantIndex] || p.variants[0];
    const currentDispName = getVariantDisplayName(currentV, p);

    if (label) {
      label.textContent = currentDispName;
    }

    wrap.innerHTML = distinctList.map((item) => {
      const isActive = item.indices.includes(pdpState.activeVariantIndex) || item.displayName === currentDispName ? 'active' : '';
      return `
        <button type="button" class="pdp-pill-btn ${isActive}" data-dispname="${escapeHtml(item.displayName)}" data-firstindex="${item.firstIndex}">
          <span>${escapeHtml(item.displayName)}</span>
        </button>
      `;
    }).join('');

    wrap.querySelectorAll('.pdp-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dName = btn.getAttribute('data-dispname');
        const firstIdx = parseInt(btn.getAttribute('data-firstindex'), 10);
        const itemInfo = distinctMap.get(dName);

        // Ищем вариант с этим стилем и текущим выбранным размером
        let matchedIdx = firstIdx;
        if (itemInfo && itemInfo.indices) {
          const matchBySize = itemInfo.indices.find(i => {
            const v = p.variants[i];
            return v && v.size === pdpState.activeSize;
          });
          if (matchBySize !== undefined) matchedIdx = matchBySize;
        }

        pdpState.activeVariantIndex = matchedIdx;

        wrap.querySelectorAll('.pdp-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (label) label.textContent = dName;

        const selectedV = p.variants[matchedIdx];
        if (selectedV && selectedV.image) {
          const newImg = resolveImgPath(selectedV.image);
          pdpState.activeMainImage = newImg;
          const mainImgEl = document.getElementById('pdpMainImage');
          if (mainImgEl) mainImgEl.src = newImg;

          // Подсвечиваем в миниатюрах
          const thumbsStrip = document.getElementById('pdpThumbnailsStrip');
          if (thumbsStrip) {
            thumbsStrip.querySelectorAll('.pdp-thumb-btn').forEach(b => {
              if (b.getAttribute('data-src') === newImg) {
                b.classList.add('active');
              } else {
                b.classList.remove('active');
              }
            });
          }
        }

        updatePriceDisplay();
        renderStickyBar(p);
      });
    });
  }

  function renderSizePills(p) {
    const wrap = document.getElementById('sizePillsWrap');
    const label = document.getElementById('selectedSizeVal');
    if (!wrap) return;

    const sizes = extractProductSizes(p);
    if (!pdpState.activeSize && sizes.length > 0) {
      pdpState.activeSize = sizes[0];
    }
    if (label) label.textContent = pdpState.activeSize;

    wrap.innerHTML = sizes.map(sz => {
      const isActive = sz === pdpState.activeSize ? 'active' : '';
      return `
        <button type="button" class="pdp-pill-btn ${isActive}" data-size="${escapeHtml(sz)}">
          <span>${escapeHtml(sz)}</span>
        </button>
      `;
    }).join('');

    wrap.querySelectorAll('.pdp-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sz = btn.getAttribute('data-size');
        pdpState.activeSize = sz;
        if (label) label.textContent = sz;

        wrap.querySelectorAll('.pdp-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        renderStickyBar(p);
      });
    });
  }

  function renderOpeningPills(p) {
    const group = document.getElementById('groupOpening');
    const wrap = document.getElementById('openingPillsWrap');
    const label = document.getElementById('selectedOpeningVal');
    if (!group || !wrap) return;

    const openings = extractOpeningOptions(p);

    if (openings.length <= 1 && openings[0] === 'Универсальное') {
      group.style.display = 'none';
      pdpState.activeOpening = 'Универсальное';
      return;
    }

    group.style.display = 'block';

    if (!pdpState.activeOpening && openings.length > 0) {
      pdpState.activeOpening = openings[0];
    }
    if (label) label.textContent = pdpState.activeOpening;

    wrap.innerHTML = openings.map(op => {
      const isActive = op === pdpState.activeOpening ? 'active' : '';
      return `
        <button type="button" class="pdp-pill-btn ${isActive}" data-opening="${escapeHtml(op)}">
          <span>${escapeHtml(op)}</span>
        </button>
      `;
    }).join('');

    wrap.querySelectorAll('.pdp-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const op = btn.getAttribute('data-opening');
        pdpState.activeOpening = op;
        if (label) label.textContent = op;

        wrap.querySelectorAll('.pdp-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        renderStickyBar(p);
      });
    });
  }

  function setupScenarioOptions() {
    const scenarioList = document.getElementById('scenarioOptionsList');
    if (!scenarioList) return;

    scenarioList.querySelectorAll('.scenario-option-card').forEach(card => {
      const input = card.querySelector('input[type="radio"]');
      if (!input) return;

      input.addEventListener('change', () => {
        if (input.checked) {
          pdpState.activeScenario = input.value;
          scenarioList.querySelectorAll('.scenario-option-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          updatePriceDisplay();
        }
      });
    });
  }

  function setupExtraAddons() {
    const chkWc = document.getElementById('checkWcTurn');
    const chkMeasure = document.getElementById('checkFreeMeasure');

    if (chkWc) {
      chkWc.checked = pdpState.wcTurn;
      chkWc.onchange = () => {
        pdpState.wcTurn = chkWc.checked;
        updatePriceDisplay();
      };
    }

    if (chkMeasure) {
      chkMeasure.checked = pdpState.freeMeasure;
      chkMeasure.onchange = () => {
        pdpState.freeMeasure = chkMeasure.checked;
      };
    }
  }

  // --------------------------------------------------------------------------
  // ТАБЫ И ДЕТАЛЬНЫЕ РАЗДЕЛЫ
  // --------------------------------------------------------------------------

  function renderTabOverview(p) {
    const fullDescEl = document.getElementById('pdpFullDesc');
    const keyPointsEl = document.getElementById('pdpKeyPoints');

    if (fullDescEl) {
      let descText = p.description || '';
      if (!descText) {
        descText = `Модель ${escapeHtml(p.model)} от фабрики ${escapeHtml(p.brand || 'Двери №1')} воплощает актуальные тенденции архитектурного дизайна и безупречное качество заводского изготовления. Инженерная конструкция спроектирована для интенсивной эксплуатации с сохранением идеальной геометрии на протяжении десятилетий.`;
      }
      fullDescEl.innerHTML = `<p>${escapeHtml(descText)}</p>`;
    }

    if (keyPointsEl) {
      const points = [];
      if (p.specs && p.specs.construction) points.push(`<strong>Конструкция полотна:</strong> ${escapeHtml(p.specs.construction)}`);
      if (p.specs && p.specs.material) points.push(`<strong>Материал основы:</strong> ${escapeHtml(p.specs.material)}`);
      if (p.specs && p.specs.coating) points.push(`<strong>Защитное покрытие:</strong> ${escapeHtml(p.specs.coating)}`);
      if (p.complectation && p.complectation.hinges) points.push(`<strong>Петли:</strong> ${escapeHtml(p.complectation.hinges)}`);
      if (p.complectation && p.complectation.locks) points.push(`<strong>Замковая система:</strong> ${escapeHtml(p.complectation.locks)}`);

      if (points.length === 0) {
        points.push('<strong>Заводская сборка:</strong> прецизионная геометрия полотен');
        points.push('<strong>Шумоизоляция:</strong> уплотнитель по периметру короба');
        points.push('<strong>Фурнитура:</strong> бесшумные магнитные замки');
      }

      keyPointsEl.innerHTML = points.map(pt => `<div class="key-point-item">${pt}</div>`).join('');
    }
  }

  function renderTabSpecs(p) {
    const specsTable = document.getElementById('pdpSpecsTable');
    if (!specsTable) return;

    const rows = [];

    function addRow(label, val) {
      if (val !== null && val !== undefined && val !== '' && val !== 'None') {
        let textVal = Array.isArray(val) ? val.join(', ') : String(val);
        rows.push(`
          <div class="spec-row">
            <span class="spec-name">${escapeHtml(label)}</span>
            <span class="spec-val">${escapeHtml(textVal)}</span>
          </div>
        `);
      }
    }

    addRow('Производитель', p.brand);
    addRow('Коллекция', p.collection);
    addRow('Модель', p.model);
    addRow('Категория', p.category);

    if (p.specs) {
      addRow('Тип полотна', p.specs.door_type);
      addRow('Конструкция', p.specs.construction);
      addRow('Материал основы', p.specs.material);
      addRow('Внешнее покрытие', p.specs.coating);
      addRow('Базовый цвет', p.specs.color);
      addRow('Текстура отделки', p.specs.texture);
      addRow('Остекление', p.specs.glass);
      addRow('Декоративные элементы', p.specs.decor);
      addRow('Стиль', p.specs.style);
      addRow('Доступные размеры', p.specs.available_sizes);
      addRow('Направление открывания', p.specs.opening_direction);

      if (p.specs.other_specs && typeof p.specs.other_specs === 'object') {
        Object.entries(p.specs.other_specs).forEach(([k, v]) => {
          addRow(k, v);
        });
      }
    }

    if (p.complectation) {
      addRow('Дверное полотно', p.complectation.leaf);
      addRow('Коробочный брус', p.complectation.frame);
      addRow('Наличники', p.complectation.casing);
      addRow('Доборные элементы', p.complectation.extensions);
      addRow('Петлевая группа', p.complectation.hinges);
      addRow('Замки и безопасность', p.complectation.locks);
      addRow('Ручки и завертки', p.complectation.handles);
      addRow('Дополнительная фурнитура', p.complectation.other_hardware);
    }

    addRow('Артикул фабрики', p.article);
    addRow('Гарантия производителя', 'До 5 лет на конструктив и покрытие');

    specsTable.innerHTML = rows.join('');
  }

  function renderTabVariants(p) {
    const grid = document.getElementById('pdpVariantsCardsGrid');
    if (!grid) return;

    if (!p.variants || p.variants.length === 0) {
      grid.innerHTML = `
        <div class="no-variants-notice" style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: 6px;">
          Для данной модели предусмотрено единое базовое заводское исполнение с широким выбором погонажа.
        </div>
      `;
      return;
    }

    grid.innerHTML = p.variants.map((v, idx) => {
      const vImg = resolveImgPath(v.image || (p.images && p.images[0]));
      const vName = v.name || `${p.model} (Вариант ${idx + 1})`;
      const vColor = v.color || 'По каталогу';
      const vSize = v.size || '2000×800 мм';
      const vOpen = v.opening || 'Универсальное';

      return `
        <div class="variant-item-card">
          <div class="variant-item-img-box">
            <img src="${vImg}" alt="${escapeHtml(vName)}" class="variant-item-img" onerror="this.onerror=null; this.src='door-placeholder.svg';">
          </div>
          <div class="variant-item-body">
            <div class="variant-item-title">${escapeHtml(vName)}</div>
            <div class="variant-item-specs">
              <div><strong>Отделка:</strong> ${escapeHtml(vColor)}</div>
              <div><strong>Размер:</strong> ${escapeHtml(vSize)}</div>
              <div><strong>Открывание:</strong> ${escapeHtml(vOpen)}</div>
            </div>
            <button type="button" class="btn-select-variant" data-vidx="${idx}">
              Выбрать этот вариант
            </button>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.btn-select-variant').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-vidx'), 10);
        pdpState.activeVariantIndex = idx;

        // Перерисовываем pills
        renderExecutionPills(p);

        // Обновляем фото
        const selV = p.variants[idx];
        if (selV && selV.image) {
          const img = resolveImgPath(selV.image);
          pdpState.activeMainImage = img;
          const mainImgEl = document.getElementById('pdpMainImage');
          if (mainImgEl) mainImgEl.src = img;
        }

        // Прокручиваем к первому экрану
        window.scrollTo({ top: 120, behavior: 'smooth' });
        showToast('Вариант выбран');
      });
    });
  }

  function renderTabComplect(p) {
    const container = document.getElementById('pdpComplectBreakdown');
    if (!container) return;

    const comp = p.complectation || {};

    const items = [
      {
        title: 'Дверное полотно',
        desc: comp.leaf || 'Каркасно-щитовая или царговая конструкция с прецизионной геометрией и шумопоглощающим заполнением.',
        icon: '🚪'
      },
      {
        title: 'Коробочный брус',
        desc: comp.frame || 'Телескопический короб с шумоизоляционным пазовым уплотнителем для бесшумного притвора.',
        icon: '📐'
      },
      {
        title: 'Наличники телескопические',
        desc: comp.casing || 'Г-образные наличники для монтажа без видимых гвоздей и саморезов. 2.5 или 5 штук на блок.',
        icon: '🖼️'
      },
      {
        title: 'Доборные элементы',
        desc: comp.extensions || 'Телескопические доборы шириной 100, 150 или 200 мм под толщину стен проема заказчика.',
        icon: '📏'
      },
      {
        title: 'Петлевая группа',
        desc: comp.hinges || 'Скрытые 3D-регулируемые петли (Италия/Германия) или усиленные накладные подшипниковые петли.',
        icon: '⚙️'
      },
      {
        title: 'Замковая система и ручки',
        desc: comp.locks || 'Бесшумный магнитный замок с ответной планкой и нажимная ручка из монолитного сплава ZAMAK.',
        icon: '🔒'
      }
    ];

    container.innerHTML = items.map(item => `
      <div class="complect-item-card">
        <div class="complect-icon-box">${item.icon}</div>
        <div class="complect-content">
          <h4 class="complect-card-title">${escapeHtml(item.title)}</h4>
          <p class="complect-card-desc">${escapeHtml(item.desc)}</p>
        </div>
      </div>
    `).join('');
  }

  function renderTabGallery(p) {
    const galleryGrid = document.getElementById('pdpInteriorGallery');
    if (!galleryGrid) return;

    const imgs = [];
    if (p.images && Array.isArray(p.images)) {
      p.images.forEach(img => {
        const resolved = resolveImgPath(img);
        if (!imgs.includes(resolved)) imgs.push(resolved);
      });
    }

    if (imgs.length <= 1) {
      galleryGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: 6px;">
          Интерьерные рендеры и полноразмерные чертежи доступны в нашем выставочном шоуруме и каталогах фабрики.
        </div>
      `;
      return;
    }

    galleryGrid.innerHTML = imgs.map((imgSrc, idx) => `
      <div class="interior-gallery-item" data-src="${imgSrc}">
        <img src="${imgSrc}" alt="Интерьерное фото ${idx + 1}" class="interior-gallery-img" onerror="this.onerror=null; this.src='door-placeholder.svg';">
        <div class="gallery-item-overlay">
          <span>Нажмите для увеличения</span>
        </div>
      </div>
    `).join('');

    galleryGrid.querySelectorAll('.interior-gallery-item').forEach(item => {
      item.addEventListener('click', () => {
        const src = item.getAttribute('data-src');
        openLightbox(src, `${p.brand || ''} ${p.model || ''}`);
      });
    });
  }

  // --------------------------------------------------------------------------
  // МОБИЛЬНЫЙ СТИКИ-БАР
  // --------------------------------------------------------------------------

  function renderStickyBar(p) {
    const stickyName = document.getElementById('stickyModelName');
    const stickyPrice = document.getElementById('stickyPriceVal');
    const btnStickyCart = document.getElementById('btnStickyCart');

    if (stickyName) {
      let vTitle = '';
      if (p.variants && p.variants[pdpState.activeVariantIndex]) {
        vTitle = ` (${p.variants[pdpState.activeVariantIndex].color || ''})`;
      }
      stickyName.textContent = `${p.model || 'Дверь'}${vTitle}`;
    }

    const currentPrice = calculateCurrentPrice();
    if (stickyPrice) {
      stickyPrice.textContent = currentPrice ? formatPrice(currentPrice) : 'Уточнить цену';
    }

    if (btnStickyCart) {
      btnStickyCart.onclick = () => addCurrentProductToCart();
    }
  }

  // --------------------------------------------------------------------------
  // КОРЗИНА И СПЕЦИФИКАЦИЯ
  // --------------------------------------------------------------------------

  function loadCartFromStorage() {
    if (window.CartStore) {
      pdpState.cart = window.CartStore.getCart();
    } else {
      try {
        const saved = localStorage.getItem('DVER1_CART');
        pdpState.cart = saved ? JSON.parse(saved) : [];
      } catch (e) {
        pdpState.cart = [];
      }
    }
  }

  function saveCartToStorage() {
    if (window.CartStore) {
      window.CartStore.setCart(pdpState.cart);
    } else {
      try {
        localStorage.setItem('DVER1_CART', JSON.stringify(pdpState.cart));
      } catch (e) {
        console.error('Ошибка сохранения корзины:', e);
      }
    }
  }

  function updateCartCount() {
    const cart = window.CartStore ? window.CartStore.getCart() : pdpState.cart;
    const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

    const headerBadge = document.getElementById('headerCartCount');
    if (headerBadge) {
      headerBadge.textContent = count;
      headerBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    const modalBadge = document.getElementById('cartModalCount');
    if (modalBadge) {
      modalBadge.textContent = `${count} поз.`;
    }
  }

  function addCurrentProductToCart() {
    const p = pdpState.product;
    if (!p) return;

    let vName = 'Базовое';
    let vImg = pdpState.activeMainImage;
    if (p.variants && p.variants[pdpState.activeVariantIndex]) {
      const v = p.variants[pdpState.activeVariantIndex];
      vName = v.color || v.name || 'Вариант ' + (pdpState.activeVariantIndex + 1);
      if (v.image) vImg = resolveImgPath(v.image);
    }

    const price = calculateCurrentPrice();
    const scenarioTitles = {
      standard_kit_with_hardware: 'Полный комплект с фурнитурой',
      kit_without_hardware: 'Комплект без фурнитуры',
      leaf_only: 'Только полотно'
    };

    const cartItem = {
      id: `${p.id}-${pdpState.activeVariantIndex}-${pdpState.activeSize}-${pdpState.activeScenario}-${pdpState.activeOpening}`,
      productId: p.id,
      brand: p.brand || 'Двери №1',
      model: p.model || 'Модель двери',
      title: p.model || 'Модель двери',
      collection: p.collection || '',
      article: p.article || '',
      variant: vName,
      size: pdpState.activeSize,
      opening: pdpState.activeOpening,
      scenario: pdpState.activeScenario,
      scenarioTitle: scenarioTitles[pdpState.activeScenario] || 'Комплект',
      hardware: pdpState.wcTurn ? 'С сантехническим фиксатором (WC)' : 'Базовая ручка с магнитным замком',
      wcTurn: pdpState.wcTurn,
      unitPrice: price,
      isPriceKnown: (typeof price === 'number' && price > 0),
      image: vImg,
      quantity: 1
    };

    if (window.CartStore) {
      window.CartStore.addItem(cartItem);
      pdpState.cart = window.CartStore.getCart();
    } else {
      const existingIndex = pdpState.cart.findIndex(i => i.id === cartItem.id);
      if (existingIndex >= 0) {
        pdpState.cart[existingIndex].quantity += 1;
      } else {
        pdpState.cart.push(cartItem);
      }
      saveCartToStorage();
    }

    updateCartCount();
    showToast(`«${p.model}» добавлена в корзину`);
    openCartModal();
  }

  function renderCartModal() {
    const listEl = document.getElementById('cartItemsList');
    const totalEl = document.getElementById('cartTotalAmount');
    if (!listEl) return;

    if (pdpState.cart.length === 0) {
      listEl.innerHTML = `
        <div class="empty-cart-msg">
          <p style="font-size: 1.125rem; font-family: var(--font-display); font-weight: 600; margin-bottom: 8px;">Ваша спецификация пока пуста</p>
          <p style="color: var(--text-muted); font-size: 0.875rem;">Выберите модель в каталоге или нажмите кнопку «В корзину».</p>
        </div>
      `;
      if (totalEl) totalEl.textContent = '0 ₽';
      return;
    }

    let totalPrice = 0;
    let hasQuotePrice = false;

    listEl.innerHTML = pdpState.cart.map((item, idx) => {
      if (item.price && !isNaN(item.price)) {
        totalPrice += item.price * (item.quantity || 1);
      } else {
        hasQuotePrice = true;
      }

      const isKnown = item.isPriceKnown || (typeof item.unitPrice === 'number' && item.unitPrice > 0) || (typeof item.price === 'number' && item.price > 0);
      const priceVal = typeof item.unitPrice === 'number' ? item.unitPrice : item.price;

      if (isKnown && priceVal > 0) {
        totalPrice += priceVal * (item.quantity || 1);
      } else {
        hasQuotePrice = true;
      }

      const priceStr = isKnown ? formatPrice(priceVal) : 'Цена уточняется';

      return `
        <div class="cart-item-row" data-cart-id="${escapeHtml(item.id)}">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.model)}" class="cart-item-thumb" onerror="this.onerror=null; this.src='door-placeholder.svg';">
          <div class="cart-item-info">
            <div class="cart-item-brand">${escapeHtml(item.brand)}</div>
            <div class="cart-item-title">${escapeHtml(item.model)}</div>
            <div class="cart-item-details">
              <span>${escapeHtml(item.variant)}</span> • 
              <span>${escapeHtml(item.size)}</span> • 
              <span>${escapeHtml(item.opening)}</span>
              ${item.wcTurn ? ' • <span style="color: var(--color-terracotta);">+WC фиксатор</span>' : ''}
            </div>
            <div class="cart-item-price">${priceStr}</div>
          </div>
          <div class="cart-item-controls">
            <div class="cart-qty-picker">
              <button type="button" class="btn-qty-minus" data-idx="${idx}" data-id="${escapeHtml(item.id)}">−</button>
              <span class="qty-val">${item.quantity || 1}</span>
              <button type="button" class="btn-qty-plus" data-idx="${idx}" data-id="${escapeHtml(item.id)}">+</button>
            </div>
            <button type="button" class="btn-remove-item" data-idx="${idx}" data-id="${escapeHtml(item.id)}" title="Удалить позицию">✕</button>
          </div>
        </div>
      `;
    }).join('');

    if (totalEl) {
      if (totalPrice > 0) {
        totalEl.textContent = formatPrice(totalPrice) + (hasQuotePrice ? ' + по уточнению' : '');
      } else {
        totalEl.textContent = 'Индивидуальная смета фабрики';
      }
    }

    // Обработчики кнопок количества
    listEl.querySelectorAll('.btn-qty-minus').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        if (window.CartStore) {
          window.CartStore.updateQuantity(id, -1);
          pdpState.cart = window.CartStore.getCart();
        } else {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          if (pdpState.cart[idx]) {
            pdpState.cart[idx].quantity -= 1;
            if (pdpState.cart[idx].quantity <= 0) pdpState.cart.splice(idx, 1);
            saveCartToStorage();
          }
        }
        updateCartCount();
        renderCartModal();
      };
    });

    listEl.querySelectorAll('.btn-qty-plus').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        if (window.CartStore) {
          window.CartStore.updateQuantity(id, 1);
          pdpState.cart = window.CartStore.getCart();
        } else {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          if (pdpState.cart[idx]) {
            pdpState.cart[idx].quantity += 1;
            saveCartToStorage();
          }
        }
        updateCartCount();
        renderCartModal();
      };
    });

    listEl.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        if (window.CartStore) {
          window.CartStore.removeItem(id);
          pdpState.cart = window.CartStore.getCart();
        } else {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          pdpState.cart.splice(idx, 1);
          saveCartToStorage();
        }
        updateCartCount();
        renderCartModal();
      };
    });
  }

  function openCartModal() {
    renderCartModal();
    const modal = document.getElementById('cartModal');
    if (modal) {
      modal.classList.add('open');
      modal.classList.add('visible');
    }
  }

  function closeCartModal() {
    const modal = document.getElementById('cartModal');
    if (modal) {
      modal.classList.remove('open');
      modal.classList.remove('visible');
    }
  }

  // --------------------------------------------------------------------------
  // МОДАЛЬНОЕ ОКНО КОНСУЛЬТАЦИИ / ЗАЯВКИ
  // --------------------------------------------------------------------------

  function openConsultModal(sourceTitle) {
    const modal = document.getElementById('consultModal');
    const previewEl = document.getElementById('consultItemPreview');
    const p = pdpState.product;

    if (previewEl && p) {
      let vName = 'Базовая отделка';
      if (p.variants && p.variants[pdpState.activeVariantIndex]) {
        vName = p.variants[pdpState.activeVariantIndex].color || p.variants[pdpState.activeVariantIndex].name;
      }
      previewEl.innerHTML = `
        <div style="font-weight: 600; font-size: 0.9375rem; color: var(--color-deep-graphite);">${escapeHtml(p.brand || '')} ${escapeHtml(p.model || '')}</div>
        <div style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 2px;">
          Отделка: ${escapeHtml(vName)} | Размер: ${escapeHtml(pdpState.activeSize)} | ${escapeHtml(pdpState.activeOpening)}
        </div>
      `;
    }

    if (modal) {
      modal.classList.add('open');
      modal.classList.add('visible');
    }
  }

  function closeConsultModal() {
    const modal = document.getElementById('consultModal');
    if (modal) {
      modal.classList.remove('open');
      modal.classList.remove('visible');
    }
  }

  function openCheckoutModal() {
    closeCartModal();
    openConsultModal('Оформление спецификации из корзины');
  }

  // --------------------------------------------------------------------------
  // ЛАЙТБОКС
  // --------------------------------------------------------------------------

  function openLightbox(src, caption) {
    const lb = document.getElementById('pdpLightbox');
    const img = document.getElementById('lightboxImg');
    const cap = document.getElementById('lightboxCaption');

    if (!lb || !img) return;

    img.src = src;
    img.alt = caption || 'Изображение двери';
    if (cap) cap.textContent = caption || '';

    lb.classList.add('open');
    lb.classList.add('visible');
  }

  function closeLightbox() {
    const lb = document.getElementById('pdpLightbox');
    if (lb) {
      lb.classList.remove('open');
      lb.classList.remove('visible');
    }
  }

  // --------------------------------------------------------------------------
  // ГЛОБАЛЬНЫЕ СОБЫТИЯ
  // --------------------------------------------------------------------------

  function bindGlobalEvents() {
    // Табы
    document.querySelectorAll('.pdp-tab-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');

        document.querySelectorAll('.pdp-tab-nav-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.pdp-tab-panel').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        const panel = document.getElementById(targetTab);
        if (panel) panel.classList.add('active');
      });
    });

    // Кнопка корзины в шапке
    const btnCartHeader = document.getElementById('btnCartHeader');
    if (btnCartHeader) {
      btnCartHeader.addEventListener('click', openCartModal);
    }

    // Закрытие корзины
    const btnCloseCart = document.getElementById('btnCloseCart');
    if (btnCloseCart) {
      btnCloseCart.addEventListener('click', closeCartModal);
    }

    // Закрытие модального окна консультации
    const btnCloseConsult = document.getElementById('btnCloseConsult');
    if (btnCloseConsult) {
      btnCloseConsult.addEventListener('click', closeConsultModal);
    }

    // Закрытие лайтбокса
    const btnCloseLightbox = document.getElementById('btnCloseLightbox');
    if (btnCloseLightbox) {
      btnCloseLightbox.addEventListener('click', closeLightbox);
    }
    const lightboxOverlay = document.getElementById('pdpLightbox');
    if (lightboxOverlay) {
      lightboxOverlay.addEventListener('click', (e) => {
        if (e.target === lightboxOverlay) closeLightbox();
      });
    }

    // Форма консультации
    const consultForm = document.getElementById('consultForm');
    if (consultForm) {
      consultForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('consultName').value;
        const phone = document.getElementById('consultPhone').value;
        const city = document.getElementById('consultCity').value;
        const comment = document.getElementById('consultComment').value;

        // Сохраняем лид
        const lead = {
          name,
          phone,
          city,
          comment,
          productId: pdpState.product ? pdpState.product.id : '',
          productName: pdpState.product ? pdpState.product.model : '',
          timestamp: new Date().toISOString()
        };

        try {
          const leads = JSON.parse(localStorage.getItem('DVER1_LEADS') || '[]');
          leads.push(lead);
          localStorage.setItem('DVER1_LEADS', JSON.stringify(leads));
        } catch (err) {
          console.error(err);
        }

        showToast('Заявка принята! Менеджер свяжется с вами в течение 15 минут.');
        consultForm.reset();
        setTimeout(() => {
          closeConsultModal();
        }, 1200);
      });
    }

    // Закрытие по ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCartModal();
        closeConsultModal();
        closeLightbox();
        if (window.closeMobileMenu) window.closeMobileMenu();
      }
    });

    // Инициализация мобильного меню и эффекта стекла при скролле
    initHeaderMenu();
    initHeaderScrollEffect();
  }

  function initHeaderMenu() {
    const toggleBtn = document.getElementById('mobileMenuBtn');
    const panel = document.getElementById('mobileNavPanel');
    const overlay = document.getElementById('mobileGlassOverlay');
    if (!toggleBtn || !panel) return;

    function closeMenu() {
      toggleBtn.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      if (overlay) overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    function toggleMenu() {
      const isOpen = panel.classList.contains('open');
      if (isOpen) {
        closeMenu();
      } else {
        toggleBtn.classList.add('open');
        toggleBtn.setAttribute('aria-expanded', 'true');
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        if (overlay) overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
      }
    }

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    if (overlay) {
      overlay.addEventListener('click', () => {
        closeMenu();
      });
    }

    panel.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('click', () => {
        closeMenu();
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && !toggleBtn.contains(e.target)) {
        closeMenu();
      }
    });

    window.closeMobileMenu = closeMenu;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('test_menu') === '1') {
      setTimeout(toggleMenu, 100);
    }
  }

  function initHeaderScrollEffect() {
    const header = document.getElementById('siteHeader');
    if (!header) return;

    let ticking = false;
    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (window.scrollY > 12) {
            header.classList.add('is-scrolled');
          } else {
            header.classList.remove('is-scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (new URLSearchParams(window.location.search).get('test_scroll') === '1') {
      window.scrollTo(0, 500);
      header.classList.add('is-scrolled');
    }
  }

  // Экспорт для глобального использования
  window.PDP = {
    init: initPDP,
    openConsultModal: openConsultModal,
    openCheckoutModal: openCheckoutModal,
    openCartModal: openCartModal,
    closeCartModal: closeCartModal
  };

  // Автозапуск при загрузке документа
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPDP);
  } else {
    initPDP();
  }

})();
