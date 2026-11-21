// ==============================================================================
// ДВЕРИ №1 — PRICING & PRICE LIST MANAGEMENT ENGINE
// Полноценный модуль импорта, сопоставления прайс-листов и расчёта розничных цен
// Регламент: РОЗНИЧНАЯ ЦЕНА = ЗАКУПОЧНАЯ ЦЕНА + 10 000 ₽
// ==============================================================================

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CATALOG_PATH = path.join(DATA_DIR, 'catalog-output', 'products.json');
const JS_CATALOG_PATH = path.join(DATA_DIR, 'catalog-output', 'products-data.js');
const HISTORY_PATH = path.join(DATA_DIR, 'pricing-history.json');

// Ensure history file exists
if (!fs.existsSync(HISTORY_PATH)) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify([], null, 2), 'utf8');
}

// ------------------------------------------------------------------------------
// 1. КОНФИГУРАЦИЯ ПОСТАВЩИКОВ И ПРАВИЛ ЦЕНООБРАЗОВАНИЯ
// ------------------------------------------------------------------------------
const SUPPLIERS = {
  VIRA_DOORS: {
    key: 'VIRA_DOORS',
    name: 'VIRA DOORS',
    brandMatch: ['ViraDoors', 'VIRA_DOORS', 'Вира'],
    ruleDesc: 'Базовая закупка: «ОПТ нал». Розничная цена = ОПТ нал + 10 000 ₽. «ОПТ безнал» сохраняется отдельно.',
    defaultMarkup: 10000,
    keywords: ['vira', 'вира', 'vira_doors']
  },
  GK_ECONOM: {
    key: 'GK_ECONOM',
    name: 'GK Эконом',
    brandMatch: ['Йошкар-Ола', 'GK Эконом', 'Эконом'],
    ruleDesc: 'Базовая закупка: «VIP нал». Розничная цена = VIP нал + 10 000 ₽. «VIP безнал» сохраняется отдельно.',
    defaultMarkup: 10000,
    keywords: ['эконом', 'gk эконом', 'серия-эконом', 'vip нал']
  },
  GK_METALL: {
    key: 'GK_METALL',
    name: 'GK Металл',
    brandMatch: ['Йошкар-Ола', 'GK Металл', 'Dveri_Gk'],
    ruleDesc: 'Базовая закупка: Складская цена + 10 000 ₽. Цены «под заказ» также + 10 000 ₽ фиксированно.',
    defaultMarkup: 10000,
    keywords: ['gk металл', 'dveri_gk', 'складские позиции', 'grey mirror', 'neoblack']
  },
  FERRONI_LUXOR: {
    key: 'FERRONI_LUXOR',
    name: 'Феррони / Luxor',
    brandMatch: ['Феррони', 'Luxor'],
    ruleDesc: 'Базовая закупка: 1 категория (нал склад Казань) + 10 000 ₽. 2 кат. сохраняется отдельно.',
    defaultMarkup: 10000,
    keywords: ['феррони', 'ferroni', 'luxor', 'люксор', 'стройгост', 'гарда']
  },
  FSD: {
    key: 'FSD',
    name: 'ФСД (Федеральный Склад Дверей)',
    brandMatch: ['ФСД', 'FSD'],
    ruleDesc: 'Базовая закупка входных дверей: колонка «ОПТ» + 10 000 ₽. Плинтусы и погонаж без наценки +10к.',
    defaultMarkup: 10000,
    keywords: ['фсд', 'fsd', 'сотка', 'сити мини', 'троя']
  },
  CHAMELEON: {
    key: 'CHAMELEON',
    name: 'Chameleon Doors',
    brandMatch: ['Chameleon Doors'],
    ruleDesc: 'Базовая закупка: Оптовая цена полотна (Invisible, Rail, Glass) + 10 000 ₽.',
    defaultMarkup: 10000,
    keywords: ['chameleon', 'хамелеон', 'invisible']
  },
  MEZH_DOORS: {
    key: 'MEZH_DOORS',
    name: 'Фабрика Межкомнатных Дверей / Двери Голливуда / Двереки',
    brandMatch: ['Фабрика Межкомнатных Дверей', 'Двери 2025', 'Двереки', 'Двери Голливуда'],
    ruleDesc: 'Базовая закупка: Оптовая/дилерская цена полотна + 10 000 ₽. Погонаж по фабричному прейскуранту.',
    defaultMarkup: 10000,
    keywords: ['межкомнатные', 'голливуд', 'двереки', 'экошпон', 'эмалит']
  },
  GENERIC: {
    key: 'GENERIC',
    name: 'Универсальный прайс-лист',
    brandMatch: [],
    ruleDesc: 'Единая наценка + 10 000 ₽ к первой распознанной колонке закупочной стоимости.',
    defaultMarkup: 10000,
    keywords: []
  }
};

