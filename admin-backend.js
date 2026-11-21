// ==============================================================================
// ДВЕРИ №1 — ADMIN BACKEND CORE CONTROLLER
// Полноценный бэкенд административной панели: аутентификация, роли, заказы,
// каталог, склад, клиенты, услуги, аудит и резервное копирование.
// ==============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pricingEngine = require('./pricing-engine.js');

const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_DIR = path.join(DATA_DIR, 'orders');
const ORDERS_FILE = path.join(ORDERS_DIR, 'orders.json');
const USERS_FILE = path.join(DATA_DIR, 'admin-users.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit-log.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const SERVICES_FILE = path.join(DATA_DIR, 'services.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'admin-settings.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const CATALOG_JSON = path.join(DATA_DIR, 'catalog-output', 'products.json');
const CATALOG_JS = path.join(DATA_DIR, 'catalog-output', 'products-data.js');

// In-memory active sessions (token -> session)
const activeSessions = new Map();

// Rate limiter for login: ip/login -> { attempts, lockedUntil }
const loginRateLimit = new Map();

// Ensure required directories exist
[DATA_DIR, ORDERS_DIR, BACKUPS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Helper for atomic file writes
function atomicWriteJson(filePath, data) {
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

// Helper to hash password
function hashPassword(password, salt = null) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, storedSalt) {
  const hash = crypto.pbkdf2Sync(password, storedSalt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'utf8'), Buffer.from(storedHash, 'utf8'));
}

// ------------------------------------------------------------------------------
// 1. АУТЕНТИФИКАЦИЯ И УПРАВЛЕНИЕ ДОСТУПОМ (ROLES & AUTH)
// ------------------------------------------------------------------------------

function initAdminUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const owner = hashPassword('OwnerDver1!2026');
    const admin = hashPassword('AdminDver1!2026');
    const manager = hashPassword('ManagerDver1!2026');

    const defaultUsers = [
      {
        id: 'usr-owner-001',
        login: 'owner@dver1.ru',
        name: 'Руководитель (Владелец)',
        role: 'owner',
        hash: owner.hash,
        salt: owner.salt,
        active: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: null
      },
      {
        id: 'usr-admin-002',
        login: 'admin@dver1.ru',
        name: 'Старший администратор',
        role: 'admin',
        hash: admin.hash,
        salt: admin.salt,
        active: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: null
      },
      {
        id: 'usr-mgr-003',
        login: 'manager@dver1.ru',
        name: 'Менеджер шоурума Казань',
        role: 'manager',
        hash: manager.hash,
        salt: manager.salt,
        active: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: null
      }
    ];

    atomicWriteJson(USERS_FILE, defaultUsers);
    console.log('[AUTH] Initialized default admin users in', USERS_FILE);
  }
}

function readUsers() {
  initAdminUsers();
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function saveUsers(users) {
  atomicWriteJson(USERS_FILE, users);
}

function loginAdmin(login, password, ip = '127.0.0.1') {
  const rateKey = `${ip}:${login.toLowerCase()}`;
  const now = Date.now();
  const rate = loginRateLimit.get(rateKey) || { attempts: 0, lockedUntil: 0 };

  if (rate.lockedUntil > now) {
    const remainingSec = Math.ceil((rate.lockedUntil - now) / 1000);
    throw new Error(`Слишком много неудачных попыток входа. Попробуйте через ${remainingSec} сек.`);
  }

  const users = readUsers();
  const user = users.find(u => u.login.toLowerCase() === login.trim().toLowerCase());

  if (!user || !user.active) {
    rate.attempts += 1;
    if (rate.attempts >= 5) {
      rate.lockedUntil = now + 15 * 60 * 1000; // 15 mins lock
    }
    loginRateLimit.set(rateKey, rate);
    throw new Error('Неверный логин или пароль.');
  }

  const match = verifyPassword(password, user.hash, user.salt);
  if (!match) {
    rate.attempts += 1;
    if (rate.attempts >= 5) {
      rate.lockedUntil = now + 15 * 60 * 1000;
    }
    loginRateLimit.set(rateKey, rate);
    throw new Error('Неверный логин или пароль.');
  }

  // Reset rate limits on success
  loginRateLimit.delete(rateKey);

  // Update user last login
  user.lastLoginAt = new Date().toISOString();
  saveUsers(users);

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    token,
    user: {
      id: user.id,
      login: user.login,
      name: user.name,
      role: user.role
    },
    ip,
    createdAt: Date.now(),
    expiresAt: Date.now() + 12 * 60 * 60 * 1000 // 12 hours
  };
  activeSessions.set(token, session);

  logAudit({
    user: `${user.name} (${user.role})`,
    action: 'auth_login',
    entityType: 'staff',
    entityId: user.id,
    details: `Успешный вход в систему с IP ${ip}`
  });

  return {
    token,
    user: session.user,
    expiresAt: session.expiresAt
  };
}

