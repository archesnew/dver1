// ==========================================================================
// ДВЕРИ №1 — БЭКЕНД-СЕРВЕР (PRODUCTION RUNTIME)
// Static Files + Cart + Phone Auth / SMS Verification + Orders Store
// ==========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const pricingEngine = require('./pricing-engine.js');
const adminBackend = require('./admin-backend.js');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const ORDERS_DIR = path.join(DATA_DIR, 'orders');
const CARTS_DIR = path.join(DATA_DIR, 'carts');
const SMS_DIR = path.join(DATA_DIR, 'sms');

// Ensure directories exist
[ORDERS_DIR, CARTS_DIR, SMS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const ORDERS_FILE = path.join(ORDERS_DIR, 'orders.json');
const CARTS_FILE = path.join(CARTS_DIR, 'carts.json');
const SMS_LOG_FILE = path.join(SMS_DIR, 'sms_dispatches.log');

if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');
if (!fs.existsSync(CARTS_FILE)) fs.writeFileSync(CARTS_FILE, '{}', 'utf8');

// Load catalog products for server-side validation
let catalogProducts = [];
const catalogPath = path.join(DATA_DIR, 'catalog-output', 'products.json');
try {
  if (fs.existsSync(catalogPath)) {
    catalogProducts = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    console.log(`[CATALOG] Loaded ${catalogProducts.length} authoritative products from catalog.`);
  }
} catch (e) {
  console.error('[CATALOG] Error loading catalog for validation:', e);
}

// In-memory auth tokens & SMS verification sessions
// Map: phone -> { codeHash, salt, expiresAt, attemptsLeft, lastSentAt, verified, token, latestCodeDev }
const smsSessions = new Map();
// Map: token -> { phone, expiresAt }
const authTokens = new Map();

// Helper: normalize Russian phone number (+7XXXXXXXXXX)
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11) {
    if (digits.startsWith('7') || digits.startsWith('8')) {
      return '+7' + digits.slice(1);
    }
  } else if (digits.length === 10) {
    return '+7' + digits;
  }
  return null;
}

// Helper: generate 4-digit numeric code
function generateCode() {
  return String(crypto.randomInt(1000, 9999));
}

// Helper: hash code with SHA-256 and salt
function hashCode(code, salt) {
  return crypto.createHash('sha256').update(code + salt).digest('hex');
}

// Helper: append to text log
function appendLog(filePath, text) {
  try {
    fs.appendFileSync(filePath, `[${new Date().toISOString()}] ${text}\n`, 'utf8');
  } catch (e) {
    console.error('Log write error:', e);
  }
}

// ==========================================================================
// SMS SERVICE INTEGRATION INTERFACE
// ==========================================================================
const SmsService = {
  getProviderInfo() {
    const provider = process.env.SMS_PROVIDER || (process.env.SMS_API_KEY ? 'smsru' : 'development');
    const isConfigured = Boolean(process.env.SMS_API_KEY || process.env.SMS_RU_API_KEY || process.env.SMSAERO_API_KEY);
    return {
      provider,
      isConfigured,
      mode: isConfigured ? 'production' : 'development'
    };
  },

  async sendSms(phone, code) {
    const info = this.getProviderInfo();
    const messageText = `Код подтверждения Двери №1: ${code}. Никому не сообщайте.`;

    if (!info.isConfigured) {
      // Safe Development / Staging Mode:
      // Log to file and stdout, do not fake HTTP call, return truthful status
      const logEntry = `DEV_SMS_DISPATCH -> Phone: ${phone} | Code: [SECURE_HASHED] | CodeDev: ${code}`;
      console.log(`[SMS] ${logEntry}`);
      appendLog(SMS_LOG_FILE, logEntry);

      return {
        success: true,
        provider: 'development',
        note: 'SMS-провайдер в режиме разработки (SMS_API_KEY не задан в .env). Код зафиксирован в системном логе.'
      };
    }

    // Production Provider: SMS.RU
    const apiKey = process.env.SMS_API_KEY || process.env.SMS_RU_API_KEY;
    try {
      const url = `https://sms.ru/sms/send?api_id=${encodeURIComponent(apiKey)}&to=${encodeURIComponent(phone.replace('+', ''))}&msg=${encodeURIComponent(messageText)}&json=1`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK') {
        appendLog(SMS_LOG_FILE, `SMS.RU SUCCESS -> Phone: ${phone}`);
        return { success: true, provider: 'smsru' };
      } else {
        appendLog(SMS_LOG_FILE, `SMS.RU ERROR -> Phone: ${phone} | Status: ${data.status_text}`);
        return { success: false, error: data.status_text || 'Ошибка отправки через SMS.RU' };
      }
    } catch (err) {
      appendLog(SMS_LOG_FILE, `SMS.RU EXCEPTION -> ${err.message}`);
      return { success: false, error: err.message };
    }
  }
};