// ------------------------------------------------------------------------------
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ НОРМАЛИЗАЦИИ И ПАРСИНГА
// ------------------------------------------------------------------------------
const TRANSLIT_MAP = {
  'vira': 'вира',
  'grey': 'грей',
  'gray': 'грей',
  'neo': 'нео',
  'termoclassic': 'термоклассик',
  'termo': 'термо',
  'smart': 'смарт',
  'luxor': 'люксор',
  'lux': 'люкс',
  'direct': 'директ',
  'reverse': 'реверс',
  'invisible': 'инвизибл',
  'classic': 'классик',
  'grand': 'гранд',
  'royal': 'роял',
  'trend': 'тренд',
  'line': 'лайн',
  'rail': 'рейл',
  'oval': 'овал',
  'select': 'селект',
  'glass': 'гласс',
  'sandal': 'сандал',
  'metall': 'металл'
};

function normalizeString(str) {
  if (!str) return '';
  let s = String(str).toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Apply transliteration
  for (const [en, ru] of Object.entries(TRANSLIT_MAP)) {
    s = s.replace(new RegExp('\\b' + en + '\\b', 'g'), ru);
  }
  return s;
}

function parsePriceNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Math.round(val);
  const s = String(val).replace(/\s+/g, '').replace(/,/g, '.');
  const match = s.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    return Math.round(num);
  }
  return null;
}

function parseDualPrices(val) {
  if (!val) return { primary: null, secondary: null };
  if (typeof val === 'number') return { primary: Math.round(val), secondary: null };
  const s = String(val).replace(/\s+/g, '');
  const parts = s.split(/[\/\-]/);
  const p1 = parsePriceNumber(parts[0]);
  const p2 = parts.length > 1 ? parsePriceNumber(parts[1]) : null;
  return { primary: p1, secondary: p2 };
}

function detectSupplier(text, filename = '') {
  const combined = (filename + ' ' + (text || '')).toLowerCase();
  if (combined.includes('vira') || combined.includes('вира')) return 'VIRA_DOORS';
  if (combined.includes('эконом') || combined.includes('vip нал')) return 'GK_ECONOM';
  if (combined.includes('gk металл') || combined.includes('dveri_gk') || combined.includes('termoclassic')) return 'GK_METALL';
  if (combined.includes('ferroni') || combined.includes('феррони') || combined.includes('luxor') || combined.includes('стройгост')) return 'FERRONI_LUXOR';
  if (combined.includes('fsd') || combined.includes('фсд') || combined.includes('федеральный склад')) return 'FSD';
  if (combined.includes('chameleon') || combined.includes('хамелеон')) return 'CHAMELEON';
  if (combined.includes('голливуд') || combined.includes('двереки') || combined.includes('экошпон')) return 'MEZH_DOORS';
  return 'GENERIC';
}