function verifySession(token, requiredRole = null) {
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return null;
  }

  if (requiredRole) {
    const roleHierarchy = {
      owner: ['owner', 'admin', 'manager'],
      admin: ['admin', 'manager'],
      manager: ['manager']
    };
    const allowed = roleHierarchy[session.user.role] || [];
    if (!allowed.includes(requiredRole)) {
      return null;
    }
  }

  return session;
}

function logoutAdmin(token) {
  if (!token) return;
  const session = activeSessions.get(token);
  if (session) {
    logAudit({
      user: `${session.user.name} (${session.user.role})`,
      action: 'auth_logout',
      entityType: 'staff',
      entityId: session.user.id,
      details: 'Выход из административной панели'
    });
    activeSessions.delete(token);
  }
}

// ------------------------------------------------------------------------------
// 2. ЖУРНАЛ АУДИТА (IMMUTABLE AUDIT LOG)
// ------------------------------------------------------------------------------

function initAuditLog() {
  if (!fs.existsSync(AUDIT_FILE)) {
    atomicWriteJson(AUDIT_FILE, []);
  }
}

function readAuditLog() {
  initAuditLog();
  try {
    return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function logAudit({ user, action, entityType, entityId, oldValue = null, newValue = null, details = '' }) {
  initAuditLog();
  const logs = readAuditLog();
  const entry = {
    id: `AUD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    user: user || 'Система',
    action,
    entityType,
    entityId: String(entityId || '—'),
    oldValue,
    newValue,
    details
  };
  logs.unshift(entry);
  // Keep last 2000 log records
  if (logs.length > 2000) logs.length = 2000;
  atomicWriteJson(AUDIT_FILE, logs);
  return entry;
}

// ------------------------------------------------------------------------------
// 3. УПРАВЛЕНИЕ ЗАКАЗАМИ (ORDERS MANAGEMENT)
// ------------------------------------------------------------------------------

function readOrders() {
  if (!fs.existsSync(ORDERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveOrders(orders) {
  atomicWriteJson(ORDERS_FILE, orders);
  // Also sync customer records
  syncCustomersFromOrders(orders);
}

function getOrdersList({ status, city, dateFrom, dateTo, manager, search, sort = 'date_desc', page = 1, limit = 50 } = {}) {
  let orders = readOrders();

  if (status && status !== 'all') {
    orders = orders.filter(o => o.status === status);
  }

  if (city && city !== 'all') {
    orders = orders.filter(o => o.client?.city === city);
  }

  if (manager && manager !== 'all') {
    orders = orders.filter(o => o.assignedManager === manager);
  }

  if (dateFrom) {
    const fromTime = new Date(dateFrom).getTime();
    orders = orders.filter(o => new Date(o.createdAt).getTime() >= fromTime);
  }

  if (dateTo) {
    const toTime = new Date(dateTo).getTime();
    orders = orders.filter(o => new Date(o.createdAt).getTime() <= toTime);
  }

  if (search) {
    const q = search.trim().toLowerCase();
    orders = orders.filter(o => {
      const matchId = o.id && o.id.toLowerCase().includes(q);
      const matchName = o.client?.name && o.client.name.toLowerCase().includes(q);
      const matchPhone = o.client?.phone && o.client.phone.includes(q);
      const matchCity = o.client?.city && o.client.city.toLowerCase().includes(q);
      return matchId || matchName || matchPhone || matchCity;
    });
  }

  // Sorting
  if (sort === 'date_desc') {
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sort === 'date_asc') {
    orders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (sort === 'sum_desc') {
    orders.sort((a, b) => (b.totalKnownPrice || 0) - (a.totalKnownPrice || 0));
  } else if (sort === 'sum_asc') {
    orders.sort((a, b) => (a.totalKnownPrice || 0) - (b.totalKnownPrice || 0));
  }

  const total = orders.length;
  const start = (page - 1) * limit;
  const paged = orders.slice(start, start + limit);

  return {
    total,
    page,
    limit,
    orders: paged
  };
}

function getOrderById(orderId) {
  const orders = readOrders();
  const idNorm = orderId.replace(/^#/, '');
  return orders.find(o => o.id === orderId || o.id === `#${idNorm}` || o.id === idNorm);
}

function updateOrderStatus(orderId, newStatus, actorUser, note = '') {
  const orders = readOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order) throw new Error('Заказ не найден.');

  const validStatuses = ['Новая', 'В обработке', 'Ожидает расчёта', 'Расчёт готов', 'Подтверждена', 'Выполнена', 'Отменена'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error('Некорректный статус заказа.');
  }

  const oldStatus = order.status;
  order.status = newStatus;
  order.updatedAt = new Date().toISOString();

  if (!order.history) order.history = [];
  order.history.push({
    timestamp: new Date().toISOString(),
    user: actorUser.name,
    action: 'status_change',
    oldStatus,
    newStatus,
    note
  });

  saveOrders(orders);

  logAudit({
    user: `${actorUser.name} (${actorUser.role})`,
    action: 'order_status_update',
    entityType: 'order',
    entityId: order.id,
    oldValue: oldStatus,
    newValue: newStatus,
    details: `Статус заказа изменен с "${oldStatus}" на "${newStatus}". ${note ? 'Комментарий: ' + note : ''}`
  });

  return order;
}

function updateOrderDetails(orderId, updateData, actorUser) {
  const orders = readOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order) throw new Error('Заказ не найден.');

  const changes = [];

  if (updateData.assignedManager !== undefined && updateData.assignedManager !== order.assignedManager) {
    changes.push(`Менеджер: ${order.assignedManager || 'не назначен'} → ${updateData.assignedManager}`);
    order.assignedManager = updateData.assignedManager;
  }

  if (updateData.agreedTotal !== undefined && updateData.agreedTotal !== order.agreedTotal) {
    changes.push(`Согласованная сумма: ${order.agreedTotal || '—'} → ${updateData.agreedTotal} ₽`);
    order.agreedTotal = Number(updateData.agreedTotal);
  }

  if (updateData.comment !== undefined && updateData.comment.trim()) {
    if (!order.internalComments) order.internalComments = [];
    order.internalComments.push({
      timestamp: new Date().toISOString(),
      user: actorUser.name,
      text: updateData.comment.trim()
    });
    changes.push(`Добавлен внутренний комментарий: "${updateData.comment.trim()}"`);
  }

  if (updateData.services !== undefined) {
    order.confirmedServices = updateData.services;
    changes.push('Обновлен список согласованных услуг');
  }

  order.updatedAt = new Date().toISOString();
  saveOrders(orders);

  if (changes.length > 0) {
    logAudit({
      user: `${actorUser.name} (${actorUser.role})`,
      action: 'order_update',
      entityType: 'order',
      entityId: order.id,
      details: changes.join('; ')
    });
  }

  return order;
}

// ------------------------------------------------------------------------------
// 4. УПРАВЛЕНИЕ КАТАЛОГОМ (CATALOG MANAGEMENT)
// ------------------------------------------------------------------------------

function readCatalog() {
  if (!fs.existsSync(CATALOG_JSON)) return [];
  try {
    return JSON.parse(fs.readFileSync(CATALOG_JSON, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveCatalog(products, actorUser, logMessage = 'Обновление каталога') {
  atomicWriteJson(CATALOG_JSON, products);
  // Sync products-data.js for frontend
  const jsContent = `// Auto-generated products dataset\nwindow.CATALOG_PRODUCTS = ${JSON.stringify(products, null, 2)};\n`;
  atomicWriteJson(CATALOG_JS, jsContent);

  if (actorUser) {
    logAudit({
      user: `${actorUser.name} (${actorUser.role})`,
      action: 'catalog_sync',
      entityType: 'catalog',
      entityId: 'ALL',
      details: `${logMessage}. Всего позиций: ${products.length}`
    });
  }
}

function getCatalogProducts({ category, brand, collection, hasPrice, search, isPublished, page = 1, limit = 50 } = {}) {
  let products = readCatalog();

  if (category && category !== 'all') {
    products = products.filter(p => p.category === category);
  }

  if (brand && brand !== 'all') {
    products = products.filter(p => p.brand === brand);
  }

  if (collection && collection !== 'all') {
    products = products.filter(p => p.collection === collection);
  }

  if (hasPrice && hasPrice !== 'all') {
    const reqPrice = hasPrice === 'yes' || hasPrice === 'true' || hasPrice === true;
    products = products.filter(p => reqPrice ? (p.price && p.price > 0) : (!p.price || p.price === 0));
  }

  if (isPublished && isPublished !== 'all') {
    const reqPub = isPublished === 'yes' || isPublished === 'true' || isPublished === true;
    products = products.filter(p => p.isPublished === undefined ? reqPub : p.isPublished === reqPub);
  }

  if (search) {
    const q = search.trim().toLowerCase();
    products = products.filter(p => {
      const mId = p.id && p.id.toLowerCase().includes(q);
      const mModel = p.model && p.model.toLowerCase().includes(q);
      const mBrand = p.brand && p.brand.toLowerCase().includes(q);
      const mColl = p.collection && p.collection.toLowerCase().includes(q);
      const mArt = p.specs?.article && String(p.specs.article).toLowerCase().includes(q);
      return mId || mModel || mBrand || mColl || mArt;
    });
  }

  const total = products.length;
  const start = (page - 1) * limit;
  const paged = products.slice(start, start + limit);

  return {
    total,
    page,
    limit,
    products: paged
  };
}

function getProductById(id) {
  const products = readCatalog();
  return products.find(p => p.id === id);
}

function updateProduct(id, updateData, actorUser) {
  const products = readCatalog();
  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Товар не найден.');

  const p = products[idx];
  const oldPrice = p.price;
  const oldTitle = p.model;

  // Allowed fields for update
  if (updateData.model !== undefined) p.model = updateData.model.trim();
  if (updateData.brand !== undefined) p.brand = updateData.brand.trim();
  if (updateData.collection !== undefined) p.collection = updateData.collection.trim();
  if (updateData.category !== undefined) p.category = updateData.category.trim();
  if (updateData.description !== undefined) p.description = updateData.description.trim();
  if (updateData.isPublished !== undefined) p.isPublished = Boolean(updateData.isPublished);

  // Price update with unified rule enforcement: Retail = Purchase + 10,000 ₽
  if (updateData.dealer_price !== undefined) {
    p.dealer_price = Number(updateData.dealer_price);
    // Auto calculate retail price if not doors accessories
    if (p.category !== 'Фурнитура' && p.category !== 'Погонаж' && p.category !== 'Плинтус') {
      p.price = p.dealer_price + 10000;
    }
  } else if (updateData.price !== undefined) {
    p.price = Number(updateData.price);
  }

  if (updateData.specs && typeof updateData.specs === 'object') {
    p.specs = { ...p.specs, ...updateData.specs };
  }

  if (updateData.images && Array.isArray(updateData.images)) {
    p.images = updateData.images;
  }

  if (updateData.variations && Array.isArray(updateData.variations)) {
    p.variations = updateData.variations;
  }

  p.updatedAt = new Date().toISOString();
  saveCatalog(products, actorUser, `Редактирование товара ${p.id} (${p.model})`);

  logAudit({
    user: `${actorUser.name} (${actorUser.role})`,
    action: 'product_edit',
    entityType: 'product',
    entityId: p.id,
    oldValue: `${oldTitle} (${oldPrice} ₽)`,
    newValue: `${p.model} (${p.price} ₽)`,
    details: `Обновлены данные карточки товара ${p.id}`
  });

  return p;
}

// ------------------------------------------------------------------------------
// 5. УПРАВЛЕНИЕ СКЛАДСКИМИ ОСТАТКАМИ (INVENTORY)
// ------------------------------------------------------------------------------

const WAREHOUSES = {
  kazan_main: {
    id: 'kazan_main',
    name: 'Казань',
    address: 'Сибирский тракт, 59Б',
    phone: '+7 (843) 200-11-22',
    isMain: true
  },
  chelny_main: {
    id: 'chelny_main',
    name: 'Набережные Челны',
    address: 'Казанский проспект, 232',
    phone: '+7 (8552) 77-88-99',
    isMain: false
  }
};

function initInventory() {
  if (!fs.existsSync(INVENTORY_FILE)) {
    // Generate initial inventory structure based on catalog items
    const catalog = readCatalog();
    const inventory = [];

    // Seed top in-demand doors with realistic showroom & warehouse stock
    catalog.forEach((prod, index) => {
      // Stock distribution formula for demo
      const baseKazan = (index % 5 === 0) ? 8 : (index % 3 === 0) ? 4 : (index % 2 === 0) ? 2 : 1;
      const baseChelny = (index % 4 === 0) ? 3 : (index % 7 === 0) ? 2 : 1;

      inventory.push({
        id: `INV-${prod.id}`,
        productId: prod.id,
        model: prod.model,
        brand: prod.brand,
        category: prod.category,
        article: prod.specs?.article || '',
        image: prod.images?.[0] || null,
        stocks: {
          kazan_main: {
            actual: baseKazan,
            reserved: (index % 6 === 0) ? 1 : 0,
            available: baseKazan - ((index % 6 === 0) ? 1 : 0),
            lastConfirmedAt: '2026-11-20T12:00:00Z',
            confirmedBy: 'Зав. складом Казань'
          },
          chelny_main: {
            actual: baseChelny,
            reserved: 0,
            available: baseChelny,
            lastConfirmedAt: '2026-11-20T12:00:00Z',
            confirmedBy: 'Зав. складом Челны'
          }
        },
        movements: [
          {
            timestamp: '2026-11-20T12:00:00Z',
            action: 'initial_count',
            warehouse: 'kazan_main',
            quantity: baseKazan,
            user: 'Система инвентаризации'
          }
        ]
      });
    });

    atomicWriteJson(INVENTORY_FILE, inventory);
    console.log('[INVENTORY] Initialized stock database with', inventory.length, 'items');
  }
}

function readInventory() {
  initInventory();
  try {
    return JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveInventory(inv) {
  atomicWriteJson(INVENTORY_FILE, inv);
}

function getInventoryList({ warehouse = 'all', search, category, lowStock = false, page = 1, limit = 50 } = {}) {
  let inv = readInventory();

  if (category && category !== 'all') {
    inv = inv.filter(i => i.category === category);
  }

  if (lowStock) {
    inv = inv.filter(i => {
      const kAvail = i.stocks.kazan_main.available;
      const cAvail = i.stocks.chelny_main.available;
      return kAvail <= 1 || cAvail <= 1;
    });
  }

  if (search) {
    const q = search.trim().toLowerCase();
    inv = inv.filter(i => {
      return (i.model && i.model.toLowerCase().includes(q)) ||
             (i.brand && i.brand.toLowerCase().includes(q)) ||
             (i.productId && i.productId.toLowerCase().includes(q)) ||
             (i.article && i.article.toLowerCase().includes(q));
    });
  }

  const total = inv.length;
  const start = (page - 1) * limit;
  const paged = inv.slice(start, start + limit);

  return {
    warehouses: WAREHOUSES,
    total,
    page,
    limit,
    items: paged
  };
}

function adjustStock(productId, warehouseId, { actual, reason }, actorUser) {
  if (!WAREHOUSES[warehouseId]) throw new Error('Неизвестный склад.');
  const inv = readInventory();
  const item = inv.find(i => i.productId === productId);
  if (!item) throw new Error('Позиция на складе не найдена.');

  const st = item.stocks[warehouseId];
  const oldActual = st.actual;
  st.actual = Math.max(0, Number(actual));
  st.available = Math.max(0, st.actual - st.reserved);
  st.lastConfirmedAt = new Date().toISOString();
  st.confirmedBy = actorUser.name;

  const moveEntry = {
    timestamp: new Date().toISOString(),
    action: 'adjust',
    warehouse: warehouseId,
    diff: st.actual - oldActual,
    newActual: st.actual,
    reason: reason || 'Корректировка остатка',
    user: actorUser.name
  };
  item.movements.unshift(moveEntry);
  saveInventory(inv);

  logAudit({
    user: `${actorUser.name} (${actorUser.role})`,
    action: 'inventory_adjust',
    entityType: 'inventory',
    entityId: productId,
    oldValue: `${WAREHOUSES[warehouseId].name}: ${oldActual} шт.`,
    newValue: `${WAREHOUSES[warehouseId].name}: ${st.actual} шт.`,
    details: `Ручная корректировка остатка. Причина: ${reason || 'Инвентаризация'}`
  });

  return item;
}

function transferStock(productId, fromWarehouse, toWarehouse, count, reason, actorUser) {
  if (!WAREHOUSES[fromWarehouse] || !WAREHOUSES[toWarehouse]) throw new Error('Некорректный склад.');
  if (fromWarehouse === toWarehouse) throw new Error('Склады отправления и назначения совпадают.');
  const qty = Number(count);
  if (qty <= 0) throw new Error('Количество для перемещения должно быть больше 0.');

  const inv = readInventory();
  const item = inv.find(i => i.productId === productId);
  if (!item) throw new Error('Позиция не найдена.');

  const src = item.stocks[fromWarehouse];
  const dst = item.stocks[toWarehouse];

  if (src.available < qty) {
    throw new Error(`Недостаточно свободного остатка на складе ${WAREHOUSES[fromWarehouse].name} (доступно: ${src.available} шт.)`);
  }

  src.actual -= qty;
  src.available = src.actual - src.reserved;
  dst.actual += qty;
  dst.available = dst.actual - dst.reserved;

  const now = new Date().toISOString();
  src.lastConfirmedAt = now;
  dst.lastConfirmedAt = now;

  item.movements.unshift({
    timestamp: now,
    action: 'transfer',
    from: fromWarehouse,
    to: toWarehouse,
    quantity: qty,
    reason: reason || 'Межскладское перемещение',
    user: actorUser.name
  });

  saveInventory(inv);

  logAudit({
    user: `${actorUser.name} (${actorUser.role})`,
    action: 'inventory_transfer',
    entityType: 'inventory',
    entityId: productId,
    details: `Перемещение ${qty} шт. из ${WAREHOUSES[fromWarehouse].name} в ${WAREHOUSES[toWarehouse].name}. Причина: ${reason}`
  });

  return item;
}

// ------------------------------------------------------------------------------
// 6. УПРАВЛЕНИЕ КЛИЕНТСКОЙ БАЗОЙ (CUSTOMERS)
// ------------------------------------------------------------------------------

function initCustomers() {
  if (!fs.existsSync(CUSTOMERS_FILE)) {
    atomicWriteJson(CUSTOMERS_FILE, []);
    syncCustomersFromOrders(readOrders());
  }
}

function readCustomers() {
  initCustomers();
  try {
    return JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveCustomers(custs) {
  atomicWriteJson(CUSTOMERS_FILE, custs);
}

function syncCustomersFromOrders(orders) {
  const custMap = new Map();

  orders.forEach(o => {
    const rawPhone = o.client?.phone || '';
    const normPhone = rawPhone.replace(/\D/g, '').replace(/^8/, '7');
    if (!normPhone || normPhone.length < 10) return;

    const key = `+${normPhone}`;
    let c = custMap.get(key);
    if (!c) {
      c = {
        phone: key,
        name: o.client?.name || 'Клиент',
        city: o.client?.city || 'Казань',
        firstContactAt: o.createdAt,
        lastContactAt: o.createdAt,
        ordersCount: 0,
        totalSpent: 0,
        orders: [],
        notes: []
      };
      custMap.set(key, c);
    }

    c.ordersCount += 1;
    c.totalSpent += Number(o.totalKnownPrice || 0);
    c.orders.push({
      id: o.id,
      date: o.createdAt,
      status: o.status,
      sum: o.totalKnownPrice,
      doorsCount: o.items?.reduce((acc, i) => acc + (i.quantity || 1), 0) || 1
    });

    if (new Date(o.createdAt) > new Date(c.lastContactAt)) {
      c.lastContactAt = o.createdAt;
      if (o.client?.name) c.name = o.client.name;
      if (o.client?.city) c.city = o.client.city;
    }
    if (new Date(o.createdAt) < new Date(c.firstContactAt)) {
      c.firstContactAt = o.createdAt;
    }
  });

  // Preserve existing notes
  const existing = readCustomers();
  existing.forEach(e => {
    if (custMap.has(e.phone)) {
      custMap.get(e.phone).notes = e.notes || [];
    }
  });

  const list = Array.from(custMap.values());
  saveCustomers(list);
  return list;
}

function getCustomersList({ search, city, sort = 'spent_desc', page = 1, limit = 50 } = {}) {
  let custs = readCustomers();

  if (city && city !== 'all') {
    custs = custs.filter(c => c.city === city);
  }

  if (search) {
    const q = search.trim().toLowerCase();
    custs = custs.filter(c => {
      return (c.name && c.name.toLowerCase().includes(q)) ||
             (c.phone && c.phone.includes(q)) ||
             (c.city && c.city.toLowerCase().includes(q));
    });
  }

  if (sort === 'spent_desc') {
    custs.sort((a, b) => b.totalSpent - a.totalSpent);
  } else if (sort === 'orders_desc') {
    custs.sort((a, b) => b.ordersCount - a.ordersCount);
  } else if (sort === 'date_desc') {
    custs.sort((a, b) => new Date(b.lastContactAt) - new Date(a.lastContactAt));
  }

  const total = custs.length;
  const start = (page - 1) * limit;
  const paged = custs.slice(start, start + limit);

  return {
    total,
    page,
    limit,
    customers: paged
  };
}

function addCustomerNote(phone, noteText, actorUser) {
  const custs = readCustomers();
  const c = custs.find(cu => cu.phone === phone);
  if (!c) throw new Error('Клиент не найден.');

  if (!c.notes) c.notes = [];
  c.notes.push({
    timestamp: new Date().toISOString(),
    user: actorUser.name,
    text: noteText.trim()
  });

  saveCustomers(custs);
  return c;
}

// ------------------------------------------------------------------------------
// 7. УСЛУГИ И МОНТАЖ (SERVICES DIRECTORY)
// ------------------------------------------------------------------------------

const DEFAULT_SERVICES = [
  {
    id: 'srv-inter-base',
    category: 'Межкомнатные двери',
    name: 'Базовый монтаж межкомнатной двери',
    price: 4500,
    priceUnit: 'за 1 дверь',
    conditions: 'Включает установку коробки, телескопических наличников с 2 сторон, врезку бабочек и замка. Доборы не входят.',
    isBase: true
  },
  {
    id: 'srv-inter-double',
    category: 'Межкомнатные двери',
    name: 'Стандартная распашная двустворчатая дверь',
    price: 9000,
    priceUnit: 'за проем',
    conditions: 'Монтаж двух полотен в один проем с притворной планкой.',
    isBase: false
  },
  {
    id: 'srv-ext-150',
    category: 'Погонаж и отделка',
    name: 'Установка добора до 150 мм',
    price: 500,
    priceUnit: 'за комплект',
    conditions: 'Монтаж доборных планок глубиной до 150 мм.',
    isBase: false
  },
  {
    id: 'srv-slide-single',
    category: 'Раздвижные системы',
    name: 'Раздвижная одностворчатая дверь',
    price: 5000,
    priceUnit: 'за систему',
    conditions: 'Монтаж направляющей рельсы, роликовых кареток и полотна вдоль стены.',
    isBase: false
  },
  {
    id: 'srv-slide-double',
    category: 'Раздвижные системы',
    name: 'Раздвижная двустворчатая дверь',
    price: 9000,
    priceUnit: 'за систему',
    conditions: 'Монтаж синхронной или независимой раздвижной двухполотной системы.',
    isBase: false
  },
  {
    id: 'srv-slide-casing',
    category: 'Раздвижные системы',
    name: 'Отделка проёма раздвижной системы доборами до 150 мм',
    price: 3000,
    priceUnit: 'за проем',
    conditions: 'Обрамление портала доборным брусом и наличниками.',
    isBase: false
  },
  {
    id: 'srv-invisible',
    category: 'Скрытые двери',
    name: 'Монтаж скрытой двери (Invisible / Secret)',
    price: 6000,
    priceUnit: 'от 6 000 ₽',
    conditions: 'Точная лазерная юстировка скрытого алюминиевого короба в уровень штукатурки/гипсокартона.',
    isBase: false
  },
  {
    id: 'srv-threshold',
    category: 'Фурнитура и допы',
    name: 'Установка порога',
    price: 500,
    priceUnit: 'за порог',
    conditions: 'Подгонка и фиксация стыковочного или опускного порога.',
    isBase: false
  },
  {
    id: 'srv-entrance-flat',
    category: 'Входные двери',
    name: 'Монтаж входной квартирной двери',
    price: 8000,
    priceUnit: 'за дверь',
    conditions: 'Установка в готовый проем, анкерное крепление, заполнение монтажного шва пеной.',
    isBase: true
  },
  {
    id: 'srv-entrance-thermo',
    category: 'Входные двери',
    name: 'Монтаж терморазрывной двери для коттеджа/дома',
    price: 10000,
    priceUnit: 'за дверь',
    conditions: 'Усиленный монтаж тяжелого полотна с терморазрывом, пароизоляционными лентами и термогерметизацией.',
    isBase: false
  },
  {
    id: 'srv-dismantle',
    category: 'Демонтаж',
    name: 'Демонтаж старой двери',
    price: 1000,
    priceUnit: 'за дверь',
    conditions: 'Снятие старого полотна и аккуратная выемка коробки без разрушения несущего проема.',
    isBase: false
  },
  {
    id: 'srv-dispose',
    category: 'Утилизация',
    name: 'Вывоз старой двери',
    price: 500,
    priceUnit: 'от 500 ₽',
    conditions: 'Спуск и вывоз демонтированного дверного полотна и короба.',
    isBase: false
  }
];

function initServices() {
  if (!fs.existsSync(SERVICES_FILE)) {
    atomicWriteJson(SERVICES_FILE, DEFAULT_SERVICES);
  }
}

function readServices() {
  initServices();
  try {
    return JSON.parse(fs.readFileSync(SERVICES_FILE, 'utf8'));
  } catch (e) {
    return DEFAULT_SERVICES;
  }
}

function saveServices(srvs) {
  atomicWriteJson(SERVICES_FILE, srvs);
}

// ------------------------------------------------------------------------------
// 8. ДАШБОРД И МЕТРИКИ (KPIS & STATS)
// ------------------------------------------------------------------------------

function getDashboardStats() {
  const orders = readOrders();
  const catalog = readCatalog();
  const inv = readInventory();
  const pricingHistory = pricingEngine.getPriceHistory();
  const auditLogs = readAuditLog();

  const kpis = {
    newOrders: orders.filter(o => o.status === 'Новая').length,
    processingOrders: orders.filter(o => o.status === 'В обработке').length,
    awaitingCalcOrders: orders.filter(o => o.status === 'Ожидает расчёта').length,
    confirmedOrders: orders.filter(o => o.status === 'Подтверждена' || o.status === 'Выполнена').length,
    noPriceProducts: catalog.filter(p => !p.price || p.price === 0).length,
    totalProducts: catalog.length,
    pendingPriceUpdates: 0 // set dynamically if import in draft
  };

  // Recent 10 orders
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  // Attention Items
  const attentionItems = [];

  const urgentOrders = orders.filter(o => o.status === 'Новая');
  if (urgentOrders.length > 0) {
    attentionItems.push({
      type: 'warning',
      title: `${urgentOrders.length} новых заявок ожидают обработки менеджером`,
      actionUrl: '#orders?status=Новая'
    });
  }

  const lowStockDoors = inv.filter(i => i.stocks.kazan_main.available === 0 && i.stocks.chelny_main.available === 0);
  if (lowStockDoors.length > 0) {
    attentionItems.push({
      type: 'info',
      title: `${lowStockDoors.length} моделей дверей полностью отсутствуют на обоих складах`,
      actionUrl: '#inventory?lowStock=true'
    });
  }

  attentionItems.push({
    type: 'success',
    title: 'Регламент ценообразования активен: Розничная цена = Закупка + 10 000 ₽',
    actionUrl: '#pricing'
  });

  return {
    kpis,
    recentOrders,
    attentionItems,
    recentAudit: auditLogs.slice(0, 10)
  };
}

// ------------------------------------------------------------------------------
// 9. РЕЗЕРВНОЕ КОПИРОВАНИЕ И ВОССТАНОВЛЕНИЕ (BACKUPS)
// ------------------------------------------------------------------------------

function createBackup(actorUser) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `backup-${timestamp}`;
  const backupPath = path.join(BACKUPS_DIR, `${backupId}.json`);

  const backupData = {
    backupId,
    createdAt: new Date().toISOString(),
    creator: actorUser ? `${actorUser.name} (${actorUser.role})` : 'Автоматический бэкап',
    files: {
      orders: readOrders(),
      catalog: readCatalog(),
      inventory: readInventory(),
      customers: readCustomers(),
      services: readServices(),
      pricingHistory: pricingEngine.getPriceHistory(),
      audit: readAuditLog().slice(0, 500)
    }
  };

  atomicWriteJson(backupPath, backupData);

  logAudit({
    user: actorUser ? `${actorUser.name} (${actorUser.role})` : 'Система',
    action: 'backup_created',
    entityType: 'backup',
    entityId: backupId,
    details: `Создана резервная копия системы (${Math.round(JSON.stringify(backupData).length / 1024)} КБ)`
  });

  return {
    backupId,
    createdAt: backupData.createdAt,
    sizeKb: Math.round(JSON.stringify(backupData).length / 1024)
  };
}

function listBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json'));
  return files.map(file => {
    const stats = fs.statSync(path.join(BACKUPS_DIR, file));
    return {
      filename: file,
      backupId: file.replace('.json', ''),
      createdAt: stats.mtime.toISOString(),
      sizeKb: Math.round(stats.size / 1024)
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function restoreBackup(backupId, actorUser) {
  const backupFile = path.join(BACKUPS_DIR, `${backupId}.json`);
  if (!fs.existsSync(backupFile)) throw new Error('Резервная копия не найдена.');

  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  if (!backup.files) throw new Error('Поврежденный файл резервной копии.');

  if (backup.files.orders) saveOrders(backup.files.orders);
  if (backup.files.catalog) saveCatalog(backup.files.catalog, actorUser, 'Восстановление из бэкапа ' + backupId);
  if (backup.files.inventory) saveInventory(backup.files.inventory);
  if (backup.files.customers) saveCustomers(backup.files.customers);
  if (backup.files.services) saveServices(backup.files.services);

  logAudit({
    user: `${actorUser.name} (${actorUser.role})`,
    action: 'backup_restore',
    entityType: 'backup',
    entityId: backupId,
    details: `Восстановлены данные из резервной копии ${backupId}`
  });

  return { success: true, backupId };
}

// Initialize on startup
initAdminUsers();
initAuditLog();
initInventory();
initCustomers();
initServices();

module.exports = {
  WAREHOUSES,
  loginAdmin,
  verifySession,
  logoutAdmin,
  readUsers,
  saveUsers,
  logAudit,
  readAuditLog,
  getDashboardStats,
  readOrders,
  getOrdersList,
  getOrderById,
  updateOrderStatus,
  updateOrderDetails,
  readCatalog,
  getCatalogProducts,
  getProductById,
  updateProduct,
  getInventoryList,
  adjustStock,
  transferStock,
  getCustomersList,
  addCustomerNote,
  readServices,
  saveServices,
  createBackup,
  listBackups,
  restoreBackup
};
