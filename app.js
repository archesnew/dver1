/**
 * ИНТЕРНЕТ-МАГАЗИН «ДВЕРИ №1» — ЯДРО КАТАЛОГА ТОВАРОВ
 * 697 моделей • 3 158 вариантов • 10 производителей
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // СОСТОЯНИЕ ПРИЛОЖЕНИЯ (APP STATE)
  // --------------------------------------------------------------------------
  const state = {
    allProducts: [],
    filteredProducts: [],
    activeCategory: 'all',
    activeBrand: 'all',
    activeColor: 'all',
    activeType: 'all',
    activePrice: 'all',
    activeStyle: 'all',
    activeMaterial: 'all',
    publicationStatus: 'published', // 'published' (642), 'drafts' (55), 'all' (697)
    searchQuery: '',
    onlyInStock: false, // Тумблер складской программы (быстрая доставка 1-2 дня)
    comparedIds: [], // Массив ID моделей для сравнения (макс. 3)
    sortOption: 'default',
    currentPage: 1,
    pageSize: 24,

    selectedProduct: null,
    selectedVariant: null,
    selectedCity: 'Казань', // 'Казань' или 'Набережные Челны'
    selectedScenario: 'standard_kit_with_hardware',
    customHandleSelected: false,
    wcTurnSelected: false,
    wallThickness: 75
  };

  // Резолвер путей изображений с автоматическим маппингом в легковесные WebP (thumbs / webp)
  function resolveImagePath(img, preferHighRes = false) {
    if (!img || img === 'door-placeholder.svg') return 'door-placeholder.svg';
    if (img.startsWith('http://') || img.startsWith('https://')) return img;
    if (img.startsWith('data/catalog-output/thumbs/') || img.startsWith('data/catalog-output/webp/')) return img;
    if (img.startsWith('thumbs/') || img.startsWith('webp/')) return 'data/catalog-output/' + img;

    const folder = preferHighRes ? 'webp' : 'thumbs';
    const clean = img
      .replace(/^data\/catalog-output\/(catalog-images|thumbs|webp)\//, '')
      .replace(/^catalog-images\//, '')
      .replace(/^extracted_images\//, '')
      .replace(/\.[^.]+$/, '');

    return `data/catalog-output/${folder}/${clean}.webp`;
  }

  // --------------------------------------------------------------------------
  // ИНИЦИАЛИЗАЦИЯ И ЗАГРУЗКА ДАННЫХ
  // --------------------------------------------------------------------------
  async function initApp() {
    setupCitySelector();
    setupEventListeners();

    // 1. Быстрая загрузка оптимизированного индекса каталога (data/catalog-index.json)
    try {
      showLoading(true);
      const res = await fetch('data/catalog-index.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      console.log('Каталог загружен через catalog-index.json:', data.length, 'товаров');
      state.allProducts = data;
      finishDataLoad();
      return;
    } catch (err) {
      console.warn('Не удалось загрузить catalog-index.json, пробуем fallback на products.json:', err);
    }

    // 2. Fallback на полный products.json при локальных сбоях
    try {
      const res = await fetch('data/catalog-output/products.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      console.log('Каталог загружен через fallback products.json:', data.length, 'товаров');
      state.allProducts = data;
      finishDataLoad();
    } catch (err) {
      console.error('Ошибка загрузки каталога:', err);
      showDataLoadError(err);
    } finally {
      showLoading(false);
    }
  }

  function finishDataLoad() {
    buildFacetFilters();
    applyFiltersAndSort();
    handleUrlHash();
  }

  function showLoading(isLoading) {
    const loader = document.getElementById('catalogLoader');
    if (loader) loader.style.display = isLoading ? 'flex' : 'none';
  }

  function showDataLoadError(err) {
    const grid = document.getElementById('productGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="empty-catalog-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Не удалось загрузить данные каталога</div>
          <div class="empty-desc">Проверьте доступность файла <code>data/catalog-output/products.json</code>. Ошибка: ${err.message}</div>
        </div>
      `;
    }
  }

  // --------------------------------------------------------------------------
  // СЕЛЕКТОР ГОРОДА (КАЗАНЬ / ЧЕЛНЫ)
  // --------------------------------------------------------------------------
  function setupCitySelector() {
    const pills = document.querySelectorAll('.city-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.selectedCity = pill.dataset.city;
        showToast('Город обслуживания: ' + state.selectedCity);
      });
    });
  }

  // --------------------------------------------------------------------------
  // ВСПОМОГАТЕЛЬНАЯ ЛОГИКА ФИЛЬТРАЦИИ ПО ЦВЕТУ И ТИПУ
  // --------------------------------------------------------------------------
  function matchesColor(product, colorKey) {
    if (!colorKey || colorKey === 'all') return true;
    if (Array.isArray(product.color_groups)) {
      return product.color_groups.includes(colorKey);
    }

    const colorStrings = [];
    if (product.title) colorStrings.push(product.title.toLowerCase());
    if (product.model) colorStrings.push(product.model.toLowerCase());
    if (product.collection) colorStrings.push(product.collection.toLowerCase());
    if (product.description) colorStrings.push(product.description.toLowerCase());
    if (product.specs) {
      Object.values(product.specs).forEach(val => {
        if (typeof val === 'string') colorStrings.push(val.toLowerCase());
      });
    }
    (product.variants || []).forEach(v => {
      if (v.color) colorStrings.push(v.color.toLowerCase());
      if (v.name) colorStrings.push(v.name.toLowerCase());
    });
    const joined = colorStrings.join(' ');

    switch (colorKey) {
      case 'white':
        return /бел|9003|светл|крем|слонов|молоч|айвори|вайт|white|снеж|бланко/.test(joined);
      case 'grey':
        return /сер|графит|антрацит|букле|бетон|серебр|агат|грей|grey|gray|пепел|ферро/.test(joined);
      case 'wood':
        return /дуб|ясен|орех|листвен|тик|сосн|кедр|капучино|каштан|дерев|шале|патина|сонома|ривьера|wood/.test(joined);
      case 'dark':
        return /черн|чёрн|шоколад|темн|тёмн|black|блэк|карбон|нео ?блэк|венге|марен|ноч|угол|dark/.test(joined);
      case 'metal':
        return /антик|мед|муар|шагрен|бронз|мета|латун|сталь|хром|нержав|металл/.test(joined);
      case 'other':
        return /зелен|син|красн|желт|оранж|бордо|терракот/.test(joined);
      default:
        return true;
    }
  }

  function matchesType(product, typeKey) {
    if (!typeKey || typeKey === 'all') return true;
    if (product.door_type_group) {
      return product.door_type_group === typeKey;
    }

    const g = (product.specs?.glass || '').toLowerCase();
    const cat = (product.category || '').toLowerCase();
    const dt = (product.specs?.door_type || '').toLowerCase();
    const mod = (product.model || '').toLowerCase();

    const isEntrance = cat.includes('входн') || dt.includes('входн') || mod.includes('входн') || mod.includes('термо');
    const isHidden = cat.includes('скрыт') || dt.includes('скрыт') || mod.includes('invisible') || mod.includes('скрыт');
    const hasGlass = !(g === 'глухое полотно' || g === 'нет' || g === 'нет (глухое полотно)' || g === '');

    switch (typeKey) {
      case 'flush':
        return !hasGlass && !isHidden && !isEntrance;
      case 'glass':
        return hasGlass || cat.includes('стекл');
      case 'invisible':
        return isHidden;
      case 'entrance':
        return isEntrance;
      default:
        return true;
    }
  }

  // --------------------------------------------------------------------------
  // ПОСТРОЕНИЕ 5 ОСНОВНЫХ И ВТОРОСТЕПЕННЫХ ФИЛЬТРОВ
  // --------------------------------------------------------------------------
  function buildFacetFilters() {
    // 1. Категории - считаем по всем товарам каталога
    const categoryCounts = {};
    state.allProducts.forEach(p => {
      if (p.category) {
        categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
      }
    });

    // Для остальных фасетов: базовый пул товаров зависит от активной категории
    // Для межкомнатных дверей включаем также скрытые (Invisible), являющиеся межкомнатными
    const baseProducts = (state.activeCategory && state.activeCategory !== 'all')
      ? state.allProducts.filter(p => {
          if (state.activeCategory === 'Межкомнатные двери') {
            return p.category === 'Межкомнатные двери' || p.category === 'Скрытые двери';
          }
          return p.category === state.activeCategory;
        })
      : state.allProducts;

    // 2. Бренды
    const brandCounts = {};
    // 3. Цветовая палитра
    const colorCounts = {
      all: baseProducts.length,
      white: 0,
      grey: 0,
      wood: 0,
      dark: 0,
      metal: 0,
      other: 0
    };
    // 4. Типы
    const typeCounts = {
      all: baseProducts.length,
      flush: 0,
      glass: 0,
      invisible: 0,
      entrance: 0
    };
    // Второстепенные: стили и материалы
    const styleCounts = {};
    const materialCounts = {};

    baseProducts.forEach(p => {
      if (p.brand) {
        brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
      }
      if (matchesColor(p, 'white')) colorCounts.white++;
      if (matchesColor(p, 'grey')) colorCounts.grey++;
      if (matchesColor(p, 'wood')) colorCounts.wood++;
      if (matchesColor(p, 'dark')) colorCounts.dark++;
      if (matchesColor(p, 'metal')) colorCounts.metal++;
      if (matchesColor(p, 'other')) colorCounts.other++;

      if (matchesType(p, 'flush')) typeCounts.flush++;
      if (matchesType(p, 'glass')) typeCounts.glass++;
      if (matchesType(p, 'invisible')) typeCounts.invisible++;
      if (matchesType(p, 'entrance')) typeCounts.entrance++;

      const s = p.specs?.style;
      if (s) {
        s.split(' / ').forEach(st => {
          const clean = st.trim();
          if (clean) styleCounts[clean] = (styleCounts[clean] || 0) + 1;
        });
      }
      const m = p.specs?.material;
      if (m) {
        m.split(' / ').forEach(mt => {
          const clean = mt.trim();
          if (clean) materialCounts[clean] = (materialCounts[clean] || 0) + 1;
        });
      }
    });

    // 1. Категория
    renderFilterOptionList('categoryFilterList', categoryCounts, state.activeCategory, (val) => {
      state.activeCategory = (state.activeCategory === val) ? 'all' : val;
      state.currentPage = 1;
      applyFiltersAndSort();
      buildFacetFilters();
    });

    // 2. Фабрика / Производитель
    renderFilterOptionList('brandFilterList', brandCounts, state.activeBrand, (val) => {
      state.activeBrand = (state.activeBrand === val) ? 'all' : val;
      state.currentPage = 1;
      applyFiltersAndSort();
      buildFacetFilters();
    }, 7);

    // 3. Цветовая гамма
    renderColorPalette('colorFilterList', colorCounts, state.activeColor, (val) => {
      state.activeColor = (state.activeColor === val) ? 'all' : val;
      state.currentPage = 1;
      applyFiltersAndSort();
      buildFacetFilters();
    });

    // 4. Тип двери
    renderDoorTypeList('typeFilterList', typeCounts, state.activeType, (val) => {
      state.activeType = (state.activeType === val) ? 'all' : val;
      state.currentPage = 1;
      applyFiltersAndSort();
      buildFacetFilters();
    });

    // 5. Стоимость комплекта
    renderPriceList('priceFilterList', state.activePrice, (val) => {
      state.activePrice = (state.activePrice === val) ? 'all' : val;
      state.currentPage = 1;
      applyFiltersAndSort();
      buildFacetFilters();
    });

    // Второстепенные под спойлером
    renderFilterOptionList('styleFilterList', styleCounts, state.activeStyle, (val) => {
      state.activeStyle = (state.activeStyle === val) ? 'all' : val;
      state.currentPage = 1;
      applyFiltersAndSort();
      buildFacetFilters();
    }, 6);

    renderFilterOptionList('materialFilterList', materialCounts, state.activeMaterial, (val) => {
      state.activeMaterial = (state.activeMaterial === val) ? 'all' : val;
      state.currentPage = 1;
      applyFiltersAndSort();
      buildFacetFilters();
    }, 6);
  }

  function renderFilterOptionList(containerId, countMap, activeValue, onSelect, limit = 0) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let entries = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
    if (limit > 0) entries = entries.slice(0, limit);

    const totalCount = Object.values(countMap).reduce((a, b) => a + b, 0);

    let html = `
      <button type="button" class="filter-row-btn ${activeValue === 'all' ? 'active' : ''}" data-val="all">
        <span class="filter-label-text">Все варианты</span>
        <span class="filter-count-num">${totalCount}</span>
      </button>
    `;

    entries.forEach(([name, count]) => {
      const isActive = activeValue === name;
      html += `
        <button type="button" class="filter-row-btn ${isActive ? 'active' : ''}" data-val="${escapeHtml(name)}">
          <span class="filter-label-text">${escapeHtml(name)}</span>
          <span class="filter-count-num">${count}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.filter-row-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        onSelect(btn.dataset.val);
      });
    });
  }

  function renderColorPalette(containerId, countMap, activeValue, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const colors = [
      { key: 'all', label: 'Все оттенки', hex: 'linear-gradient(135deg, #FAF9F6 0%, #D4AF37 35%, #8B5A2B 70%, #222320 100%)', count: countMap.all || state.allProducts.length },
      { key: 'white', label: 'Белые и светлые', hex: '#FAF9F6', count: countMap.white || 0 },
      { key: 'grey', label: 'Серые и графит', hex: '#686C6A', count: countMap.grey || 0 },
      { key: 'wood', label: 'Древесные оттенки', hex: '#96633E', count: countMap.wood || 0 },
      { key: 'dark', label: 'Тёмные и чёрные', hex: '#1E201E', count: countMap.dark || 0 },
      { key: 'metal', label: 'Металл и антик', hex: 'linear-gradient(135deg, #B58A4A 0%, #7A5728 100%)', count: countMap.metal || 0 }
    ];
    if (countMap.other > 0) {
      colors.push({ key: 'other', label: 'Другие цвета', hex: 'linear-gradient(135deg, #4A7A96 0%, #8A4A96 100%)', count: countMap.other });
    }

    let html = '';
    colors.forEach(c => {
      const isActive = activeValue === c.key || ((!activeValue || activeValue === 'all') && c.key === 'all');
      html += `
        <button type="button" class="filter-row-btn color-row-btn ${isActive ? 'active' : ''}" data-val="${c.key}">
          <span class="color-dot-swatch" style="background: ${c.hex};"></span>
          <span class="filter-label-text">${escapeHtml(c.label)}</span>
          <span class="filter-count-num">${c.count}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.color-row-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        onSelect(btn.dataset.val);
      });
    });
  }

  function renderDoorTypeList(containerId, countMap, activeValue, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const types = [
      { key: 'all', label: 'Все конструкции', count: countMap.all || state.allProducts.length },
      { key: 'flush', label: 'Глухие полотна', count: countMap.flush },
      { key: 'glass', label: 'С остеклением / зеркалом', count: countMap.glass },
      { key: 'invisible', label: 'Скрытые Invisible', count: countMap.invisible },
      { key: 'entrance', label: 'Входные сейф-двери', count: countMap.entrance }
    ];

    let html = '';
    types.forEach(t => {
      const isActive = activeValue === t.key || ((!activeValue || activeValue === 'all') && t.key === 'all');
      html += `
        <button type="button" class="filter-row-btn ${isActive ? 'active' : ''}" data-val="${t.key}">
          <span class="filter-label-text">${escapeHtml(t.label)}</span>
          <span class="filter-count-num">${t.count}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.filter-row-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        onSelect(btn.dataset.val);
      });
    });
  }

  function renderPriceList(containerId, activeValue, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Считаем товары по категориям и диапазонам цен
    const baseList = (state.activeCategory !== 'all')
      ? state.allProducts.filter(p => p.category === state.activeCategory)
      : state.allProducts;

    const totalCount = baseList.length;
    const cUnder10 = baseList.filter(p => (p.price || 0) < 10000).length;
    const c10_25 = baseList.filter(p => (p.price || 0) >= 10000 && (p.price || 0) < 25000).length;
    const c25_40 = baseList.filter(p => (p.price || 0) >= 25000 && (p.price || 0) < 40000).length;
    const cOver40 = baseList.filter(p => (p.price || 0) >= 40000).length;

    const priceOptions = [
      { key: 'all', label: 'Все диапазоны', count: totalCount },
      { key: 'under_10k', label: 'До 10 000 ₽', count: cUnder10 },
      { key: '10k_25k', label: '10 000 – 25 000 ₽', count: c10_25 },
      { key: '25k_40k', label: '25 000 – 40 000 ₽', count: c25_40 },
      { key: 'over_40k', label: 'От 40 000 ₽', count: cOver40 }
    ].filter(opt => opt.key === 'all' || opt.count > 0);

    let html = '';
    priceOptions.forEach(opt => {
      const isActive = activeValue === opt.key;
      html += `
        <button type="button" class="filter-row-btn ${isActive ? 'active' : ''}" data-val="${opt.key}">
          <span class="filter-label-text">${escapeHtml(opt.label)}</span>
          <span class="filter-count-num">${opt.count}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.filter-row-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        onSelect(btn.dataset.val);
      });
    });
  }

  // --------------------------------------------------------------------------
  // ФИЛЬТРАЦИЯ И СОРТИРОВКА (CORE LOGIC)
  // --------------------------------------------------------------------------
  function applyFiltersAndSort() {
    const q = state.searchQuery.toLowerCase().trim();

    state.filteredProducts = state.allProducts.filter(p => {
      // 1. Поиск по тексту (название, бренд, категория, тип, цвет, материал, id, коллекция)
      if (q) {
        const titleMatch = (p.name || p.model || '').toLowerCase().includes(q);
        const colMatch = (p.collection || '').toLowerCase().includes(q);
        const brandMatch = (p.brand || '').toLowerCase().includes(q);
        const artMatch = (p.article || '').toLowerCase().includes(q);
        const idMatch = (p.id || '').toLowerCase().includes(q);
        const catMatch = (p.category || '').toLowerCase().includes(q);
        const typeMatch = (p.type || p.door_type_group || '').toLowerCase().includes(q);
        const matMatch = (p.material || p.specs?.material || '').toLowerCase().includes(q);
        const styleMatch = (p.style || p.specs?.style || '').toLowerCase().includes(q);
        const colorMatch = (p.color || '').toLowerCase().includes(q) ||
          (p.color_names || []).some(c => c.toLowerCase().includes(q));
        const descMatch = (p.description || '').toLowerCase().includes(q);
        const varMatch = (p.variants || []).some(v => 
          (v.name || '').toLowerCase().includes(q) || 
          (v.size || '').toLowerCase().includes(q) ||
          (v.color || '').toLowerCase().includes(q)
        );

        if (!titleMatch && !colMatch && !brandMatch && !artMatch && !idMatch && !catMatch && !typeMatch && !matMatch && !styleMatch && !colorMatch && !descMatch && !varMatch) {
          return false;
        }
      }

      // 1.1. Наличие на складе (Спринт 4)
      if (state.onlyInStock && !p.inStock) {
        return false;
      }

      // 2. Категория
      if (state.activeCategory !== 'all') {
        if (state.activeType === 'invisible' && state.activeCategory === 'Межкомнатные двери') {
          if (p.category !== 'Межкомнатные двери' && p.category !== 'Скрытые двери') return false;
        } else if (p.category !== state.activeCategory) {
          return false;
        }
      }

      // 3. Бренд (Фабрика)
      if (state.activeBrand !== 'all' && p.brand !== state.activeBrand) {
        return false;
      }

      // 4. Цвет
      if (state.activeColor !== 'all' && !matchesColor(p, state.activeColor)) {
        return false;
      }

      // 5. Тип конструкции
      if (state.activeType !== 'all' && !matchesType(p, state.activeType)) {
        return false;
      }

      // 6. Стоимость комплекта
      if (state.activePrice !== 'all') {
        const pr = p.price || 0;
        if (state.activePrice === 'under_10k' && pr >= 10000) return false;
        if (state.activePrice === '10k_25k' && (pr < 10000 || pr >= 25000)) return false;
        if (state.activePrice === '25k_40k' && (pr < 25000 || pr >= 40000)) return false;
        if (state.activePrice === 'over_40k' && pr < 40000) return false;
      }

      // 7. Стиль (второстепенный)
      if (state.activeStyle !== 'all') {
        const s = p.specs?.style || '';
        if (!s.includes(state.activeStyle)) return false;
      }

      // 7. Материал (второстепенный)
      if (state.activeMaterial !== 'all') {
        const m = p.specs?.material || '';
        if (!m.includes(state.activeMaterial)) return false;
      }

      return true;
    });

    // Сортировка
    sortProducts();

    // Обновление заголовков и счетчиков
    updateCategoryHeader();
    updateActiveFilterBadge();

    // Отрисовка
    renderGrid();
    renderToolbarSummary();
    renderActiveFilterChips();
  }

  function sortProducts() {
    switch (state.sortOption) {
      case 'price_asc':
        state.filteredProducts.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price_desc':
        state.filteredProducts.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'name_asc':
        state.filteredProducts.sort((a, b) => (a.model || '').localeCompare(b.model || '', 'ru'));
        break;
      case 'name_desc':
        state.filteredProducts.sort((a, b) => (b.model || '').localeCompare(a.model || '', 'ru'));
        break;
      case 'brand_asc':
        state.filteredProducts.sort((a, b) => (a.brand || '').localeCompare(b.brand || '', 'ru'));
        break;
      default:
        // Default: verified first, then ID
        state.filteredProducts.sort((a, b) => {
          const aConf = a.source?.confidence_status === 'verified' ? 1 : 0;
          const bConf = b.source?.confidence_status === 'verified' ? 1 : 0;
          if (bConf !== aConf) return bConf - aConf;
          return (a.id || '').localeCompare(b.id || '');
        });
        break;
    }
  }

  function updateCategoryHeader() {
    const titleEl = document.getElementById('catalogCategoryTitle');
    const descEl = document.getElementById('catalogCategoryDesc');
    if (!titleEl || !descEl) return;

    if (state.activeCategory === 'Межкомнатные двери') {
      titleEl.textContent = 'Межкомнатные двери';
      descEl.textContent = 'Дизайнерские межкомнатные полотна из натурального шпона, эмали и экошпона с итальянской бесшумной фурнитурой.';
    } else if (state.activeCategory === 'Входные двери') {
      titleEl.textContent = 'Входные двери и сейф-конструкции';
      descEl.textContent = 'Максимальная безопасность: терморазрыв для коттеджей, замки 4 класса взломостойкости и шумоизоляция до 45 дБ.';
    } else if (state.activeCategory === 'Скрытые двери') {
      titleEl.textContent = 'Скрытые двери Invisible';
      descEl.textContent = 'Инженерные алюминиевые короба скрытого монтажа под покраску, штукатурку или отделку в плоскости стены.';
    } else if (state.activeCategory === 'Двери со стеклом') {
      titleEl.textContent = 'Двери со стеклом и зеркалом';
      descEl.textContent = 'Светопрозрачные конструкции с триплексом, матовым сатинатом, лакобелем и декоративным остеклением.';
    } else {
      titleEl.textContent = 'Коллекция дизайнерских дверей';
      descEl.textContent = 'Премиальные межкомнатные и входные двери ведущих фабрик с профессиональным инженерным замером по Республике Татарстан.';
    }
  }

  function updateActiveFilterBadge() {
    let count = 0;
    if (state.activeCategory !== 'all') count++;
    if (state.activeBrand !== 'all') count++;
    if (state.activeColor !== 'all') count++;
    if (state.activeType !== 'all') count++;
    if (state.activePrice !== 'all') count++;
    if (state.activeStyle !== 'all') count++;
    if (state.activeMaterial !== 'all') count++;
    if (state.onlyInStock) count++;
    if (state.searchQuery.trim()) count++;

    const badge = document.getElementById('activeFilterBadge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    const btnApply = document.getElementById('btnApplyFilters');
    if (btnApply) {
      const n = state.filteredProducts.length;
      let word = 'моделей';
      const abs = Math.abs(n) % 100;
      const last = abs % 10;
      if (abs > 10 && abs < 20) word = 'моделей';
      else if (last > 1 && last < 5) word = 'модели';
      else if (last === 1) word = 'модель';
      btnApply.textContent = `Показать ${n} ${word}`;
    }
  }

  // --------------------------------------------------------------------------
  // ОТРИСОВКА СЕТКИ ТОВАРОВ (ЛАКОНИЧНАЯ КАРТОЧКА PREMIUM SHOWROOM)
  // --------------------------------------------------------------------------
  function renderGrid() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    if (state.filteredProducts.length === 0) {
      grid.innerHTML = `
        <div class="empty-catalog-state" style="grid-column: 1 / -1; padding: 60px 20px; text-align: center;">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">🔍</div>
          <div style="font-family: var(--font-display); font-weight: 600; font-size: 1.5rem; color: var(--text-primary); margin-bottom: 8px;">Модели не найдены</div>
          <div style="color: var(--text-secondary); font-size: 0.9375rem; max-width: 440px; margin: 0 auto 20px;">
            Попробуйте изменить поисковый запрос или сбросить активные фильтры параметров.
          </div>
          <button type="button" class="btn-card-more" id="btnEmptyReset" style="margin: 0 auto; padding: 10px 24px;">
            Сбросить поиск и фильтры
          </button>
        </div>
      `;
      const btnReset = document.getElementById('btnEmptyReset');
      if (btnReset) btnReset.addEventListener('click', resetAllFilters);
      return;
    }

    const visibleItems = state.filteredProducts.slice(0, state.currentPage * state.pageSize);
    let html = '';

    visibleItems.forEach(p => {
      // Изображение двери: приоритет WebP-превью 480px (thumb)
      const mainImg = p.thumb || ((p.images && p.images.length > 0) ? resolveImagePath(p.images[0]) : 'door-placeholder.svg');
      const brandName = p.brand || 'Коллекция';
      const collectionSub = p.collection ? `${brandName} • ${p.collection}` : brandName;
      const modelName = p.model || p.name || 'Дверное полотно';
      const priceText = p.price ? Number(p.price).toLocaleString('ru-RU') + ' ₽' : 'Уточнить цену';
      const isCompared = state.comparedIds.includes(p.id);

      // Бейдж наличия на складе (Спринт 4)
      const inStockBadge = p.inStock ? `
        <span class="badge-in-stock" title="В наличии на складе (доставка 1–2 дня)">
          <span class="badge-dot"></span>
          <span>В наличии</span>
        </span>
      ` : '';

      html += `
        <article class="product-card" data-id="${p.id}">
          <div class="card-image-box-wrapper">
            ${inStockBadge}
            <button type="button" class="btn-card-compare ${isCompared ? 'active' : ''}" data-compare-id="${p.id}" title="${isCompared ? 'Удалить из сравнения' : 'Сравнить модель'}" aria-label="Сравнить модель">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
            </button>
            <a href="product.html?id=${encodeURIComponent(p.id)}" class="card-image-box">
              <img class="card-img" src="${mainImg}" alt="${escapeHtml(modelName)}" loading="lazy" decoding="async" width="480" height="640" onerror="this.onerror=null; this.src='door-placeholder.svg';">
            </a>
          </div>
          
          <div class="card-body">
            <div class="card-brand-line">${escapeHtml(collectionSub)}</div>
            <h3 class="card-model-title" title="${escapeHtml(modelName)}">
              <a href="product.html?id=${encodeURIComponent(p.id)}" style="color: inherit; text-decoration: none;">${escapeHtml(modelName)}</a>
            </h3>
            
            <div class="card-bottom-row">
              <div class="card-price-value">${priceText}</div>
              <a href="product.html?id=${encodeURIComponent(p.id)}" class="btn-card-more">
                <span>Подробнее</span>
                <span class="btn-arrow">→</span>
              </a>
            </div>
          </div>
        </article>
      `;
    });

    // Порционная пагинация: индикатор "Показано X из Y", кнопка "Показать еще" и IntersectionObserver
    if (visibleItems.length < state.filteredProducts.length) {
      const remaining = state.filteredProducts.length - visibleItems.length;
      html += `
        <div class="catalog-pagination-wrap" id="paginationWrap" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 36px 0 20px; gap: 14px;">
          <div class="pagination-counter-text" style="font-family: var(--font-sans); font-size: 0.875rem; color: #686C6A;">
            Показано <strong>${visibleItems.length}</strong> из <strong>${state.filteredProducts.length}</strong> моделей
          </div>
          <button type="button" class="btn-load-more" id="btnLoadMore" style="padding: 12px 36px; font-size: 0.9375rem; font-weight: 500; font-family: var(--font-sans); background: var(--bg-surface); border: 1px solid var(--border-stone); border-radius: 8px; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); color: var(--text-primary); display: inline-flex; align-items: center; gap: 8px;">
            <span>Показать ещё ${Math.min(remaining, state.pageSize)}</span>
            <span class="more-arrow" style="font-size: 1.1rem; transition: transform 0.2s ease;">↓</span>
          </button>
        </div>
      `;
    }

    grid.innerHTML = html;

    // Навешивание клика на кнопки сравнения в карточках
    grid.querySelectorAll('.btn-card-compare').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-compare-id');
        if (id) toggleCompare(id);
      });
    });

    // Подключение клика и IntersectionObserver для плавной автоматической подгрузки
    const btnLoadMore = document.getElementById('btnLoadMore');
    if (btnLoadMore) {
      btnLoadMore.addEventListener('click', () => {
        state.currentPage++;
        renderGrid();
      });

      if (window.IntersectionObserver) {
        if (state._paginationObserver) {
          state._paginationObserver.disconnect();
        }
        state._paginationObserver = new IntersectionObserver((entries) => {
          if (entries[0] && entries[0].isIntersecting) {
            state.currentPage++;
            renderGrid();
          }
        }, { rootMargin: '280px' });
        state._paginationObserver.observe(btnLoadMore);
      }
    }
  }

  function renderToolbarSummary() {
    const el = document.getElementById('resultsStatsBar');
    if (el) {
      const visibleCount = Math.min(state.currentPage * state.pageSize, state.filteredProducts.length);
      const countEl = el.querySelector('.status-count-text');
      if (countEl) {
        countEl.innerHTML = `Показано: <strong>${visibleCount}</strong> из <strong>${state.filteredProducts.length}</strong> моделей`;
      }
    }

    const btnStock = document.getElementById('btnStockToggle');
    if (btnStock) {
      if (state.onlyInStock) {
        btnStock.classList.add('active');
        btnStock.setAttribute('aria-checked', 'true');
      } else {
        btnStock.classList.remove('active');
        btnStock.setAttribute('aria-checked', 'false');
      }
    }
  }

  function renderActiveFilterChips() {
    const container = document.getElementById('activeFilterChips');
    if (!container) return;

    const chips = [];

    if (state.onlyInStock) {
      chips.push({
        label: 'В наличии на складе (1–2 дня)',
        onRemove: () => {
          state.onlyInStock = false;
          state.currentPage = 1;
          const btn = document.getElementById('btnStockToggle');
          if (btn) {
            btn.classList.remove('active');
            btn.setAttribute('aria-checked', 'false');
          }
          applyFiltersAndSort();
        }
      });
    }

    if (state.activeCategory !== 'all') {
      chips.push({ label: 'Категория: ' + state.activeCategory, onRemove: () => { state.activeCategory = 'all'; state.currentPage = 1; applyFiltersAndSort(); buildFacetFilters(); } });
    }
    if (state.activeBrand !== 'all') {
      chips.push({ label: 'Фабрика: ' + state.activeBrand, onRemove: () => { state.activeBrand = 'all'; state.currentPage = 1; applyFiltersAndSort(); buildFacetFilters(); } });
    }
    if (state.activeColor !== 'all') {
      const cMap = { white: 'Белые и светлые', grey: 'Серые и графит', wood: 'Древесные оттенки', dark: 'Тёмные и чёрные', metal: 'Металл и антик' };
      chips.push({ label: 'Цвет: ' + (cMap[state.activeColor] || state.activeColor), onRemove: () => { state.activeColor = 'all'; state.currentPage = 1; applyFiltersAndSort(); buildFacetFilters(); } });
    }
    if (state.activeType !== 'all') {
      const tMap = { flush: 'Глухие полотна', glass: 'С остеклением', invisible: 'Скрытые Invisible', entrance: 'Входные двери' };
      chips.push({ label: 'Тип: ' + (tMap[state.activeType] || state.activeType), onRemove: () => { state.activeType = 'all'; state.currentPage = 1; applyFiltersAndSort(); buildFacetFilters(); } });
    }
    if (state.activePrice !== 'all') {
      const pLabels = {
        'under_10k': 'Цена: До 10 000 ₽',
        '10k_25k': 'Цена: 10 000 – 25 000 ₽',
        '25k_40k': 'Цена: 25 000 – 40 000 ₽',
        'over_40k': 'Цена: От 40 000 ₽'
      };
      chips.push({ label: pLabels[state.activePrice] || 'Цена: ' + state.activePrice, onRemove: () => { state.activePrice = 'all'; state.currentPage = 1; applyFiltersAndSort(); buildFacetFilters(); } });
    }
    if (state.activeStyle !== 'all') {
      chips.push({ label: 'Стиль: ' + state.activeStyle, onRemove: () => { state.activeStyle = 'all'; state.currentPage = 1; applyFiltersAndSort(); buildFacetFilters(); } });
    }
    if (state.activeMaterial !== 'all') {
      chips.push({ label: 'Материал: ' + state.activeMaterial, onRemove: () => { state.activeMaterial = 'all'; state.currentPage = 1; applyFiltersAndSort(); buildFacetFilters(); } });
    }
    if (state.searchQuery) {
      chips.push({ label: 'Поиск: "' + state.searchQuery + '"', onRemove: () => {
        state.searchQuery = '';
        state.currentPage = 1;
        const sInput = document.getElementById('searchInput');
        if (sInput) sInput.value = '';
        const sClear = document.getElementById('searchClearBtn');
        if (sClear) sClear.style.display = 'none';
        applyFiltersAndSort();
      } });
    }

    if (chips.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'flex';
    container.innerHTML = `
      <span style="color: var(--text-muted); font-size: 0.75rem; margin-right: 4px;">Фильтры:</span>
      ${chips.map((c, idx) => `
        <span class="active-filter-chip">
          <span>${escapeHtml(c.label)}</span>
          <button type="button" class="chip-remove-btn" data-chip-idx="${idx}" title="Снять фильтр">✕</button>
        </span>
      `).join('')}
    `;

    container.querySelectorAll('.chip-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.chipIdx, 10);
        if (chips[idx]) chips[idx].onRemove();
      });
    });
  }

  function resetAllFilters() {
    state.activeCategory = 'all';
    state.activeBrand = 'all';
    state.activeColor = 'all';
    state.activeType = 'all';
    state.activePrice = 'all';
    state.activeStyle = 'all';
    state.activeMaterial = 'all';
    state.searchQuery = '';
    state.onlyInStock = false;
    state.currentPage = 1;

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    const searchClear = document.getElementById('searchClearBtn');
    if (searchClear) searchClear.style.display = 'none';

    const btnStock = document.getElementById('btnStockToggle');
    if (btnStock) {
      btnStock.classList.remove('active');
      btnStock.setAttribute('aria-checked', 'false');
    }

    document.querySelectorAll('.header-nav .header-nav-link, .mobile-nav-item').forEach(link => {
      if (link.dataset.nav === 'catalog' || link.textContent.trim() === 'Каталог') {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    buildFacetFilters();
    applyFiltersAndSort();
    showToast('Каталог обновлен');

    const catalogEl = document.getElementById('catalogContent');
    if (catalogEl) {
      catalogEl.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // --------------------------------------------------------------------------
  // СИСТЕМА СРАВНЕНИЯ МОДЕЛЕЙ (TASK 3 — SPRINT 4)
  // --------------------------------------------------------------------------
  function toggleCompare(id) {
    if (!id) return;
    const idx = state.comparedIds.indexOf(id);
    if (idx > -1) {
      state.comparedIds.splice(idx, 1);
      showToast('Модель удалена из сравнения');
    } else {
      if (state.comparedIds.length >= 3) {
        showToast('Можно сравнивать не более 3 моделей одновременно');
        return;
      }
      state.comparedIds.push(id);
      showToast('Модель добавлена к сравнению');
    }

    try {
      localStorage.setItem('DVER1_COMPARE', JSON.stringify(state.comparedIds));
    } catch (e) {}

    // Обновляем состояние кнопок в сетке
    document.querySelectorAll(`.btn-card-compare[data-compare-id="${id}"]`).forEach(btn => {
      const active = state.comparedIds.includes(id);
      btn.classList.toggle('active', active);
      btn.title = active ? 'Удалить из сравнения' : 'Сравнить модель';
    });

    renderCompareFloatingBar();
  }

  function clearCompare() {
    state.comparedIds = [];
    try {
      localStorage.removeItem('DVER1_COMPARE');
    } catch (e) {}

    document.querySelectorAll('.btn-card-compare.active').forEach(btn => {
      btn.classList.remove('active');
      btn.title = 'Сравнить модель';
    });

    renderCompareFloatingBar();
    closeCompareModal();
    showToast('Сравнение очищено');
  }

  function renderCompareFloatingBar() {
    const bar = document.getElementById('compareFloatingBar');
    if (!bar) return;

    const count = state.comparedIds.length;
    if (count === 0) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'flex';
    const badge = document.getElementById('compareCountBadge');
    if (badge) badge.textContent = count;

    const thumbsContainer = document.getElementById('compareBarThumbs');
    if (thumbsContainer) {
      thumbsContainer.innerHTML = state.comparedIds.map(id => {
        const prod = state.allProducts.find(p => p.id === id);
        const name = prod ? (prod.model || prod.name || 'Дверь') : 'Дверь';
        const img = prod ? (prod.thumb || ((prod.images && prod.images.length > 0) ? resolveImagePath(prod.images[0]) : 'door-placeholder.svg')) : 'door-placeholder.svg';
        return `
          <div class="compare-mini-thumb" title="${escapeHtml(name)}">
            <img src="${img}" alt="${escapeHtml(name)}" loading="lazy">
            <button type="button" class="btn-remove-mini" data-remove-id="${id}" title="Удалить">✕</button>
          </div>
        `;
      }).join('');

      thumbsContainer.querySelectorAll('.btn-remove-mini').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const removeId = btn.getAttribute('data-remove-id');
          if (removeId) toggleCompare(removeId);
        });
      });
    }
  }

  function openCompareModal() {
    const modal = document.getElementById('compareModal');
    const body = document.getElementById('compareModalBody');
    if (!modal || !body) return;

    if (state.comparedIds.length === 0) {
      showToast('Выберите хотя бы одну модель для сравнения');
      return;
    }

    const prods = state.comparedIds.map(id => state.allProducts.find(p => p.id === id)).filter(Boolean);

    let html = `
      <table class="compare-spec-table">
        <thead>
          <tr>
            <th style="width: 160px;">Параметр</th>
            ${prods.map(p => `
              <td class="col-door-card">
                <img src="${p.thumb || ((p.images && p.images.length > 0) ? resolveImagePath(p.images[0]) : 'door-placeholder.svg')}" alt="${escapeHtml(p.name || p.model || 'Дверь')}" class="compare-door-preview-img">
                <div class="compare-door-name">${escapeHtml(p.name || p.model || 'Дверное полотно')}</div>
                <div class="compare-door-price">${p.price ? Number(p.price).toLocaleString('ru-RU') + ' ₽' : 'По запросу'}</div>
                <div style="margin-top: 10px; display: flex; gap: 8px; justify-content: center;">
                  <a href="product.html?id=${encodeURIComponent(p.id)}" class="btn-card-more" style="padding: 6px 14px; font-size: 0.78rem;">
                    Подробнее →
                  </a>
                  <button type="button" class="btn-compare-remove-cell" data-id="${p.id}" style="background: none; border: 1px solid var(--border-stone); border-radius: 4px; padding: 4px 8px; cursor: pointer; color: var(--text-muted); font-size: 0.75rem;" title="Убрать из сравнения">
                    ✕
                  </button>
                </div>
              </td>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Фабрика / Бренд</th>
            ${prods.map(p => `<td>${escapeHtml(p.brand || '—')}</td>`).join('')}
          </tr>
          <tr>
            <th>Категория</th>
            ${prods.map(p => `<td>${escapeHtml(p.category || '—')}</td>`).join('')}
          </tr>
          <tr>
            <th>Тип конструкции</th>
            ${prods.map(p => `<td>${escapeHtml(p.type || p.door_type_group || 'Распашная')}</td>`).join('')}
          </tr>
          <tr>
            <th>Покрытие / Материал</th>
            ${prods.map(p => `<td>${escapeHtml(p.material || p.specs?.material || 'Эмаль / Шпон')}</td>`).join('')}
          </tr>
          <tr>
            <th>Цвет / Отделка</th>
            ${prods.map(p => `<td>${escapeHtml(p.color || (p.color_names ? p.color_names.join(', ') : 'В ассортименте'))}</td>`).join('')}
          </tr>
          <tr>
            <th>Срок поставки</th>
            ${prods.map(p => `
              <td>
                ${p.inStock 
                  ? '<span style="color: #1B4332; font-weight: 600;">● В наличии на складе (1–2 дня)</span>' 
                  : '<span style="color: var(--text-secondary);">Под заказ (10–14 дней)</span>'}
              </td>
            `).join('')}
          </tr>
        </tbody>
      </table>
    `;

    body.innerHTML = html;

    body.querySelectorAll('.btn-compare-remove-cell').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        toggleCompare(id);
        if (state.comparedIds.length === 0) {
          closeCompareModal();
        } else {
          openCompareModal();
        }
      });
    });

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeCompareModal() {
    const modal = document.getElementById('compareModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  // --------------------------------------------------------------------------
  // ПОДРОБНАЯ КАРТОЧКА ТОВАРА (MODAL)
  // --------------------------------------------------------------------------
  function openProductModal(productId) {
    if (productId) {
      window.location.href = `product.html?id=${encodeURIComponent(productId)}`;
      return;
    }
    const product = state.allProducts.find(p => p.id === productId);
    if (!product) return;

    state.selectedProduct = product;
    state.selectedVariant = (product.variants && product.variants.length > 0) ? product.variants[0] : null;
    state.customHandleSelected = false;
    state.wcTurnSelected = false;
    state.selectedScenario = (product.pricing_type === 'monolithic_block') 
      ? 'monolithic_block' 
      : (product.pricing_type === 'invisible_kit' ? 'invisible_kit' : 'standard_kit_with_hardware');

    const modal = document.getElementById('productModal');
    if (!modal) return;

    // Сбор всех изображений без дубликатов
    const allImages = [];
    if (product.images) allImages.push(...product.images);
    if (product.variants) {
      product.variants.forEach(v => {
        if (v.image && !allImages.includes(v.image)) {
          allImages.push(v.image);
        }
      });
    }

    const isOcr = product.source?.confidence_status === 'ocr_extracted';
    const mainImgUrl = (allImages.length > 0) ? resolveImagePath(allImages[0]) : 'logo.png';

    // Рендер галереи
    const galleryBox = document.getElementById('modalGalleryBox');
    if (galleryBox) {
      galleryBox.innerHTML = `
        <div class="gallery-main-view">
          <img id="modalMainImg" class="gallery-main-img" src="${mainImgUrl}" alt="${escapeHtml(product.model)}" onerror="this.onerror=null; this.src='logo.png';">
        </div>
        ${allImages.length > 1 ? `
          <div class="gallery-thumbs-strip">
            ${allImages.map((img, idx) => `
              <button type="button" class="gallery-thumb-btn ${idx === 0 ? 'active' : ''}" data-img="${resolveImagePath(img)}">
                <img class="thumb-img" src="${resolveImagePath(img)}" alt="thumb" onerror="this.onerror=null; this.src='logo.png';">
              </button>
            `).join('')}
          </div>
        ` : ''}
      `;

      galleryBox.querySelectorAll('.gallery-thumb-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          galleryBox.querySelectorAll('.gallery-thumb-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const mainImg = document.getElementById('modalMainImg');
          if (mainImg) mainImg.src = btn.dataset.img;
        });
      });
    }

    // Рендер заголовков и цен
    document.getElementById('modalBreadcrumbs').innerHTML = `
      <span>${escapeHtml(product.category || 'Двери')}</span>
      <span>/</span>
      <span>${escapeHtml(product.brand || 'Бренд')}</span>
      <span>/</span>
      <span>${escapeHtml(product.collection || 'Коллекция')}</span>
    `;

    document.getElementById('modalTitle').textContent = product.model;

    document.getElementById('modalBadges').innerHTML = `
      <span class="badge-brand">${escapeHtml(product.brand)}</span>
      ${product.collection ? `<span class="badge-collection">${escapeHtml(product.collection)}</span>` : ''}
      <span class="badge-availability">✓ В наличии и под заказ</span>
    `;

    // Рендер селектора вариантов
    renderVariantPicker(product);

    // Рендер содержимого табов
    renderSpecsTab(product);
    renderComplectationTab(product);
    renderCalculatorTab(product);
    renderStockTab(product);

    // Сброс табов на первый
    switchModalTab('tabSpecs');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    window.location.hash = 'product-' + product.id;
  }

  function renderVariantPicker(product) {
    const container = document.getElementById('modalVariantPicker');
    if (!container) return;

    if (!product.variants || product.variants.length === 0) {
      container.innerHTML = `
        <div style="font-size: 0.8125rem; color: var(--text-muted);">
          Данная модель поставляется в базовой серийной конфигурации под заказ.
        </div>
      `;
      return;
    }

    // Уникальные размеры
    const sizes = Array.from(new Set(product.variants.map(v => v.size).filter(Boolean)));
    // Уникальные цвета
    const colors = Array.from(new Set(product.variants.map(v => v.color).filter(Boolean)));
    // Уникальные стороны открывания
    const openings = Array.from(new Set(product.variants.map(v => v.opening).filter(Boolean)));

    let html = `
      <div class="variant-picker-title">Выбор размера и параметров варианта:</div>
    `;

    if (sizes.length > 0) {
      html += `
        <div class="picker-group">
          <span class="picker-label">Размер полотна:</span>
          <div class="picker-pills-row" id="pillsSizes">
            ${sizes.map((s, idx) => `
              <button type="button" class="pill-btn ${idx === 0 ? 'active' : ''}" data-val="${escapeHtml(s)}">${escapeHtml(s)}</button>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (openings.length > 0) {
      html += `
        <div class="picker-group">
          <span class="picker-label">Сторона открывания:</span>
          <div class="picker-pills-row" id="pillsOpenings">
            ${openings.map((o, idx) => `
              <button type="button" class="pill-btn ${idx === 0 ? 'active' : ''}" data-val="${escapeHtml(o)}">${escapeHtml(o)}</button>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (colors.length > 1) {
      html += `
        <div class="picker-group">
          <span class="picker-label">Цвет / Отделка:</span>
          <div class="picker-pills-row" id="pillsColors">
            ${colors.map((c, idx) => `
              <button type="button" class="pill-btn ${idx === 0 ? 'active' : ''}" data-val="${escapeHtml(c)}">${escapeHtml(c)}</button>
            `).join('')}
          </div>
        </div>
      `;
    }

    html += `
      <div class="selected-variant-summary" id="selectedVariantSummaryBox">
        <!-- Заполняется динамически -->
      </div>
    `;

    container.innerHTML = html;

    // Обработчики кликов по пилюлям
    container.querySelectorAll('.pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.parentElement;
        row.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateSelectedVariantFromPills(product);
      });
    });

    updateSelectedVariantFromPills(product);
  }

  function updateSelectedVariantFromPills(product) {
    const activeSizeBtn = document.querySelector('#pillsSizes .pill-btn.active');
    const activeOpenBtn = document.querySelector('#pillsOpenings .pill-btn.active');
    const activeColorBtn = document.querySelector('#pillsColors .pill-btn.active');

    const curSize = activeSizeBtn ? activeSizeBtn.dataset.val : null;
    const curOpen = activeOpenBtn ? activeOpenBtn.dataset.val : null;
    const curColor = activeColorBtn ? activeColorBtn.dataset.val : null;

    // Ищем точное или ближайшее совпадение среди вариантов
    let matched = product.variants.find(v => {
      let ok = true;
      if (curSize && v.size !== curSize) ok = false;
      if (curOpen && v.opening !== curOpen) ok = false;
      if (curColor && v.color !== curColor) ok = false;
      return ok;
    });

    if (!matched && curSize) {
      matched = product.variants.find(v => v.size === curSize);
    }
    if (!matched) {
      matched = product.variants[0];
    }

    state.selectedVariant = matched;

    // Обновляем сводку
    const summaryBox = document.getElementById('selectedVariantSummaryBox');
    if (summaryBox && matched) {
      summaryBox.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span>Выбранный артикул: <span class="sku-code">${matched.variant_id}</span></span>
          <span style="color: var(--accent-gold); font-weight: 600;">Готов к расчету</span>
        </div>
        <div style="color: var(--text-secondary); font-size: 0.75rem;">
          ${matched.size ? `Размер: <strong>${matched.size}</strong> • ` : ''}
          ${matched.opening ? `Открывание: <strong>${matched.opening}</strong> • ` : ''}
          ${matched.color ? `Цвет: <strong>${matched.color}</strong>` : ''}
        </div>
      `;
    }

    // Если у варианта есть собственное изображение, переключаем главное фото
    if (matched && matched.image) {
      const mainImg = document.getElementById('modalMainImg');
      if (mainImg) {
        mainImg.src = resolveImagePath(matched.image);
      }
      // Подсвечиваем соответствующий thumbnail
      const thumb = document.querySelector(`.gallery-thumb-btn[data-img="${resolveImagePath(matched.image)}"]`);
      if (thumb) {
        document.querySelectorAll('.gallery-thumb-btn').forEach(b => b.classList.remove('active'));
        thumb.classList.add('active');
      }
    }
  }

  // --------------------------------------------------------------------------
  // РЕНДЕР ТАБОВ В МОДАЛКЕ
  // --------------------------------------------------------------------------
  function renderSpecsTab(product) {
    const pane = document.getElementById('tabSpecs');
    if (!pane) return;

    const specs = product.specs || {};
    const labels = {
      door_type: 'Тип полотна / конструкции',
      construction: 'Конструктивные особенности',
      material: 'Материалы каркаса и вставок',
      coating: 'Покрытие / пленка',
      color: 'Цвет по каталогу',
      texture: 'Фактура поверхности',
      glass: 'Стекло и вставки',
      decor: 'Декоративные элементы',
      style: 'Интерьерный стиль',
      available_sizes: 'Стандартные размеры полотен',
      opening_direction: 'Сторона открывания',
      other_specs: 'Дополнительные спецификации'
    };

    let rows = '';
    for (const [key, label] of Object.entries(labels)) {
      let val = specs[key];
      if (val) {
        if (Array.isArray(val)) val = val.join(', ');
        rows += `
          <tr>
            <td>${escapeHtml(label)}</td>
            <td>${escapeHtml(String(val))}</td>
          </tr>
        `;
      }
    }

    pane.innerHTML = `
      <table class="specs-table">
        <tbody>
          ${rows || '<tr><td colspan="2">Спецификации указаны в основном каталоге фабрики.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  function renderComplectationTab(product) {
    const pane = document.getElementById('tabComplectation');
    if (!pane) return;

    const comp = product.complectation || {};
    const labels = {
      leaf: 'Дверное полотно',
      frame: 'Дверная коробка',
      casing: 'Наличники',
      extensions: 'Доборные элементы',
      hinges: 'Петли дверные',
      locks: 'Замковые механизмы',
      handles: 'Дверные ручки',
      other_hardware: 'Фурнитурные аксессуары'
    };

    let rows = '';
    for (const [key, label] of Object.entries(labels)) {
      const val = comp[key];
      if (val) {
        rows += `
          <tr>
            <td>${escapeHtml(label)}</td>
            <td>${escapeHtml(String(val))}</td>
          </tr>
        `;
      }
    }

    pane.innerHTML = `
      <div style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 12px;">
        Состав заводского комплекта по техническому паспорту производителя:
      </div>
      <table class="specs-table">
        <tbody>
          ${rows || '<tr><td colspan="2">Комплектация формируется индивидуально на основании замера проема.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  function renderCalculatorTab(product) {
    const pane = document.getElementById('tabCalculator');
    if (!pane) return;

    const isMonolithic = (product.pricing_type === 'monolithic_block');
    const isInvisible = (product.pricing_type === 'invisible_kit');

    if (isMonolithic) {
      pane.innerHTML = `
        <div class="calc-tab-box">
          <div style="font-weight: 700; color: #fff;">Входная дверь — Неделимый моноблок</div>
          <div class="calc-scenario-desc">
            Входная стальная дверь поставляется единым заводским блоком: утепленный стальной короб, встроенные петли на подшипниках (3 шт), двухсистемные замки высшего класса взломостойкости и фигурный металлический наличник уже смонтированы. Повторное добавление коробок и петель исключено.
          </div>
          <button type="button" class="btn-card-request" style="margin-top: 10px;" onclick="window.DverApp.openLeadModal('${product.id}')">
            Запросить точный расчет с доставкой и установкой
          </button>
        </div>
      `;
      return;
    }

    if (isInvisible) {
      pane.innerHTML = `
        <div class="calc-tab-box">
          <div style="font-weight: 700; color: #fff;">Скрытая дверь Invisible — Инженерный монокомплект</div>
          <div class="calc-scenario-desc">
            В комплект входит грунтованное полотно под покраску, скрытый анодированный алюминиевый короб, 2 скрытые 3D петли и бесшумный магнитный замок AGB Polaris. Наличники строго запрещены технологией монтажа в плоскость стены.
          </div>
          <div class="calc-addons-row">
            <label class="checkbox-label">
              <input type="checkbox" id="chkCalcHandle" ${state.customHandleSelected ? 'checked' : ''}>
              <span>Добавить дизайнерскую ручку Morelli Slim на тонкой розетке (+1 850 ₽ расчетно)</span>
            </label>
          </div>
          <button type="button" class="btn-card-request" style="margin-top: 10px;" onclick="window.DverApp.openLeadModal('${product.id}')">
            Запросить расчет скрытого комплекта
          </button>
        </div>
      `;
      const chk = document.getElementById('chkCalcHandle');
      if (chk) chk.addEventListener('change', (e) => { state.customHandleSelected = e.target.checked; });
      return;
    }

    // Межкомнатные двери: 7 сценариев V3.2
    pane.innerHTML = `
      <div class="calc-tab-box">
        <label style="font-size: 0.8125rem; font-weight: 700; color: var(--text-secondary);">
          Выберите сценарий комплектации проема (согласно регламенту V3.2):
        </label>
        
        <select class="calc-scenario-select" id="calcScenarioSelect">
          <option value="leaf_only">1. Только полотно (замена створки)</option>
          <option value="leaf_with_frame">2. Полотно + Коробка телескопическая (2.5 стойки)</option>
          <option value="kit_casing_1side">3. Комплект: коробка + наличники на 1 сторону (санузел/плитка)</option>
          <option value="kit_casing_2sides">4. Комплект: коробка + наличники на 2 стороны (5.0 стоек)</option>
          <option value="kit_with_extensions">5. Комплект с доборами (стена толще 75 мм)</option>
          <option value="standard_kit_with_hardware" selected>6. Стандартный блок с фурнитурой (2 петли + 1 замок, БЕЗ РУЧКИ)</option>
          <option value="full_turnkey_kit">7. Полный комплект под ключ с ручкой Morelli и заверткой</option>
        </select>

        <div class="calc-scenario-desc" id="calcScenarioDescBox">
          <!-- Описание выбранного сценария -->
        </div>

        <div class="calc-addons-row" id="calcAddonsBox">
          <label class="checkbox-label">
            <input type="checkbox" id="chkCalcCustomHandle" ${state.customHandleSelected ? 'checked' : ''}>
            <span>Выбрать ручку из каталога Morelli/Armadillo (ручка НЕ включена в базу)</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="chkCalcWcTurn" ${state.wcTurnSelected ? 'checked' : ''}>
            <span>Добавить сантехнический фиксатор WC (для ванной, санузла или спальни)</span>
          </label>
        </div>

        <div style="font-size: 0.75rem; color: var(--text-muted); background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: var(--radius-md);">
          ℹ️ <strong>Правило прозрачности:</strong> В салоне «Двери №1» цена фиксируется прозрачно. Точная смета формируется после лазерного замера геометрии проёмов инженером.
        </div>

        <button type="button" class="btn-card-request" onclick="window.DverApp.openLeadModal('${product.id}')">
          Отправить комплектацию на расчет сметы
        </button>
      </div>
    `;

    const select = document.getElementById('calcScenarioSelect');
    if (select) {
      select.value = state.selectedScenario;
      select.addEventListener('change', (e) => {
        state.selectedScenario = e.target.value;
        updateCalculatorDescription();
      });
      updateCalculatorDescription();
    }

    const chkHandle = document.getElementById('chkCalcCustomHandle');
    if (chkHandle) {
      chkHandle.addEventListener('change', (e) => {
        state.customHandleSelected = e.target.checked;
      });
    }

    const chkWc = document.getElementById('chkCalcWcTurn');
    if (chkWc) {
      chkWc.addEventListener('change', (e) => {
        state.wcTurnSelected = e.target.checked;
      });
    }
  }

  function updateCalculatorDescription() {
    const descBox = document.getElementById('calcScenarioDescBox');
    if (!descBox) return;

    const descriptions = {
      leaf_only: '<strong>Состав:</strong> 1 дверное полотно выбранного размера. Погонаж и фурнитура не включаются (0 ₽). Подходит для замены створки в готовый проем.',
      leaf_with_frame: '<strong>Состав:</strong> 1 полотно + 2.5 стойки коробки с уплотнителем. Наличники не требуются (проем оформляется штукатуркой или плиткой встык).',
      kit_casing_1side: '<strong>Состав:</strong> 1 полотно + 2.5 стойки коробки + 2.5 стойки наличника. Идеально для ванных комнат, где изнутри стены выложен кафель.',
      kit_casing_2sides: '<strong>Состав:</strong> 1 полотно + 2.5 стойки коробки + 5.0 стоек наличника на две стороны. Базовый строительный комплект для стены до 75 мм.',
      kit_with_extensions: '<strong>Состав:</strong> 1 полотно + 2.5 коробки + 5.0 наличников + 2.5 стойки добора. Для проемов с толщиной стены свыше 75 мм (до 220 мм).',
      standard_kit_with_hardware: '<strong>Состав:</strong> 1 полотно + 2.5 коробки + 5.0 наличников + 2 петли + 1 врезной замок с ответной планкой. <em>Ручка исключена</em> — вы можете поставить свою или выбрать ниже.',
      full_turnkey_kit: '<strong>Состав:</strong> Стандартный блок + раздельная ручка из каталога Morelli/Armadillo + сантехническая завертка WC. Полная готовность к установке под ключ.'
    };

    descBox.innerHTML = descriptions[state.selectedScenario] || descriptions.standard_kit_with_hardware;
  }

  function renderStockTab(product) {
    const pane = document.getElementById('tabStock');
    if (!pane) return;

    pane.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px; font-size: 0.8125rem;">
        <div style="background: var(--bg-stone-light); padding: 14px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-stone);">
          <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">📍 Центральный шоурум и склад «Казань»</div>
          <div style="color: var(--text-secondary);">ул. Сибирский тракт, 59б • Ежедневно 09:00 - 19:00</div>
          <div style="color: var(--accent-emerald); font-weight: 600; margin-top: 6px;">✓ Доступна складская программа (отгрузка за 24 ч)</div>
        </div>

        <div style="background: var(--bg-stone-light); padding: 14px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-stone);">
          <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">📍 Шоурум и региональный склад «Набережные Челны»</div>
          <div style="color: var(--text-secondary);">Казанский проспект, 232 • Пн-Сб 09:00 - 18:00</div>
          <div style="color: var(--accent-terracotta); font-weight: 600; margin-top: 6px;">✓ Регулярная логистика Казань ↔ Челны (2 раза в неделю)</div>
        </div>

        <div style="color: var(--text-muted); line-height: 1.5; padding: 12px 14px; background: var(--bg-stone-subtle); border-radius: var(--radius-sm); border: 1px solid var(--border-stone-subtle);">
          Инженер-замерщик выезжает на объект с лазерным построителем плоскостей и полным комплектом каталогов фактур и эмалей.
        </div>
      </div>
    `;
  }

  function switchModalTab(tabId) {
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.targetTab === tabId);
    });
    document.querySelectorAll('.modal-tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });
  }

  function closeProductModal() {
    const modal = document.getElementById('productModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    if (window.location.hash.startsWith('#product-')) {
      history.replaceState(null, null, ' ');
    }
  }

  // --------------------------------------------------------------------------
  // МОДАЛКА ОФОРМЛЕНИЯ ЗАЯВКИ (LEAD MODAL)
  // --------------------------------------------------------------------------
  function openLeadModal(productIdOrContext) {
    let product = state.selectedProduct;
    if (productIdOrContext && typeof productIdOrContext === 'string' && productIdOrContext.startsWith('PROD-')) {
      product = state.allProducts.find(p => p.id === productIdOrContext);
      state.selectedProduct = product;
    }

    const modal = document.getElementById('leadModal');
    if (!modal) return;

    const summaryBox = document.getElementById('leadProductSummary');
    if (summaryBox) {
      if (product) {
        const v = state.selectedVariant;
        summaryBox.innerHTML = `
          <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${escapeHtml(product.model)}</div>
          <div style="color: var(--text-secondary);">
            Бренд: <strong>${escapeHtml(product.brand)}</strong> • Коллекция: ${escapeHtml(product.collection || '—')}
          </div>
          ${v ? `
            <div style="color: var(--accent-terracotta); margin-top: 4px; font-weight: 500;">
              Вариант: ${escapeHtml(v.size || '')} ${v.opening ? '(' + escapeHtml(v.opening) + ')' : ''} [${v.variant_id}]
            </div>
          ` : ''}
          <div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 4px;">
            Конфигурация: ${escapeHtml(state.selectedScenario || 'Стандарт')}
          </div>
        `;
      } else {
        summaryBox.innerHTML = `
          <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">Выезд инженера-замерщика для проверки проёмов</div>
          <div style="color: var(--text-secondary);">
            Инженер привезет каталоги покрытий, веер эмалей и проведет лазерный замер дверных проемов
          </div>
        `;
      }
    }

    const citySelect = document.getElementById('leadCitySelect');
    if (citySelect) citySelect.value = state.selectedCity || 'Казань';

    modal.classList.add('open');
    modal.classList.add('active');
  }

  function closeLeadModal() {
    const modal = document.getElementById('leadModal');
    if (modal) modal.classList.remove('open', 'active');
  }

  function handleLeadSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('leadNameInput')?.value?.trim();
    const phone = document.getElementById('leadPhoneInput')?.value?.trim();
    const city = document.getElementById('leadCitySelect')?.value;
    const address = document.getElementById('leadAddressInput')?.value?.trim();
    const comment = document.getElementById('leadCommentInput')?.value?.trim();

    if (!name || !phone) {
      alert('Пожалуйста, заполните ваше имя и контактный телефон.');
      return;
    }

    const ticketNumber = 'ДВ-' + Math.floor(100000 + Math.random() * 900000);
    const leadData = {
      ticketNumber,
      date: new Date().toISOString(),
      name,
      phone,
      city,
      address,
      comment,
      productId: state.selectedProduct?.id,
      modelName: state.selectedProduct?.model,
      variantId: state.selectedVariant?.variant_id,
      scenario: state.selectedScenario,
      hasHandle: state.customHandleSelected,
      hasWcTurn: state.wcTurnSelected
    };

    // Сохранение в localStorage для истории
    try {
      const history = JSON.parse(localStorage.getItem('DVER1_LEADS') || '[]');
      history.push(leadData);
      localStorage.setItem('DVER1_LEADS', JSON.stringify(history));
    } catch (err) {
      console.warn('LocalStorage error:', err);
    }

    if (typeof window.trackGoal === 'function') {
      window.trackGoal('lead_measure', {
        ticketNumber,
        source: 'Модалка замера (index.html)',
        city: city || 'Казань'
      });
    }

    closeLeadModal();
    showToast(`Заявка №${ticketNumber} принята! Менеджер свяжется с вами в течение 15 минут.`);
  }

  // --------------------------------------------------------------------------
  // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ И СЛУШАТЕЛИ
  // --------------------------------------------------------------------------
  function setupEventListeners() {
    // Панель фильтров: переключение (мобильная шторка или десктоп сворачивание)
    const btnToggle = document.getElementById('btnToggleFilters');
    const filtersPanel = document.getElementById('filtersPanel');
    const filtersBackdrop = document.getElementById('filtersBackdrop');
    const btnClose = document.getElementById('btnCloseFilters');
    const btnApply = document.getElementById('btnApplyFilters');
    const layoutGrid = document.querySelector('.catalog-layout-grid');

    function openFiltersDrawer() {
      if (filtersPanel) filtersPanel.classList.add('open');
      if (filtersBackdrop) filtersBackdrop.classList.add('open');
      document.body.classList.add('drawer-open');
    }

    function closeFiltersDrawer() {
      if (filtersPanel) filtersPanel.classList.remove('open');
      if (filtersBackdrop) filtersBackdrop.classList.remove('open');
      document.body.classList.remove('drawer-open');
    }

    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
          if (filtersPanel && filtersPanel.classList.contains('open')) {
            closeFiltersDrawer();
          } else {
            openFiltersDrawer();
          }
        } else {
          if (layoutGrid) layoutGrid.classList.toggle('filters-collapsed');
        }
      });
    }
    if (btnClose) btnClose.addEventListener('click', closeFiltersDrawer);
    if (filtersBackdrop) filtersBackdrop.addEventListener('click', closeFiltersDrawer);
    if (btnApply) {
      btnApply.addEventListener('click', () => {
        closeFiltersDrawer();
        const catalogEl = document.getElementById('catalogContent');
        if (catalogEl) {
          catalogEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    // Кнопка сброса всех фильтров
    const btnResetFilters = document.getElementById('btnResetFilters');
    if (btnResetFilters) btnResetFilters.addEventListener('click', resetAllFilters);

    // Утилита debounce для предотвращения лагов при вводе поиска и фильтрации
    function debounce(fn, wait = 200) {
      let timer = null;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
      };
    }

    // Компактный живой поиск с debounce (200 мс)
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClearBtn');

    const debouncedSearch = debounce((query) => {
      state.searchQuery = query;
      state.currentPage = 1;
      applyFiltersAndSort();
    }, 200);

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (searchClear) searchClear.style.display = val ? 'block' : 'none';
        debouncedSearch(val);
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        state.searchQuery = '';
        if (searchInput) searchInput.value = '';
        searchClear.style.display = 'none';
        state.currentPage = 1;
        applyFiltersAndSort();
      });
    }

    // Горячая клавиша '/' для поиска
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput?.focus();
      }
      if (e.key === 'Escape') {
        closeFiltersDrawer();
        closeProductModal();
        if (typeof window.trackGoal === 'function') {
      window.trackGoal('lead_measure', {
        ticketNumber,
        source: 'Модалка замера (index.html)',
        city: city || 'Казань'
      });
    }

    closeLeadModal();
        closeCompareModal();
      }
    });

    // Тумблер наличия на складе (Спринт 4 — Задача 2)
    const btnStockToggle = document.getElementById('btnStockToggle');
    if (btnStockToggle) {
      btnStockToggle.addEventListener('click', () => {
        state.onlyInStock = !state.onlyInStock;
        state.currentPage = 1;
        applyFiltersAndSort();
      });
    }

    // Кнопки сравнения моделей (Спринт 4 — Задача 3)
    const btnOpenCompare = document.getElementById('btnOpenCompareModal');
    if (btnOpenCompare) btnOpenCompare.addEventListener('click', openCompareModal);

    const btnClearCompare = document.getElementById('btnClearCompare');
    if (btnClearCompare) btnClearCompare.addEventListener('click', clearCompare);

    const btnCloseCompare = document.getElementById('btnCloseCompare');
    if (btnCloseCompare) btnCloseCompare.addEventListener('click', closeCompareModal);

    const compareModal = document.getElementById('compareModal');
    if (compareModal) {
      compareModal.addEventListener('click', (e) => {
        if (e.target === compareModal) closeCompareModal();
      });
    }

    // Загрузка сохранённого списка сравнения из localStorage
    try {
      const savedCompare = localStorage.getItem('DVER1_COMPARE');
      if (savedCompare) {
        state.comparedIds = JSON.parse(savedCompare) || [];
      }
    } catch (e) {}
    renderCompareFloatingBar();

    // Компактная сортировка
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        state.sortOption = e.target.value;
        applyFiltersAndSort();
      });
    }

    // Модалка закрытия по клику на оверлей
    const prodModal = document.getElementById('productModal');
    if (prodModal) {
      prodModal.addEventListener('click', (e) => {
        if (e.target === prodModal) closeProductModal();
      });
    }
    const btnCloseModal = document.getElementById('btnCloseModal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeProductModal);

    const leadModal = document.getElementById('leadModal');
    if (leadModal) {
      leadModal.addEventListener('click', (e) => {
        if (e.target === leadModal) closeLeadModal();
      });
    }
    const btnCloseLeadModal = document.getElementById('btnCloseLeadModal');
    if (btnCloseLeadModal) btnCloseLeadModal.addEventListener('click', closeLeadModal);

    // Сабмит заявки
    const leadForm = document.getElementById('leadOrderForm');
    if (leadForm) leadForm.addEventListener('submit', handleLeadSubmit);

    // Табы внутри модалки
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchModalTab(btn.dataset.targetTab);
      });
    });

    // Кнопки в шапке
    const btnHeaderLead = document.getElementById('btnHeaderLead');
    if (btnHeaderLead) {
      btnHeaderLead.addEventListener('click', () => {
        state.selectedProduct = state.filteredProducts[0] || state.allProducts[0];
        openLeadModal('Вызов замерщика из шапки');
      });
    }

    // Инициализация мобильного меню, эффекта стекла и витрины Designer Selection
    initHeaderMenu();
    initHeaderScrollEffect();
    initDesignerShowcase();
  }

  function handleUrlHash() {
    const hash = window.location.hash;
    if (hash === '#showroomsSection' || hash === '#showrooms') {
      window.location.href = 'showrooms.html';
      return;
    }
    if (hash.startsWith('#product-')) {
      const prodId = hash.replace('#product-', '');
      openProductModal(prodId);
    } else if (hash && hash.length > 1) {
      const targetEl = document.querySelector(hash);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    }
  }

  function showToast(msg) {
    let toast = document.getElementById('siteToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'siteToast';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>✓</span> <span>${escapeHtml(msg)}</span>`;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Быстрый фильтр по категории из навигации
  function setCategory(catName) {
    state.activeCategory = catName;
    state.currentPage = 1;
    
    // Подсветка ссылки в навигации
    document.querySelectorAll('.header-nav .header-nav-link, .mobile-nav-item, .header-nav .nav-link').forEach(link => {
      const txt = link.textContent.trim().toLowerCase();
      const firstWord = catName.split(' ')[0].toLowerCase();
      if (txt.includes(firstWord)) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    buildFacetFilters();
    applyFiltersAndSort();

    // Плавный скролл к каталогу
    const catalogEl = document.getElementById('catalogContent');
    if (catalogEl) {
      catalogEl.scrollIntoView({ behavior: 'smooth' });
    }
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

    // Автоматическая проверка состояний шапки при тестировании
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

  function initDesignerShowcase() {
    const track = document.getElementById('designerShowcaseTrack');
    const prevBtn = document.getElementById('designerPrevBtn');
    const nextBtn = document.getElementById('designerNextBtn');
    if (!track || !prevBtn || !nextBtn) return;

    function updateNavState() {
      const atStart = track.scrollLeft <= 8;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
      prevBtn.disabled = atStart;
      nextBtn.disabled = atEnd;
    }

    prevBtn.addEventListener('click', () => {
      const card = track.querySelector('.designer-card');
      const step = card ? card.offsetWidth + 20 : 320;
      track.scrollBy({ left: -step, behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
      const card = track.querySelector('.designer-card');
      const step = card ? card.offsetWidth + 20 : 320;
      track.scrollBy({ left: step, behavior: 'smooth' });
    });

    track.addEventListener('scroll', updateNavState, { passive: true });
    window.addEventListener('resize', updateNavState, { passive: true });
    updateNavState();
  }

  // Экспорт в глобальное пространство для inline-обработчиков
  window.DverApp = {
    openProductModal,
    closeProductModal,
    openLeadModal,
    closeLeadModal,
    resetAllFilters,
    setCategory,
    toggleCompare,
    clearCompare,
    openCompareModal,
    closeCompareModal
  };

  // Запуск при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