function detectDate(text, filename = '') {
  const combined = filename + ' ' + (text || '');
  const m = combined.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/);
  if (m) {
    return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[3]}`;
  }
  return new Date().toLocaleDateString('ru-RU');
}

// ------------------------------------------------------------------------------
// 3. ИМПОРТ И ПАРСИНГ ПРАЙС-ЛИСТОВ (XLSX, XLS, CSV, DOCX, PDF, RAW TEXT)
// ------------------------------------------------------------------------------
async function parsePriceListFile({ buffer, filename, textContent, forcedSupplier }) {
  let rawRows = [];
  let detectedSupplier = forcedSupplier || null;
  let detectedDateStr = null;
  let fullRawText = textContent || '';

  const ext = filename ? path.extname(filename).toLowerCase() : '';

  // 1. DOCX
  if (ext === '.docx' && buffer) {
    const docRes = await mammoth.extractRawText({ buffer });
    fullRawText = docRes.value;
  }
  // 2. PDF
  else if (ext === '.pdf' && buffer) {
    const parser = new PDFParse(new Uint8Array(buffer));
    const pdfRes = await parser.getText();
    fullRawText = pdfRes.text;
  }
  // 3. Excel (XLSX / XLS)
  else if ((ext === '.xlsx' || ext === '.xls') && buffer) {
    const wb = xlsx.read(buffer, { type: 'buffer' });
    wb.SheetNames.forEach(sheetName => {
      const ws = wb.Sheets[sheetName];
      const sheetRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
      sheetRows.forEach((r, idx) => {
        if (Array.isArray(r) && r.some(cell => String(cell).trim().length > 0)) {
          rawRows.push({ sheet: sheetName, rowIdx: idx, cells: r.map(c => String(c).trim()) });
        }
      });
    });
  }

  // If plain text / CSV / TSV
  if (rawRows.length === 0 && fullRawText) {
    const lines = fullRawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    lines.forEach((line, idx) => {
      let cells = [];
      if (line.includes('\t')) {
        cells = line.split('\t').map(c => c.trim());
      } else if (line.includes(';') && !line.includes('  ')) {
        cells = line.split(';').map(c => c.trim());
      } else if (line.includes(',') && !line.includes('  ')) {
        cells = line.split(',').map(c => c.trim());
      } else {
        const match = line.match(/^([^–\-—\d]+(?:[–\-—]\s*\d+[a-zа-я]*)?)\s*[–\-—:]\s*(\d+.*)$/i);
        if (match) {
          cells = [match[1].trim(), match[2].trim()];
        } else {
          cells = [line];
        }
      }
      rawRows.push({ sheet: 'Default', rowIdx: idx, cells });
    });
  }

  if (!detectedSupplier) {
    detectedSupplier = detectSupplier(fullRawText, filename);
  }
  detectedDateStr = detectDate(fullRawText, filename);

  const extractedItems = [];

  rawRows.forEach(item => {
    const cells = item.cells;
    if (cells.length === 0) return;

    let model = '';
    let code = '';
    let primaryPrice = null;
    let secondaryPrice = null;
    let customOrderPrice = null;

    let textParts = [];
    let priceValues = [];

    cells.forEach(c => {
      if (!c) return;
      const dual = parseDualPrices(c);
      if (dual.primary && dual.primary >= 1000) {
        priceValues.push(dual);
      } else {
        textParts.push(c);
      }
    });

    const fullLine = cells.join(' ');
    if (fullLine.toLowerCase().includes('под заказ') && fullLine.match(/под заказ\s*(\d+)/i)) {
      const m = fullLine.match(/под заказ\s*(\d+)/i);
      if (m) customOrderPrice = parsePriceNumber(m[1]);
    }

    if (textParts.length > 0 && priceValues.length > 0) {
      model = textParts[0];
      if (/^\d+[\.\)]?$/.test(model) && textParts.length > 1) {
        model = textParts[1];
      }

      const codeMatch = model.match(/([a-zа-я0-9]{2,}-\d+)/i);
      if (codeMatch) code = codeMatch[1];

      primaryPrice = priceValues[0].primary;
      secondaryPrice = priceValues[0].secondary || (priceValues.length > 1 ? priceValues[1].primary : null);

      const cleanModel = model.replace(/\s+/g, ' ').trim();
      const isHeader = cleanModel.toLowerCase().includes('наименование') ||
        cleanModel.toLowerCase().includes('прайс-лист') ||
        cleanModel.toLowerCase().includes('правила работы') ||
        cleanModel.toLowerCase().includes('режим работы') ||
        cleanModel.toLowerCase().includes('модель') && primaryPrice === null;

      if (!isHeader && cleanModel.length >= 2 && primaryPrice >= 1000) {
        extractedItems.push({
          rawModel: cleanModel,
          rawCode: code || null,
          purchasePrice: primaryPrice,
          purchasePriceSecondary: secondaryPrice,
          customOrderPrice: customOrderPrice,
          supplier: detectedSupplier,
          rawLine: fullLine
        });
      }
    }
  });

  return {
    supplier: detectedSupplier,
    supplierInfo: SUPPLIERS[detectedSupplier] || SUPPLIERS.GENERIC,
    date: detectedDateStr,
    filename: filename || 'Буфер обмена / Ввод текста',
    totalParsedRows: extractedItems.length,
    items: extractedItems
  };
}

// ------------------------------------------------------------------------------
// 4. СИСТЕМА СОПОСТАВЛЕНИЯ ТОВАРОВ (PRODUCT MATCHING ENGINE)
// ------------------------------------------------------------------------------
function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) return [];
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

function matchWithCatalog(extractedItems, supplierKey) {
  const catalog = loadCatalog();
  const supplierConfig = SUPPLIERS[supplierKey] || SUPPLIERS.GENERIC;

  const matchedResults = [];

  extractedItems.forEach((item, index) => {
    const rawModelClean = item.rawModel.split(/[;,]/)[0].trim();
    const rawModelNorm = normalizeString(rawModelClean);
    const rawCodeNorm = item.rawCode ? normalizeString(item.rawCode) : '';

    let bestProduct = null;
    let bestScore = 0;
    let matchType = 'not_found';
    let candidates = [];

    // Specific VIRA matcher (e.g. "VIRA 1" -> "ВИРА-1")
    const viraMatch = item.rawModel.match(/^(vira|вира)\s*(\d+)/i);
    if (viraMatch) {
      const viraNum = viraMatch[2];
      const found = catalog.find(p => p.brand === 'ViraDoors' && (p.model.includes('ВИРА-' + viraNum) || p.model.includes('ВИРА ' + viraNum)));
      if (found) {
        candidates.push({ product: found, score: 0.98 });
      }
    }

    // General matching
    catalog.forEach(p => {
      let score = 0;
      const pModelNorm = normalizeString(p.model);
      const pBrandNorm = normalizeString(p.brand);
      const pCollNorm = normalizeString(p.collection);
      const pIdNorm = normalizeString(p.id);
      const pArtNorm = p.article ? normalizeString(p.article) : '';

      const hasBrandAffinity = supplierConfig.brandMatch.some(b => (p.brand || '').toLowerCase().includes(b.toLowerCase()));

      // 1. Точный артикул / ID
      if (rawCodeNorm && (pArtNorm === rawCodeNorm || pIdNorm === rawCodeNorm)) {
        score = 1.0;
      }
      // 2. Точное название модели
      else if (pModelNorm === rawModelNorm) {
        score = 0.95;
      }
      // 3. Подстрока без пробелов и тире
      else {
        const compactRaw = rawModelNorm.replace(/[^a-zа-я0-9]/gi, '');
        const compactP = pModelNorm.replace(/[^a-zа-я0-9]/gi, '');

        if (compactRaw.length >= 3 && (compactP === compactRaw || compactP.startsWith(compactRaw) || compactRaw.startsWith(compactP))) {
          score = 0.90;
        } else {
          // 4. Совпадение токенов
          const itemTokens = rawModelNorm.split(' ').filter(t => t.length > 1 && !['дверь', 'межкомнатная', 'входная', 'мм', 'см', 'руб'].includes(t));
          const pTokens = (pModelNorm + ' ' + pCollNorm).split(' ').filter(t => t.length > 1);

          if (itemTokens.length > 0) {
            let tokenMatches = 0;
            itemTokens.forEach(t => {
              if (pTokens.includes(t)) {
                tokenMatches += 1.0;
              } else if (pTokens.some(pt => pt.startsWith(t) || t.startsWith(pt))) {
                tokenMatches += 0.8;
              }
            });
            score = tokenMatches / Math.max(itemTokens.length, 1);
          }
        }
      }

      if (hasBrandAffinity) score += 0.05;

      if (score > 0.50) {
        candidates.push({ product: p, score: Math.min(score, 1.0) });
      }
    });

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      bestProduct = candidates[0].product;
      bestScore = candidates[0].score;

      if (bestScore >= 0.85) {
        matchType = 'exact';
      } else if (bestScore >= 0.65) {
        if (candidates.length > 1 && (bestScore - candidates[1].score) < 0.10) {
          matchType = 'manual_check';
        } else {
          matchType = 'probable';
        }
      } else {
        matchType = 'manual_check';
      }
    } else {
      matchType = 'not_found';
    }

    // Pricing calculation
    const markup = 10000; // Fixed +10 000 RUB rule
    const newPurchase = item.purchasePrice;
    const newRetail = newPurchase + markup;

    let oldPurchase = null;
    let oldRetail = null;
    let diffRetail = 0;
    let changeType = 'new_price';

    if (bestProduct) {
      oldPurchase = bestProduct.dealer_price || (bestProduct.price - markup);
      oldRetail = bestProduct.price;
      diffRetail = newRetail - oldRetail;

      if (Math.abs(diffRetail) === 0) {
        changeType = 'unchanged';
      } else {
        changeType = 'changed_price';
      }
    } else {
      changeType = 'new_item';
    }

    matchedResults.push({
      rowId: 'ROW-' + (index + 1),
      rawModel: item.rawModel,
      rawCode: item.rawCode,
      supplier: supplierConfig.name,
      supplierKey: supplierConfig.key,
      purchasePrice: newPurchase,
      purchasePriceSecondary: item.purchasePriceSecondary,
      customOrderPrice: item.customOrderPrice,
      matchedProduct: bestProduct ? {
        id: bestProduct.id,
        model: bestProduct.model,
        brand: bestProduct.brand,
        collection: bestProduct.collection,
        category: bestProduct.category,
        image: (bestProduct.images && bestProduct.images.length > 0) ? bestProduct.images[0] : null
      } : null,
      matchScore: Math.round(bestScore * 100),
      matchType,
      oldPurchase,
      newPurchase,
      markup,
      oldRetail,
      newRetail,
      diffRetail,
      changeType,
      isApproved: matchType === 'exact' && changeType !== 'unchanged'
    });
  });

  return matchedResults;
}

// ------------------------------------------------------------------------------
// 5. ПРИМЕНЕНИЕ ИЗМЕНЕНИЙ И ЖУРНАЛ ИСТОРИИ (AUDIT LOG)
// ------------------------------------------------------------------------------
function applyPriceUpdates(approvedItems, adminUser = 'Администратор') {
  const catalog = loadCatalog();
  const history = fs.existsSync(HISTORY_PATH) ? JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')) : [];

  let updatedCount = 0;
  const historyRecords = [];

  approvedItems.forEach(item => {
    const targetId = item.productId || (item.matchedProduct && item.matchedProduct.id);
    if (!targetId) return;

    const prod = catalog.find(p => p.id === targetId);
    if (!prod) return;

    const cat = prod.category || '';
    if (cat.includes('Декоративные элементы') || cat.includes('Комплектующие') || cat.includes('Плинтус')) {
      return;
    }

    const prevPurchase = prod.dealer_price || (prod.price - 10000);
    const prevRetail = prod.price;

    const nextPurchase = item.newPurchase || item.purchasePrice;
    const nextRetail = nextPurchase + 10000;

    prod.dealer_price = nextPurchase;
    prod.price = nextRetail;

    if (prod.kit_price && prod.kit_price > 0) {
      const kitDiff = prod.kit_price - prevRetail;
      prod.kit_price = nextRetail + (kitDiff > 0 ? kitDiff : 0);
    }

    if (prod.leaf_price && prod.leaf_price > 0) {
      prod.leaf_price = nextRetail;
    }

    if (Array.isArray(prod.variants)) {
      prod.variants.forEach(v => {
        if (v.price) v.price = nextRetail;
      });
    }

    updatedCount++;

    historyRecords.push({
      productId: prod.id,
      model: prod.model,
      brand: prod.brand,
      supplier: item.supplier || prod.brand,
      oldPurchase: prevPurchase,
      newPurchase: nextPurchase,
      oldRetail: prevRetail,
      newRetail: nextRetail,
      diff: nextRetail - prevRetail
    });
  });

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

  const jsData = 'window.CATALOG_PRODUCTS = ' + JSON.stringify(catalog, null, 2) + ';\n';
  fs.writeFileSync(JS_CATALOG_PATH, jsData, 'utf8');

  const logEntry = {
    id: 'HIST-' + Date.now(),
    date: new Date().toISOString(),
    displayDate: new Date().toLocaleString('ru-RU'),
    admin: adminUser,
    appliedCount: updatedCount,
    items: historyRecords
  };
  history.unshift(logEntry);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');

  return {
    success: true,
    appliedCount: updatedCount,
    logId: logEntry.id
  };
}

function getPriceHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch (e) {
    return [];
  }
}

module.exports = {
  SUPPLIERS,
  parsePriceListFile,
  matchWithCatalog,
  applyPriceUpdates,
  getPriceHistory,
  loadCatalog,
  normalizeString,
  parsePriceNumber,
  parseDualPrices
};