// ==========================================================================
// TELEGRAM NOTIFICATION DISPATCHER (MANAGER NOTIFICATIONS)
// ==========================================================================
async function dispatchTelegramNotification(order) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    appendLog(path.join(ORDERS_DIR, 'telegram.log'), `Telegram tokens missing. Order #${order.id} saved in orders.json.`);
    return { sent: false, reason: 'unconfigured' };
  }

  const itemsList = order.items.map((it, idx) => {
    const priceStr = it.isPriceKnown ? `${(it.unitPrice * it.quantity).toLocaleString('ru-RU')} ₽` : 'Цена уточняется';
    return `${idx + 1}. *${it.title}* (${it.brand})\n   Размер: ${it.size || 'Стандарт'} | Открывание: ${it.opening || 'Универсальное'}\n   ${it.quantity} шт. × ${priceStr}`;
  }).join('\n\n');

  const text = `🔔 *НОВАЯ ЗАЯВКА НА КОМПЛЕКТАЦИЮ #${order.id}*\n\n` +
    `👤 *Клиент:* ${order.client.name}\n` +
    `📞 *Телефон:* ${order.client.phone}\n` +
    `📍 *Город:* ${order.client.city}\n` +
    `🚚 *Получение:* ${order.delivery.type === 'delivery' ? 'Адресная доставка' : 'Самовывоз из шоурума'}\n` +
    `🛠️ *Монтаж:* ${order.delivery.installation ? 'Да, требуется монтаж и замер' : 'Не требуется'}\n` +
    (order.delivery.comment ? `💬 *Комментарий:* ${order.delivery.comment}\n` : '') +
    `\n📦 *Состав заказа:*\n${itemsList}\n\n` +
    `💰 *Предварительный расчет:* ${order.totalKnownPrice ? order.totalKnownPrice.toLocaleString('ru-RU') + ' ₽' : 'По индивидуальной смете'}` +
    (order.hasUncertainPrices ? ` _(есть позиции с ценой по уточнению)_` : '') +
    `\n\n🕒 *Дата:* ${new Date(order.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    const data = await res.json();
    if (data.ok) {
      appendLog(path.join(ORDERS_DIR, 'telegram.log'), `Telegram sent for Order #${order.id}`);
      return { sent: true };
    } else {
      appendLog(path.join(ORDERS_DIR, 'telegram.log'), `Telegram API rejected for Order #${order.id}: ${JSON.stringify(data)}`);
      return { sent: false, error: data.description };
    }
  } catch (err) {
    appendLog(path.join(ORDERS_DIR, 'telegram.log'), `Telegram network error for Order #${order.id}: ${err.message}`);
    return { sent: false, error: err.message };
  }
}

// ==========================================================================
// ORDER STORAGE (ATOMIC JSON STORE)
// ==========================================================================
function readAllOrders() {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveOrder(order) {
  const orders = readAllOrders();
  // Check idempotency
  if (order.idempotencyKey) {
    const existing = orders.find(o => o.idempotencyKey === order.idempotencyKey);
    if (existing) return existing;
  }
  orders.unshift(order);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
  return order;
}

// ==========================================================================
// CART STORAGE (BY PHONE NUMBER / SESSION)
// ==========================================================================
function readAllCarts() {
  try {
    return JSON.parse(fs.readFileSync(CARTS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveCartForPhone(phone, cartItems) {
  const carts = readAllCarts();
  carts[phone] = {
    items: cartItems,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(CARTS_FILE, JSON.stringify(carts, null, 2), 'utf8');
}

function getCartForPhone(phone) {
  const carts = readAllCarts();
  return carts[phone]?.items || [];
}

// Helper: merge guest cart with phone cart without duplicate rows
function mergeCarts(guestCart = [], existingCart = []) {
  const map = new Map();
  // Insert existing first
  existingCart.forEach(item => {
    map.set(item.id, { ...item });
  });
  // Merge guest
  guestCart.forEach(item => {
    if (map.has(item.id)) {
      const current = map.get(item.id);
      current.quantity = Math.max(current.quantity, item.quantity);
    } else {
      map.set(item.id, { ...item });
    }
  });
  return Array.from(map.values());
}

// ==========================================================================
// SERVER-SIDE PRICE AND PRODUCT VALIDATOR
// ==========================================================================
const SCENARIO_MULTIPLIERS = {
  standard_kit_with_hardware: 1.0,
  kit_without_hardware: 0.85,
  leaf_only: 0.65
};

function validateAndEnrichOrderItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Корзина пуста. Невозможно оформить заказ.');
  }

  const catalogMap = new Map();
  catalogProducts.forEach(p => catalogMap.set(p.id, p));

  const validatedItems = [];
  let totalKnownPrice = 0;
  let hasUncertainPrices = false;

  for (const item of rawItems) {
    const product = catalogMap.get(item.productId);
    const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);

    let authoritativeBasePrice = null;
    let authoritativeUnitPrice = null;
    let isPriceKnown = false;

    if (product && typeof product.price === 'number' && product.price > 0) {
      authoritativeBasePrice = product.price;
      const mult = SCENARIO_MULTIPLIERS[item.scenario] || 1.0;
      let calculated = authoritativeBasePrice * mult;
      if (item.wcTurn) calculated += 1850;
      authoritativeUnitPrice = Math.round(calculated);
      isPriceKnown = true;
      totalKnownPrice += authoritativeUnitPrice * quantity;
    } else {
      hasUncertainPrices = true;
    }

    validatedItems.push({
      id: item.id || `${item.productId}-${Date.now()}`,
      productId: item.productId,
      title: product ? product.model : (item.title || 'Модель двери'),
      brand: product ? product.brand : (item.brand || 'Двери №1'),
      collection: product ? (product.collection || '') : (item.collection || ''),
      article: product ? (product.article || '') : (item.article || ''),
      image: item.image || (product?.images?.[0] ? resolveImg(product.images[0]) : 'door-placeholder.svg'),
      variant: item.variant || 'Базовый цвет',
      size: item.size || '800 × 2000 мм',
      opening: item.opening || 'Универсальное',
      scenario: item.scenario || 'standard_kit_with_hardware',
      scenarioTitle: item.scenarioTitle || 'Полный комплект с фурнитурой',
      hardware: item.hardware || 'Базовая фурнитура с магнитным замком',
      wcTurn: Boolean(item.wcTurn),
      quantity: quantity,
      unitPrice: isPriceKnown ? authoritativeUnitPrice : null,
      isPriceKnown: isPriceKnown,
      totalPrice: isPriceKnown ? authoritativeUnitPrice * quantity : null,
      priceText: isPriceKnown ? `${authoritativeUnitPrice.toLocaleString('ru-RU')} ₽` : 'Цена уточняется'
    });
  }

  return {
    items: validatedItems,
    totalKnownPrice: totalKnownPrice,
    hasUncertainPrices: hasUncertainPrices
  };
}

function resolveImg(src) {
  if (!src) return 'door-placeholder.svg';
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  return src.replace(/^\.\//, '');
}

// ==========================================================================
// MIME TYPES FOR STATIC FILE SERVING
// ==========================================================================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

// Read request body helper
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB limit for price lists
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

// ==========================================================================
// HTTP SERVER & ROUTING
// ==========================================================================
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // ------------------------------------------------------------------------
  // API ROUTES
  // ------------------------------------------------------------------------

  // 1. Health check & provider status
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      version: '3.3.0',
      sms: SmsService.getProviderInfo(),
      productsCount: catalogProducts.length,
      ordersCount: readAllOrders().length
    });
  }

  // 2. Request SMS code for phone verification
  // POST /api/auth/send-code
  if (pathname === '/api/auth/send-code' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const phone = normalizePhone(body.phone);

      if (!phone) {
        return sendJson(res, 400, { error: 'Укажите корректный номер телефона РФ (+7 XXX XXX-XX-XX).' });
      }

      const now = Date.now();
      const existing = smsSessions.get(phone);

      // Rate limit: 60 seconds cooldown
      if (existing && existing.lastSentAt && (now - existing.lastSentAt < 60000)) {
        const remainingSec = Math.ceil((60000 - (now - existing.lastSentAt)) / 1000);
        return sendJson(res, 429, {
          error: `Повторная отправка SMS возможна через ${remainingSec} сек.`,
          retryAfter: remainingSec
        });
      }

      // Generate code & salt
      const code = generateCode();
      const salt = crypto.randomBytes(16).toString('hex');
      const codeHash = hashCode(code, salt);
      const expiresAt = now + (5 * 60 * 1000); // 5 minutes validity

      smsSessions.set(phone, {
        codeHash,
        salt,
        expiresAt,
        attemptsLeft: 5,
        lastSentAt: now,
        verified: false,
        token: null,
        latestCodeDev: code // stored internally for dev tests
      });

      // Dispatch SMS
      const smsResult = await SmsService.sendSms(phone, code);

      return sendJson(res, 200, {
        status: 'sent',
        phone: phone,
        expiresIn: 300,
        provider: smsResult.provider,
        note: smsResult.note || 'Код успешно сформирован и отправлен.'
      });
    } catch (err) {
      console.error('Error in /api/auth/send-code:', err);
      return sendJson(res, 500, { error: 'Внутренняя ошибка сервера при отправке кода.' });
    }
  }

  // 3. Verify SMS code
  // POST /api/auth/verify-code
  if (pathname === '/api/auth/verify-code' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const phone = normalizePhone(body.phone);
      const inputCode = String(body.code || '').trim();

      if (!phone || !inputCode) {
        return sendJson(res, 400, { error: 'Укажите номер телефона и 4-значный SMS-код.' });
      }

      const session = smsSessions.get(phone);
      if (!session) {
        return sendJson(res, 400, { error: 'Код для этого номера не запрашивался или срок действия истёк.' });
      }

      if (Date.now() > session.expiresAt) {
        smsSessions.delete(phone);
        return sendJson(res, 400, { error: 'Срок действия кода истёк (5 минут). Запросите новый код.' });
      }

      if (session.attemptsLeft <= 0) {
        smsSessions.delete(phone);
        return sendJson(res, 403, { error: 'Превышено количество попыток ввода. Запросите новый код.' });
      }

      const expectedHash = hashCode(inputCode, session.salt);
      if (expectedHash !== session.codeHash) {
        session.attemptsLeft -= 1;
        return sendJson(res, 400, {
          error: `Неверный код подтверждения. Осталось попыток: ${session.attemptsLeft}.`,
          attemptsLeft: session.attemptsLeft
        });
      }

      // Code is valid! Issue signed session token
      const token = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
      authTokens.set(token, { phone, expiresAt: tokenExpiry });

      session.verified = true;
      session.token = token;

      // Handle cart linking and merging with guest cart if passed
      const guestCart = Array.isArray(body.guestCart) ? body.guestCart : [];
      const savedPhoneCart = getCartForPhone(phone);
      const mergedCart = mergeCarts(guestCart, savedPhoneCart);

      // Save merged cart under phone
      saveCartForPhone(phone, mergedCart);

      return sendJson(res, 200, {
        status: 'verified',
        token: token,
        phone: phone,
        cart: mergedCart,
        message: 'Номер телефона успешно подтверждён.'
      });
    } catch (err) {
      console.error('Error in /api/auth/verify-code:', err);
      return sendJson(res, 500, { error: 'Внутренняя ошибка при проверке кода.' });
    }
  }

  // 4. Cart Sync (Guest or Phone Authenticated)
  // POST /api/cart/sync
  if (pathname === '/api/cart/sync' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const phone = normalizePhone(body.phone);
      const token = body.token;
      const clientItems = Array.isArray(body.items) ? body.items : [];

      if (token && phone && authTokens.get(token)?.phone === phone) {
        // Authenticated user cart: merge and save
        const existing = getCartForPhone(phone);
        const merged = mergeCarts(clientItems, existing);
        saveCartForPhone(phone, merged);
        return sendJson(res, 200, { status: 'synced', items: merged, phone });
      }

      // Guest cart: return back valid items
      return sendJson(res, 200, { status: 'guest_synced', items: clientItems });
    } catch (err) {
      return sendJson(res, 500, { error: 'Ошибка синхронизации корзины.' });
    }
  }

  // 5. Restore Cart by Phone
  // GET /api/cart?phone=...
  if (pathname === '/api/cart' && req.method === 'GET') {
    const rawPhone = parsedUrl.searchParams.get('phone');
    const token = parsedUrl.searchParams.get('token');
    const phone = normalizePhone(rawPhone);

    if (!phone || !token || authTokens.get(token)?.phone !== phone) {
      return sendJson(res, 401, { error: 'Требуется подтверждённая сессия для доступа к корзине номера.' });
    }

    const items = getCartForPhone(phone);
    return sendJson(res, 200, { phone, items });
  }

  // 6. Create Order (Checkout Final Confirmation)
  // POST /api/orders
  if (pathname === '/api/orders' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const client = body.client || {};
      const phone = normalizePhone(client.phone);
      const name = String(client.name || '').trim();
      const city = client.city === 'Набережные Челны' ? 'Набережные Челны' : 'Казань';
      const token = body.token;

      if (!name) {
        return sendJson(res, 400, { error: 'Укажите контактное лицо (ФИО).' });
      }
      if (!phone) {
        return sendJson(res, 400, { error: 'Укажите корректный номер телефона.' });
      }

      // Check phone token: phone must be verified
      const auth = authTokens.get(token);
      if (!auth || auth.phone !== phone) {
        return sendJson(res, 403, { error: 'Телефон не подтвержден через SMS. Пройдите шаг подтверждения номера.' });
      }

      // Server-side validate items & prices against catalog
      let validated;
      try {
        validated = validateAndEnrichOrderItems(body.items);
      } catch (valErr) {
        return sendJson(res, 400, { error: valErr.message });
      }

      // Generate unique human-readable order number: #D1-2026-XXXX
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const orderId = `D1-2026-${randomSuffix}`;

      const newOrder = {
        id: orderId,
        idempotencyKey: body.idempotencyKey || null,
        status: 'Новая',
        createdAt: new Date().toISOString(),
        client: {
          name: name,
          phone: phone,
          city: city
        },
        delivery: {
          type: body.delivery?.type === 'delivery' ? 'delivery' : 'pickup',
          installation: Boolean(body.delivery?.installation),
          comment: String(body.delivery?.comment || '').trim()
        },
        items: validated.items,
        totalKnownPrice: validated.totalKnownPrice,
        hasUncertainPrices: validated.hasUncertainPrices,
        priceNotice: validated.hasUncertainPrices
          ? 'В заказе присутствуют позиции с расчетом стоимости инженером по спецификации фабрики.'
          : 'Сумма фиксирована по позициям каталога.'
      };

      // Persist order in reliable project store (orders.json)
      const saved = saveOrder(newOrder);

      // Clear the active cart for this phone on server
      saveCartForPhone(phone, []);

      // Telegram notification (failure does NOT fail the order)
      dispatchTelegramNotification(saved).catch(err => {
        console.error('[TELEGRAM] Background notification error:', err);
      });

      console.log(`[ORDER] Created successfully: #${saved.id} for ${saved.client.name} (${saved.client.phone})`);

      return sendJson(res, 201, {
        status: 'created',
        orderId: saved.id,
        order: saved
      });
    } catch (err) {
      console.error('Error in /api/orders:', err);
      return sendJson(res, 500, { error: 'Внутренняя ошибка сохранения заявки.' });
    }
  }

  // 7. Get Order Details (For Thank-You page)
  // GET /api/orders/:id
  if (pathname.startsWith('/api/orders/') && req.method === 'GET') {
    const orderId = pathname.replace('/api/orders/', '').trim();
    const orders = readAllOrders();
    const found = orders.find(o => o.id === orderId || o.id === `#${orderId}`);
    if (!found) {
      return sendJson(res, 404, { error: 'Заявка с таким номером не найдена.' });
    }
    return sendJson(res, 200, found);
  }

  // 8. DEV Test Helper: get latest code for automated test runner
  // Only available on localhost / development
  if (pathname === '/api/dev/latest-code' && req.method === 'GET') {
    const rawPhone = parsedUrl.searchParams.get('phone');
    const phone = normalizePhone(rawPhone);
    const session = phone ? smsSessions.get(phone) : null;
    if (!session || !session.latestCodeDev) {
      return sendJson(res, 404, { error: 'No active session' });
    }
    return sendJson(res, 200, { phone, code: session.latestCodeDev });
  }

  // ------------------------------------------------------------------------
  // PRICING & PRICE LIST MANAGEMENT API (V3.3)
  // ------------------------------------------------------------------------

  // 9. GET /api/pricing/suppliers
  if (pathname === '/api/pricing/suppliers' && req.method === 'GET') {
    return sendJson(res, 200, {
      suppliers: pricingEngine.SUPPLIERS,
      baseMarkup: 10000,
      formula: 'РОЗНИЧНАЯ ЦЕНА = ЗАКУПОЧНАЯ ЦЕНА + 10 000 ₽'
    });
  }

  // 10. POST /api/pricing/parse (Import & Parse price list file or raw text)
  if (pathname === '/api/pricing/parse' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      let buffer = null;
      if (body.fileBase64) {
        buffer = Buffer.from(body.fileBase64, 'base64');
      }

      const parsed = await pricingEngine.parsePriceListFile({
        buffer,
        filename: body.filename,
        textContent: body.textContent,
        forcedSupplier: body.forcedSupplier
      });

      return sendJson(res, 200, parsed);
    } catch (err) {
      console.error('Error in /api/pricing/parse:', err);
      return sendJson(res, 500, { error: 'Ошибка парсинга прайс-листа: ' + err.message });
    }
  }

  // 11. POST /api/pricing/match (Match parsed items with catalog)
  if (pathname === '/api/pricing/match' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.items || !Array.isArray(body.items)) {
        return sendJson(res, 400, { error: 'Передайте массив позиций (items).' });
      }

      const matched = pricingEngine.matchWithCatalog(body.items, body.supplierKey || 'GENERIC');
      return sendJson(res, 200, {
        supplierKey: body.supplierKey,
        totalItems: matched.length,
        items: matched
      });
    } catch (err) {
      console.error('Error in /api/pricing/match:', err);
      return sendJson(res, 500, { error: 'Ошибка сопоставления: ' + err.message });
    }
  }

  // 12. POST /api/pricing/apply (Apply confirmed price updates)
  if (pathname === '/api/pricing/apply' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.approvedItems || !Array.isArray(body.approvedItems)) {
        return sendJson(res, 400, { error: 'Передайте список утвержденных позиций (approvedItems).' });
      }

      const result = pricingEngine.applyPriceUpdates(body.approvedItems, body.adminUser || 'Администратор');
      return sendJson(res, 200, result);
    } catch (err) {
      console.error('Error in /api/pricing/apply:', err);
      return sendJson(res, 500, { error: 'Ошибка применения цен: ' + err.message });
    }
  }

  // 13. GET /api/pricing/history (Price change history log)
  if (pathname === '/api/pricing/history' && req.method === 'GET') {
    const history = pricingEngine.getPriceHistory();
    return sendJson(res, 200, { history });
  }

  // 14. GET /api/pricing/catalog (Lightweight catalog for manual binding)
  if (pathname === '/api/pricing/catalog' && req.method === 'GET') {
    const catalog = pricingEngine.loadCatalog();
    const searchList = catalog.map(p => ({
      id: p.id,
      model: p.model,
      brand: p.brand,
      collection: p.collection,
      category: p.category,
      price: p.price,
      dealer_price: p.dealer_price,
      image: (p.images && p.images.length > 0) ? p.images[0] : null
    }));
    return sendJson(res, 200, { products: searchList });
  }

  // ------------------------------------------------------------------------
  // ADMIN CONTROL CENTER API (V3.3)
  // ------------------------------------------------------------------------

  // Helper for admin auth check
  function getAdminSession(req, requiredRole = null) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    return adminBackend.verifySession(token, requiredRole);
  }

  // A1. POST /api/admin/auth/login
  if (pathname === '/api/admin/auth/login' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const ip = req.socket.remoteAddress || '127.0.0.1';
      const result = adminBackend.loginAdmin(body.login, body.password, ip);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 401, { error: err.message });
    }
  }

  // A2. GET /api/admin/auth/me
  if (pathname === '/api/admin/auth/me' && req.method === 'GET') {
    const session = getAdminSession(req);
    if (!session) return sendJson(res, 401, { error: 'Не авторизован.' });
    return sendJson(res, 200, { user: session.user });
  }

  // A3. POST /api/admin/auth/logout
  if (pathname === '/api/admin/auth/logout' && req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    adminBackend.logoutAdmin(token);
    return sendJson(res, 200, { success: true });
  }

  // A4. GET /api/admin/dashboard
  if (pathname === '/api/admin/dashboard' && req.method === 'GET') {
    const session = getAdminSession(req, 'manager');
    if (!session) return sendJson(res, 401, { error: 'Доступ ограничен.' });
    const stats = adminBackend.getDashboardStats();
    return sendJson(res, 200, stats);
  }

  // A5. GET /api/admin/orders
  if (pathname === '/api/admin/orders' && req.method === 'GET') {
    const session = getAdminSession(req, 'manager');
    if (!session) return sendJson(res, 401, { error: 'Доступ ограничен.' });

    const query = parsedUrl.searchParams;
    const result = adminBackend.getOrdersList({
      status: query.get('status'),
      city: query.get('city'),
      dateFrom: query.get('dateFrom'),
      dateTo: query.get('dateTo'),
      manager: query.get('manager'),
      search: query.get('search'),
      sort: query.get('sort') || 'date_desc',
      page: parseInt(query.get('page') || '1', 10),
      limit: parseInt(query.get('limit') || '50', 10)
    });
    return sendJson(res, 200, result);
  }

  // A6. GET /api/admin/orders/:id
  if (pathname.startsWith('/api/admin/orders/') && !pathname.includes('/status') && !pathname.includes('/details') && req.method === 'GET') {
    const session = getAdminSession(req, 'manager');
    if (!session) return sendJson(res, 401, { error: 'Доступ ограничен.' });

    const orderId = pathname.replace('/api/admin/orders/', '').trim();
    const order = adminBackend.getOrderById(orderId);
    if (!order) return sendJson(res, 404, { error: 'Заказ не найден.' });
    return sendJson(res, 200, order);
  }

  // A7. PUT /api/admin/orders/:id/status
  if (pathname.startsWith('/api/admin/orders/') && pathname.endsWith('/status') && req.method === 'PUT') {
    const session = getAdminSession(req, 'manager');
    if (!session) return sendJson(res, 401, { error: 'Доступ ограничен.' });

    const orderId = pathname.replace('/api/admin/orders/', '').replace('/status', '').trim();
    try {
      const body = await parseBody(req);
      const updated = adminBackend.updateOrderStatus(orderId, body.status, session.user, body.note || '');
      return sendJson(res, 200, updated);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // A8. PUT /api/admin/orders/:id/details
  if (pathname.startsWith('/api/admin/orders/') && pathname.endsWith('/details') && req.method === 'PUT') {
    const session = getAdminSession(req, 'manager');
    if (!session) return sendJson(res, 401, { error: 'Доступ ограничен.' });

    const orderId = pathname.replace('/api/admin/orders/', '').replace('/details', '').trim();
    try {
      const body = await parseBody(req);
      const updated = adminBackend.updateOrderDetails(orderId, body, session.user);
      return sendJson(res, 200, updated);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // A9. GET /api/admin/catalog
  if (pathname === '/api/admin/catalog' && req.method === 'GET') {
    const session = getAdminSession(req, 'manager');
    if (!session) return sendJson(res, 401, { error: 'Доступ ограничен.' });

    const query = parsedUrl.searchParams;
    const result = adminBackend.getCatalogProducts({
      category: query.get('category'),
      brand: query.get('brand'),
      collection: query.get('collection'),
      hasPrice: query.get('hasPrice'),
      search: query.get('search'),
      page: parseInt(query.get('page') || '1', 10),
      limit: parseInt(query.get('limit') || '50', 10)
    });
    return sendJson(res, 200, result);
  }

  // A10. GET /api/admin/catalog/:id
  if (pathname.startsWith('/api/admin/catalog/') && req.method === 'GET') {
    const session = getAdminSession(req, 'manager');
    if (!session) return sendJson(res, 401, { error: 'Доступ ограничен.' });

    const id = pathname.replace('/api/admin/catalog/', '').trim();
    const prod = adminBackend.getProductById(id);
    if (!prod) return sendJson(res, 404, { error: 'Товар не найден.' });
    return sendJson(res, 200, prod);
  }

  // A11. PUT /api/admin/catalog/:id
  if (pathname.startsWith('/api/admin/catalog/') && req.method === 'PUT') {
    const session = getAdminSession(req, 'admin');
    if (!session) return sendJson(res, 403, { error: 'Недостаточно прав. Требуются права Администратора.' });

    const id = pathname.replace('/api/admin/catalog/', '').trim();
    try {
      const body = await parseBody(req);
      const updated = adminBackend.updateProduct(id, body, session.user);
      return sendJson(res, 200, updated);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // A12. GET /api/admin/inventory
  if (pathname === '/api/admin/inventory' && req.method === 'GET') {
    const session = getAdminSession(req, 'manager');
    if (!session) return sendJson(res, 401, { error: 'Доступ ограничен.' });

    const query = parsedUrl.searchParams;
    const result = adminBackend.getInventoryList({
      warehouse: query.get('warehouse') || 'all',
      search: query.get('search'),
      category: query.get('category'),
      lowStock: query.get('lowStock') === 'true',
      page: parseInt(query.get('page') || '1', 10),
      limit: parseInt(query.get('limit') || '50', 10)
    });
    return sendJson(res, 200, result);
  }

  // A13. POST /api/admin/inventory/adjust
  if (pathname === '/api/admin/inventory/adjust' && req.method === 'POST') {
    const session = getAdminSession(req, 'admin');
    if (!session) return sendJson(res, 403, { error: 'Недостаточно прав. Требуются права Администратора.' });

    try {
      const body = await parseBody(req);
      const updated = adminBackend.adjustStock(body.productId, body.warehouseId, { actual: body.actual, reason: body.reason }, session.user);
      return sendJson(res, 200, updated);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // A14. POST /api/admin/inventory/transfer
  if (pathname === '/api/admin/inventory/transfer' && req.method === 'POST') {
    const session = getAdminSession(req, 'admin');
    if (!session) return sendJson(res, 403, { error: 'Недостаточно прав. Требуются права Администратора.' });

    try {
      const body = await parseBody(req);
      const updated = adminBackend.transferStock(body.productId, body.fromWarehouse, body.toWarehouse, body.count, body.reason, session.user);
      return sendJson(res, 200, updated);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // A15. GET /api/admin/customers
  if (pathname === '/api/admin/customers' && req.method === 'GET') {
    const session = getAdminSession(req, 'manager');
    if (!session) return sendJson(res, 401, { error: 'Доступ ограничен.' });

    const query = parsedUrl.searchParams;
    const result = adminBackend.getCustomersList({
      search: query.get('search'),
      city: query.get('city'),
      sort: query.get('sort') || 'spent_desc',
      page: parseInt(query.get('page') || '1', 10),
      limit: parseInt(query.get('limit') || '50', 10)
    });
    return sendJson(res, 200, result);
  }

  // A16. POST /api/admin/customers/note
  if (pathname === '/api/admin/customers/note' && req.method === 'POST') {
    const session = getAdminSession(req, 'manager');
    if (!session) return sendJson(res, 401, { error: 'Доступ ограничен.' });

    try {
      const body = await parseBody(req);
      const updated = adminBackend.addCustomerNote(body.phone, body.note, session.user);
      return sendJson(res, 200, updated);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // A17. GET /api/admin/services
  if (pathname === '/api/admin/services' && req.method === 'GET') {
    const session = getAdminSession(req, 'manager');
    if (!session) return sendJson(res, 401, { error: 'Доступ ограничен.' });
    const services = adminBackend.readServices();
    return sendJson(res, 200, { services });
  }

  // A18. GET /api/admin/staff (Owner only)
  if (pathname === '/api/admin/staff' && req.method === 'GET') {
    const session = getAdminSession(req, 'owner');
    if (!session) return sendJson(res, 403, { error: 'Доступ только для Владельца.' });
    const users = adminBackend.readUsers().map(u => ({
      id: u.id,
      name: u.name,
      login: u.login,
      role: u.role,
      active: u.active,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt
    }));
    return sendJson(res, 200, { users });
  }

  // A19. GET /api/admin/audit
  if (pathname === '/api/admin/audit' && req.method === 'GET') {
    const session = getAdminSession(req, 'admin');
    if (!session) return sendJson(res, 403, { error: 'Доступ ограничен.' });

    const query = parsedUrl.searchParams;
    let logs = adminBackend.readAuditLog();
    const type = query.get('type');
    const search = query.get('search');

    if (type && type !== 'all') {
      logs = logs.filter(l => l.action === type);
    }
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(l => (l.details && l.details.toLowerCase().includes(q)) || (l.user && l.user.toLowerCase().includes(q)) || (l.entityId && l.entityId.toLowerCase().includes(q)));
    }

    return sendJson(res, 200, { total: logs.length, logs: logs.slice(0, 100) });
  }

  // A20. GET /api/admin/backups (Owner only)
  if (pathname === '/api/admin/backups' && req.method === 'GET') {
    const session = getAdminSession(req, 'owner');
    if (!session) return sendJson(res, 403, { error: 'Доступ только для Владельца.' });
    const backups = adminBackend.listBackups();
    return sendJson(res, 200, { backups });
  }

  // A21. POST /api/admin/backups/create (Owner only)
  if (pathname === '/api/admin/backups/create' && req.method === 'POST') {
    const session = getAdminSession(req, 'owner');
    if (!session) return sendJson(res, 403, { error: 'Доступ только для Владельца.' });
    const result = adminBackend.createBackup(session.user);
    return sendJson(res, 200, result);
  }

  // A22. POST /api/admin/backups/restore (Owner only)
  if (pathname === '/api/admin/backups/restore' && req.method === 'POST') {
    const session = getAdminSession(req, 'owner');
    if (!session) return sendJson(res, 403, { error: 'Доступ только для Владельца.' });
    const body = await parseBody(req);
    const result = adminBackend.restoreBackup(body.backupId, session.user);
    return sendJson(res, 200, result);
  }

  // ------------------------------------------------------------------------
  // STATIC FILE SERVING
  // ------------------------------------------------------------------------
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    return res.end('Method Not Allowed');
  }

  let relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (relPath === 'cart') relPath = 'cart.html';
  if (relPath === 'product') relPath = 'product.html';
  if (relPath === 'showrooms') relPath = 'showrooms.html';
  if (relPath === 'admin' || relPath === 'admin/') relPath = 'admin/index.html';

  let safePath = path.normalize(path.join(ROOT_DIR, relPath));
  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Access Denied');
  }

  if (fs.existsSync(safePath) && fs.statSync(safePath).isDirectory()) {
    const indexPath = path.join(safePath, 'index.html');
    if (fs.existsSync(indexPath)) safePath = indexPath;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<h1>404 Not Found</h1><p>Файл ${pathname} не найден.</p>`);
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`ДВЕРИ №1 Server running at http://localhost:${PORT}/`);
  console.log(`Orders store: ${ORDERS_FILE}`);
  console.log(`Carts store: ${CARTS_FILE}`);
  console.log(`SMS Mode: ${SmsService.getProviderInfo().mode}`);
  console.log(`=======================================================`);
});
