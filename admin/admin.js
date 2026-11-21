// ==============================================================================
// ДВЕРИ №1 — ADMIN CONTROL CENTER CLIENT CONTROLLER (V3.3)
// ==============================================================================

(function() {
  'use strict';

  // State
  const AdminApp = {
    token: localStorage.getItem('dver1_admin_token') || null,
    user: null,
    activeSection: 'dashboard',
    currentOrder: null,
    currentProduct: null,
    pricingImport: null,
    pricingSelectedRows: new Set(),
    activePricingFilter: 'all',
    activeWarehouse: 'all',
    catalogPage: 1,
    ordersPage: 1,
    inventoryPage: 1
  };

  // Helper API Fetch with Authorization Header
  async function apiFetch(endpoint, options = {}) {
    if (!options.headers) options.headers = {};
    if (AdminApp.token) {
      options.headers['Authorization'] = `Bearer ${AdminApp.token}`;
    }
    if (!(options.body instanceof FormData) && options.body && typeof options.body === 'object') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const res = await fetch(endpoint, options);
      if (res.status === 401 || res.status === 403) {
        if (endpoint !== '/api/admin/auth/login') {
          handleAuthFailure('Сессия истекла или недостаточно прав.');
          throw new Error('Unauthorized');
        }
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка сервера.');
      }
      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  }

  // Toast Notification
  function showToast(message, type = 'info') {
    const container = document.getElementById('adminToastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 3500);
  }

  // ----------------------------------------------------------------------------
  // 1. АВТОРИЗАЦИЯ И СЕССИИ (AUTH CONTROLLER)
  // ----------------------------------------------------------------------------
  async function checkAuthSession() {
    if (!AdminApp.token) {
      showLoginScreen();
      return;
    }

    try {
      const data = await apiFetch('/api/admin/auth/me');
      AdminApp.user = data.user;
      showAppScreen();
      initRouter();
    } catch (err) {
      showLoginScreen();
    }
  }

  function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
  }

  function showAppScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';

    if (AdminApp.user) {
      document.getElementById('userNameDisplay').textContent = AdminApp.user.name;
      document.getElementById('userRoleBadge').textContent = getRoleDisplayName(AdminApp.user.role);
      document.getElementById('userAvatarText').textContent = AdminApp.user.name.charAt(0);

      // Hide owner-only navigation for managers and admins
      const isOwner = AdminApp.user.role === 'owner';
      document.querySelectorAll('.role-restricted-owner').forEach(el => {
        el.style.display = isOwner ? 'flex' : 'none';
      });
    }
  }

  function getRoleDisplayName(role) {
    if (role === 'owner') return 'Владелец';
    if (role === 'admin') return 'Администратор';
    if (role === 'manager') return 'Менеджер';
    return role;
  }

  function handleAuthFailure(msg) {
    AdminApp.token = null;
    AdminApp.user = null;
    localStorage.removeItem('dver1_admin_token');
    showLoginScreen();
    const alert = document.getElementById('loginAlert');
    if (alert) {
      alert.textContent = msg;
      alert.style.display = 'block';
    }
  }

  // ----------------------------------------------------------------------------
  // 2. МАРШРУТИЗАЦИЯ И НАВИГАЦИЯ (ROUTER)
  // ----------------------------------------------------------------------------
  function initRouter() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
  }

  function handleRoute() {
    let hash = window.location.hash.replace(/^#/, '').trim();
    if (!hash) hash = 'dashboard';

    // Parse params if any e.g. #orders?status=Новая
    const parts = hash.split('?');
    const section = parts[0];
    const params = new URLSearchParams(parts[1] || '');

    switchSection(section, params);
  }

  function switchSection(sectionName, params = new URLSearchParams()) {
    const validSections = [
      'dashboard', 'orders', 'catalog', 'pricing', 'inventory',
      'suppliers', 'customers', 'services', 'staff', 'audit', 'settings'
    ];

    if (!validSections.includes(sectionName)) sectionName = 'dashboard';

    // Role check for owner sections
    if ((sectionName === 'staff' || sectionName === 'settings') && AdminApp.user?.role !== 'owner') {
      showToast('Доступ ограничен. Раздел доступен только Владельцу.', 'warning');
      sectionName = 'dashboard';
    }

    AdminApp.activeSection = sectionName;

    // Update navigation sidebar
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.nav === sectionName);
    });

    // Update view containers
    document.querySelectorAll('.admin-view').forEach(view => {
      view.classList.remove('active');
    });

    const targetView = document.getElementById(`view${capitalize(sectionName)}`);
    if (targetView) targetView.classList.add('active');

    // Update header title
    const sectionTitles = {
      dashboard: 'Обзор магазина и KPI',
      orders: 'Обработка заказов покупателей',
      catalog: 'Каталог продукции (697 моделей)',
      pricing: 'Ценообразование и импорт прайс-листов',
      inventory: 'Складские остатки и перемещения',
      suppliers: 'Фабрики и поставщики РФ',
      customers: 'Клиентская база и история',
      services: 'Услуги и прейскурант монтажа',
      staff: 'Управление доступом сотрудников',
      audit: 'Журнал аудита действий',
      settings: 'Резервное копирование и система'
    };
    document.getElementById('headerCurrentSectionTitle').textContent = sectionTitles[sectionName] || sectionName;

    // Load section data
    loadSectionData(sectionName, params);
  }

  function loadSectionData(section, params) {
    if (section === 'dashboard') loadDashboard();
    else if (section === 'orders') loadOrders(params);
    else if (section === 'catalog') loadCatalog(params);
    else if (section === 'pricing') loadPricingModule();
    else if (section === 'inventory') loadInventory(params);
    else if (section === 'suppliers') loadSuppliers();
    else if (section === 'customers') loadCustomers();
    else if (section === 'services') loadServices();
    else if (section === 'staff') loadStaff();
    else if (section === 'audit') loadAuditLog();
    else if (section === 'settings') loadSettings();
  }

  // ----------------------------------------------------------------------------
  // 3. РАЗДЕЛ: ОБЗОР (DASHBOARD)
  // ----------------------------------------------------------------------------
  async function loadDashboard() {
    try {
      const data = await apiFetch('/api/admin/dashboard');

      // KPIs
      document.getElementById('kpiNewOrders').textContent = data.kpis.newOrders;
      document.getElementById('kpiProcessingOrders').textContent = data.kpis.processingOrders;
      document.getElementById('kpiAwaitingCalcOrders').textContent = data.kpis.awaitingCalcOrders;
      document.getElementById('kpiConfirmedOrders').textContent = data.kpis.confirmedOrders;
      document.getElementById('kpiNoPriceProducts').textContent = data.kpis.noPriceProducts;
      document.getElementById('badgeNewOrders').textContent = data.kpis.newOrders;
      document.getElementById('badgeCatalogTotal').textContent = data.kpis.totalProducts;

      // Recent orders table
      renderRecentOrdersTable(data.recentOrders);

      // Attention items
      renderAttentionList(data.attentionItems);

      // Recent audit
      renderRecentAuditMini(data.recentAudit);

    } catch (err) {
      showToast('Ошибка загрузки показателей дашборда', 'error');
    }
  }

  function renderRecentOrdersTable(orders) {
    const tbody = document.getElementById('dashRecentOrdersTable');
    if (!orders || orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">Заявок пока нет.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const dateStr = formatDate(o.createdAt);
      const doorsCount = o.items ? o.items.reduce((acc, i) => acc + (i.quantity || 1), 0) : 1;
      const sumStr = o.totalKnownPrice ? `${o.totalKnownPrice.toLocaleString('ru-RU')} ₽` : '—';
      const statusClass = `status-${o.status.replace(/\s+/g, '-')}`;

      return `
        <tr style="cursor: pointer;" onclick="window.AdminApp.openOrderDrawer('${o.id}')">
          <td style="font-weight: 600; color: #1d1e1c;">#${o.id}</td>
          <td style="color: #656762;">${dateStr}</td>
          <td style="font-weight: 500;">${escapeHtml(o.client?.name || '—')}</td>
          <td>${escapeHtml(o.client?.city || '—')}</td>
          <td class="num-cell">${doorsCount} шт.</td>
          <td class="num-cell" style="font-weight: 600; color: #222320;">${sumStr}</td>
          <td><span class="status-pill ${statusClass}">${o.status}</span></td>
          <td style="text-align: right;"><button type="button" class="btn-subtle" onclick="event.stopPropagation(); window.AdminApp.openOrderDrawer('${o.id}')">Открыть →</button></td>
        </tr>
      `;
    }).join('');
  }

  function renderAttentionList(items) {
    const container = document.getElementById('dashAttentionList');
    if (!items || items.length === 0) {
      container.innerHTML = `<div class="attention-item att-success">✓ Все заявки обработаны, критических ситуаций нет.</div>`;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="attention-item att-${item.type}">
        <span>${escapeHtml(item.title)}</span>
      </div>
    `).join('');
  }

  function renderRecentAuditMini(logs) {
    const container = document.getElementById('dashRecentAuditList');
    if (!logs || logs.length === 0) {
      container.innerHTML = `<div class="empty-cell">Событий аудита пока нет.</div>`;
      return;
    }

    container.innerHTML = logs.slice(0, 5).map(l => `
      <div class="audit-mini-row">
        <div class="am-top">
          <span class="am-user">${escapeHtml(l.user)}</span>
          <span>${formatDate(l.timestamp)}</span>
        </div>
        <div class="am-details">${escapeHtml(l.details || l.action)}</div>
      </div>
    `).join('');
  }

  // ----------------------------------------------------------------------------
  // 4. РАЗДЕЛ: ЗАКАЗЫ (ORDERS)
  // ----------------------------------------------------------------------------
  async function loadOrders(params = new URLSearchParams()) {
    const search = params.get('search') || document.getElementById('orderSearchInput').value;
    const status = params.get('status') || document.getElementById('orderStatusFilter').value;
    const city = document.getElementById('orderCityFilter').value;
    const sort = document.getElementById('orderSortFilter').value;

    if (params.get('status')) {
      document.getElementById('orderStatusFilter').value = params.get('status');
    }

    try {
      const q = new URLSearchParams({
        search,
        status,
        city,
        sort,
        page: AdminApp.ordersPage,
        limit: 50
      });
      const data = await apiFetch(`/api/admin/orders?${q.toString()}`);

      document.getElementById('ordersCounterLabel').textContent = `Всего: ${data.total} заявок`;
      renderOrdersTable(data.orders);
    } catch (err) {
      showToast('Ошибка загрузки списка заказов', 'error');
    }
  }

  function renderOrdersTable(orders) {
    const tbody = document.getElementById('ordersTableBody');
    const mobileCards = document.getElementById('ordersMobileCardsList');

    if (!orders || orders.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="empty-cell">Заказы не найдены.</td></tr>`;
      if (mobileCards) mobileCards.innerHTML = `<div class="empty-cell">Заказы не найдены.</div>`;
      return;
    }

    // 1. Desktop Optimized Table Rows
    if (tbody) {
      tbody.innerHTML = orders.map(o => {
        const dateHtml = formatSplitDate(o.createdAt);
        const doorsCount = o.items ? o.items.reduce((acc, i) => acc + (i.quantity || 1), 0) : 1;
        const sumStr = o.totalKnownPrice ? `${o.totalKnownPrice.toLocaleString('ru-RU')} ₽` : '—';
        const agreedStr = o.agreedTotal
          ? `<strong class="val-agreed-money">${o.agreedTotal.toLocaleString('ru-RU')} ₽</strong>`
          : `<span class="val-no-money">—</span>`;
        const statusClass = `status-${o.status.replace(/\s+/g, '-')}`;
        const managerDisplay = o.assignedManager
          ? o.assignedManager.replace('Менеджер шоурума ', 'Менеджер ').replace('Старший администратор', 'Старший админ')
          : 'Не назначен';

        return `
          <tr class="ord-table-row" onclick="window.AdminApp.openOrderDrawer('${o.id}')">
            <td class="col-ord-id"><span class="ord-id-code">#${o.id}</span></td>
            <td class="col-ord-date"><div class="ord-date-box">${dateHtml}</div></td>
            <td class="col-ord-client" title="${escapeHtml(o.client?.name || '—')}">
              <span class="ord-client-name">${escapeHtml(o.client?.name || '—')}</span>
            </td>
            <td class="col-ord-phone">
              <a href="tel:${o.client?.phone}" class="ci-phone" onclick="event.stopPropagation()">${escapeHtml(o.client?.phone || '—')}</a>
            </td>
            <td class="col-ord-city"><span class="ord-city-tag">${escapeHtml(o.client?.city || '—')}</span></td>
            <td class="col-ord-qty num-cell">${doorsCount} шт.</td>
            <td class="col-ord-sum num-cell"><strong class="ord-sum-val">${sumStr}</strong></td>
            <td class="col-ord-agreed num-cell">${agreedStr}</td>
            <td class="col-ord-mgr" title="${escapeHtml(o.assignedManager || '')}">
              <span class="ord-mgr-name">${escapeHtml(managerDisplay)}</span>
            </td>
            <td class="col-ord-status"><span class="status-pill ${statusClass}">${o.status}</span></td>
            <td class="col-ord-act">
              <button type="button" class="btn-open-order" onclick="event.stopPropagation(); window.AdminApp.openOrderDrawer('${o.id}')">
                Открыть
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 2. Mobile Responsive Cards (<= 820px)
    if (mobileCards) {
      mobileCards.innerHTML = orders.map(o => {
        const dateStr = formatDate(o.createdAt);
        const doorsCount = o.items ? o.items.reduce((acc, i) => acc + (i.quantity || 1), 0) : 1;
        const sumStr = o.totalKnownPrice ? `${o.totalKnownPrice.toLocaleString('ru-RU')} ₽` : '—';
        const statusClass = `status-${o.status.replace(/\s+/g, '-')}`;

        return `
          <div class="ord-mobile-card" onclick="window.AdminApp.openOrderDrawer('${o.id}')">
            <div class="omc-top">
              <div class="omc-id-date">
                <span class="omc-id">#${o.id}</span>
                <span class="omc-date">${dateStr}</span>
              </div>
              <span class="status-pill ${statusClass}">${o.status}</span>
            </div>

            <div class="omc-client-row">
              <strong class="omc-name">${escapeHtml(o.client?.name || 'Клиент')}</strong>
              <a href="tel:${o.client?.phone}" class="ci-phone omc-phone" onclick="event.stopPropagation()">${escapeHtml(o.client?.phone || '—')}</a>
            </div>

            <div class="omc-meta-row">
              <span class="omc-city">г. ${escapeHtml(o.client?.city || 'Казань')}</span>
              <span class="omc-qty">${doorsCount} шт. дверей</span>
              <strong class="omc-sum">${sumStr}</strong>
            </div>

            <div class="omc-bottom">
              <span class="omc-mgr">${escapeHtml(o.assignedManager || 'Менеджер не назначен')}</span>
              <button type="button" class="btn-subtle" onclick="event.stopPropagation(); window.AdminApp.openOrderDrawer('${o.id}')">
                Открыть заявку →
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Open Order Drawer
  async function openOrderDrawer(orderId) {
    try {
      const order = await apiFetch(`/api/admin/orders/${orderId}`);
      AdminApp.currentOrder = order;

      document.getElementById('drawerOrderId').textContent = `#${order.id}`;
      const statusPill = document.getElementById('drawerOrderStatusPill');
      statusPill.textContent = order.status;
      statusPill.className = `status-pill-lg status-${order.status.replace(/\s+/g, '-')}`;
      document.getElementById('drawerOrderDate').textContent = formatDate(order.createdAt);

      // Client info
      document.getElementById('drawerClientName').textContent = order.client?.name || '—';
      const phoneEl = document.getElementById('drawerClientPhone');
      phoneEl.textContent = order.client?.phone || '—';
      phoneEl.href = `tel:${order.client?.phone}`;
      document.getElementById('drawerClientCity').textContent = order.client?.city || '—';
      document.getElementById('drawerClientComment').textContent = order.delivery?.comment || 'Без комментария';

      // Controls
      document.getElementById('drawerSelectStatus').value = order.status;
      document.getElementById('drawerSelectManager').value = order.assignedManager || '';
      document.getElementById('drawerAgreedTotalInput').value = order.agreedTotal || '';

      // Items list
      renderDrawerOrderItems(order.items || []);

      // Services breakdown
      renderDrawerServices(order);

      // Financials
      document.getElementById('drawerFinCatalogSum').textContent = `${(order.totalKnownPrice || 0).toLocaleString('ru-RU')} ₽`;
      document.getElementById('drawerFinFinalTotal').textContent = order.agreedTotal
        ? `${order.agreedTotal.toLocaleString('ru-RU')} ₽`
        : `${(order.totalKnownPrice || 0).toLocaleString('ru-RU')} ₽`;

      // Comments feed
      renderDrawerComments(order.internalComments || []);

      document.getElementById('drawerOrderDetail').style.display = 'flex';
    } catch (err) {
      showToast('Ошибка загрузки деталей заказа', 'error');
    }
  }

  function renderDrawerOrderItems(items) {
    const container = document.getElementById('drawerOrderItemsList');
    if (!items || items.length === 0) {
      container.innerHTML = `<div class="empty-cell">Состав заказа пуст.</div>`;
      return;
    }

    container.innerHTML = items.map(i => {
      const imgPath = i.image ? `../${i.image}` : '../logo.png';
      const priceStr = i.unitPrice ? `${i.unitPrice.toLocaleString('ru-RU')} ₽` : 'Под расчет';
      const totalStr = i.totalPrice ? `${i.totalPrice.toLocaleString('ru-RU')} ₽` : 'Под расчет';

      return `
        <div class="drawer-door-card">
          <img src="${imgPath}" class="door-thumb-drawer" alt="">
          <div class="door-details-drawer">
            <div class="door-title-row">
              <span>${escapeHtml(i.title || i.model || 'Дверное полотно')}</span>
              <strong style="color: #222320;">${totalStr}</strong>
            </div>
            <div class="door-specs-drawer">
              ${i.brand ? `<div>Бренд: <strong>${escapeHtml(i.brand)}</strong></div>` : ''}
              ${i.size ? `<div>Размер: ${escapeHtml(i.size)} | Открывание: ${escapeHtml(i.opening || 'Универсальное')}</div>` : ''}
              ${i.variant ? `<div>Отделка: ${escapeHtml(i.variant)}</div>` : ''}
              ${i.hardware ? `<div>Фурнитура: ${escapeHtml(i.hardware)}</div>` : ''}
              <div>Количество: <strong>${i.quantity || 1} шт.</strong> × ${priceStr}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderDrawerServices(order) {
    const container = document.getElementById('drawerServicesBreakdown');
    const isDelivery = order.delivery?.type === 'delivery';
    const isInstall = order.delivery?.installation === true;

    container.innerHTML = `
      <div style="font-size: 0.8125rem; line-height: 1.5; color: #222320;">
        <div>🚚 Доставка: <strong>${isDelivery ? 'Требуется доставка на объект' : 'Самовывоз из шоурума'}</strong></div>
        <div>🔧 Монтаж: <strong>${isInstall ? 'Требуется профессиональный монтаж «Двери №1»' : 'Без монтажа'}</strong></div>
      </div>
    `;
  }

  function renderDrawerComments(comments) {
    const feed = document.getElementById('drawerCommentsFeed');
    if (!comments || comments.length === 0) {
      feed.innerHTML = `<div style="font-size: 0.75rem; color: #8E908A; font-style: italic;">Заметок пока нет.</div>`;
      return;
    }

    feed.innerHTML = comments.map(c => `
      <div class="comm-bubble">
        <div class="comm-meta">
          <strong>${escapeHtml(c.user)}</strong>
          <span>${formatDate(c.timestamp)}</span>
        </div>
        <div>${escapeHtml(c.text)}</div>
      </div>
    `).join('');
  }

  // Save order processing updates
  async function saveOrderProcessing() {
    if (!AdminApp.currentOrder) return;
    const newStatus = document.getElementById('drawerSelectStatus').value;
    const newManager = document.getElementById('drawerSelectManager').value;
    const newAgreed = document.getElementById('drawerAgreedTotalInput').value;

    try {
      // 1. Update status
      if (newStatus !== AdminApp.currentOrder.status) {
        await apiFetch(`/api/admin/orders/${AdminApp.currentOrder.id}/status`, {
          method: 'PUT',
          body: { status: newStatus }
        });
      }

      // 2. Update details
      await apiFetch(`/api/admin/orders/${AdminApp.currentOrder.id}/details`, {
        method: 'PUT',
        body: {
          assignedManager: newManager,
          agreedTotal: newAgreed ? Number(newAgreed) : null
        }
      });

      showToast('Заказ успешно обновлен', 'success');
      document.getElementById('drawerOrderDetail').style.display = 'none';
      loadOrders();
    } catch (err) {
      showToast('Ошибка сохранения данных заказа', 'error');
    }
  }

  // Add Comment to Order
  async function sendOrderComment() {
    if (!AdminApp.currentOrder) return;
    const input = document.getElementById('drawerNewCommentInput');
    const text = input.value.trim();
    if (!text) return;

    try {
      await apiFetch(`/api/admin/orders/${AdminApp.currentOrder.id}/details`, {
        method: 'PUT',
        body: { comment: text }
      });
      input.value = '';
      // Refresh drawer
      openOrderDrawer(AdminApp.currentOrder.id);
      showToast('Заметка сохранена', 'success');
    } catch (err) {
      showToast('Ошибка добавления комментария', 'error');
    }
  }

  // ----------------------------------------------------------------------------
  // 5. РАЗДЕЛ: КАТАЛОГ (CATALOG)
  // ----------------------------------------------------------------------------
  async function loadCatalog(params = new URLSearchParams()) {
    const search = params.get('search') || document.getElementById('catalogSearchInput').value;
    const category = document.getElementById('catalogCategoryFilter').value;
    const brand = document.getElementById('catalogBrandFilter').value;
    const hasPrice = params.get('hasPrice') || document.getElementById('catalogPriceFilter').value;

    if (params.get('hasPrice')) {
      document.getElementById('catalogPriceFilter').value = params.get('hasPrice');
    }

    try {
      const q = new URLSearchParams({
        search,
        category,
        brand,
        hasPrice,
        page: AdminApp.catalogPage,
        limit: 50
      });
      const data = await apiFetch(`/api/admin/catalog?${q.toString()}`);

      document.getElementById('catalogCounterLabel').textContent = `Показано: ${data.total} товаров`;
      renderCatalogTable(data.products);
    } catch (err) {
      showToast('Ошибка загрузки каталога', 'error');
    }
  }

  function renderCatalogTable(products) {
    const tbody = document.getElementById('catalogTableBody');
    if (!products || products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="empty-cell">Товары не найдены.</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(p => {
      const imgPath = p.images && p.images.length > 0 ? `../data/catalog-output/${p.images[0]}` : '../logo.png';
      const purchasePrice = p.dealer_price || (p.price ? p.price - 10000 : null);
      const retailPrice = p.price;
      const isPub = p.isPublished !== false;

      return `
        <tr>
          <td>
            <img src="${imgPath}" style="width: 38px; height: 54px; object-fit: contain; background: #fff; border-radius: 3px; border: 1px solid #E2DFD7;" alt="">
          </td>
          <td>
            <div style="font-weight: 600; font-size: 0.75rem; color: #656762;">${p.id}</div>
            <div style="font-size: 0.6875rem; color: #8E908A;">Арт: ${escapeHtml(p.specs?.article || '—')}</div>
          </td>
          <td>
            <div style="font-weight: 600; color: #1d1e1c;">${escapeHtml(p.model)}</div>
            <div style="font-size: 0.75rem; color: #656762;">${escapeHtml(p.brand)}</div>
          </td>
          <td><span style="font-size: 0.75rem; background: #F0EEE9; padding: 2px 6px; border-radius: 3px;">${escapeHtml(p.category)}</span></td>
          <td style="font-size: 0.75rem; color: #656762;">${escapeHtml(p.collection || '—')}</td>
          <td class="num-cell" style="color: #656762;">${purchasePrice ? purchasePrice.toLocaleString('ru-RU') + ' ₽' : '—'}</td>
          <td class="num-cell" style="font-weight: 700; color: #222320; font-size: 0.875rem;">${retailPrice ? retailPrice.toLocaleString('ru-RU') + ' ₽' : '<span style="color:#D97706">Под расчет</span>'}</td>
          <td class="num-cell" style="color: #B85C3A; font-weight: 600; font-size: 0.75rem;">+10 000 ₽</td>
          <td>
            <span class="status-pill ${isPub ? 'status-Подтверждена' : 'status-Отменена'}">
              ${isPub ? 'Опубликован' : 'Черновик'}
            </span>
          </td>
          <td>
            <button type="button" class="btn-subtle" onclick="window.AdminApp.openProductModal('${p.id}')">
              Редактировать
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Open Product Edit Modal
  async function openProductModal(productId) {
    try {
      const p = await apiFetch(`/api/admin/catalog/${productId}`);
      AdminApp.currentProduct = p;

      document.getElementById('modalProductTitle').textContent = `Редактирование двери: ${p.model}`;
      document.getElementById('modalProductIdSub').textContent = `ID: ${p.id} • ${p.brand} (${p.category})`;

      document.getElementById('editProductModel').value = p.model || '';
      document.getElementById('editProductBrand').value = p.brand || '';
      document.getElementById('editProductCollection').value = p.collection || '';
      document.getElementById('editProductCategory').value = p.category || 'Входные двери';
      document.getElementById('editProductDescription').value = p.description || '';
      document.getElementById('editProductIsPublished').checked = p.isPublished !== false;

      // Specs
      document.getElementById('editSpecThickness').value = p.specs?.thickness || '';
      document.getElementById('editSpecCoating').value = p.specs?.exterior || p.specs?.coating || '';
      document.getElementById('editSpecLocks').value = p.specs?.locks || '';
      document.getElementById('editSpecInsulation').value = p.specs?.insulation || '';

      // Prices
      const dealer = p.dealer_price || (p.price ? p.price - 10000 : '');
      document.getElementById('editProductDealerPrice').value = dealer;
      document.getElementById('editProductRetailPrice').value = p.price || '';

      // Thumb
      const imgPath = p.images && p.images.length > 0 ? `../data/catalog-output/${p.images[0]}` : '../logo.png';
      document.getElementById('editProductImgThumb').src = imgPath;

      // Auto calculate retail price when dealer price changes
      document.getElementById('editProductDealerPrice').oninput = (e) => {
        const val = Number(e.target.value);
        if (val > 0) {
          document.getElementById('editProductRetailPrice').value = val + 10000;
        }
      };

      document.getElementById('modalProductEdit').style.display = 'flex';
    } catch (err) {
      showToast('Ошибка загрузки карточки товара', 'error');
    }
  }

  // Save Product Updates
  async function saveProductEdit(e) {
    e.preventDefault();
    if (!AdminApp.currentProduct) return;

    const payload = {
      model: document.getElementById('editProductModel').value,
      brand: document.getElementById('editProductBrand').value,
      collection: document.getElementById('editProductCollection').value,
      category: document.getElementById('editProductCategory').value,
      description: document.getElementById('editProductDescription').value,
      isPublished: document.getElementById('editProductIsPublished').checked,
      dealer_price: Number(document.getElementById('editProductDealerPrice').value) || null,
      price: Number(document.getElementById('editProductRetailPrice').value) || null,
      specs: {
        thickness: document.getElementById('editSpecThickness').value,
        coating: document.getElementById('editSpecCoating').value,
        locks: document.getElementById('editSpecLocks').value,
        insulation: document.getElementById('editSpecInsulation').value
      }
    };

    try {
      await apiFetch(`/api/admin/catalog/${AdminApp.currentProduct.id}`, {
        method: 'PUT',
        body: payload
      });

      showToast('Карточка товара успешно сохранена', 'success');
      document.getElementById('modalProductEdit').style.display = 'none';
      loadCatalog();
    } catch (err) {
      showToast('Ошибка сохранения товара: ' + err.message, 'error');
    }
  }

  // ----------------------------------------------------------------------------
  // 6. РАЗДЕЛ: ЦЕНООБРАЗОВАНИЕ И ИМПОРТ (PRICING & IMPORT)
  // ----------------------------------------------------------------------------
  function loadPricingModule() {
    // Initialized price engine events
    const dropZone = document.getElementById('adminFileDropZone');
    const fileInput = document.getElementById('adminPriceFileInput');

    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
    dropZone.ondragleave = () => dropZone.classList.remove('dragover');
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handlePriceFileUpload(e.dataTransfer.files[0]);
    };

    fileInput.onchange = () => {
      if (fileInput.files.length) handlePriceFileUpload(fileInput.files[0]);
    };

    document.getElementById('btnAdminParseText').onclick = handlePriceTextParse;
    document.getElementById('checkSelectAllPreview').onchange = toggleSelectAllPricingRows;
    document.getElementById('btnApplySelectedPrices').onclick = applyConfirmedPrices;

    // Filter pill buttons
    document.querySelectorAll('.preview-filter-btns .btn-tab-pill').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.preview-filter-btns .btn-tab-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        AdminApp.activePricingFilter = btn.dataset.filter;
        renderPricingPreviewTable();
      };
    });
  }

  async function handlePriceFileUpload(file) {
    showToast(`Загрузка файла ${file.name}...`, 'info');
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        await executePriceImport({
          fileBase64: base64,
          filename: file.name,
          forcedSupplier: document.getElementById('importSupplierSelect').value || null
        });
      };
      reader.readAsDataURL(file);
    } catch (err) {
      showToast('Ошибка чтения файла: ' + err.message, 'error');
    }
  }

  async function handlePriceTextParse() {
    const text = document.getElementById('adminPriceTextarea').value.trim();
    if (!text) {
      showToast('Вставьте текст с позициями прайса в поле ввода', 'warning');
      return;
    }

    showToast('Парсинг и сопоставление позиций...', 'info');
    await executePriceImport({
      textContent: text,
      filename: 'Быстрая вставка из буфера',
      forcedSupplier: document.getElementById('importSupplierSelect').value || null
    });
  }

  async function executePriceImport(payload) {
    try {
      // 1. Parse
      const parsed = await apiFetch('/api/pricing/parse', { method: 'POST', body: payload });
      if (!parsed.items || parsed.items.length === 0) {
        showToast('В документе не найдено распознанных строк с ценами.', 'warning');
        return;
      }

      // 2. Match
      const matched = await apiFetch('/api/pricing/match', {
        method: 'POST',
        body: { items: parsed.items, supplierKey: parsed.supplier }
      });

      AdminApp.pricingImport = {
        meta: parsed,
        rows: matched.items
      };

      // Select exact matched items by default
      AdminApp.pricingSelectedRows.clear();
      matched.items.forEach(r => {
        if (r.isApproved) AdminApp.pricingSelectedRows.add(r.rowId);
      });

      document.getElementById('pricingPreviewContainer').style.display = 'block';
      renderPricingStatsBar();
      renderPricingPreviewTable();
      showToast(`Распознано позиций: ${matched.items.length}`, 'success');

      // Scroll to preview
      document.getElementById('pricingPreviewContainer').scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
      showToast('Ошибка импорта: ' + err.message, 'error');
    }
  }

  function renderPricingStatsBar() {
    const rows = AdminApp.pricingImport?.rows || [];
    const stats = {
      total: rows.length,
      exact: rows.filter(r => r.matchType === 'exact').length,
      changed: rows.filter(r => r.changeType === 'changed_price').length,
      manual: rows.filter(r => r.matchType === 'manual_check' || r.matchType === 'probable').length,
      notFound: rows.filter(r => r.matchType === 'not_found').length
    };

    document.getElementById('previewStatsBar').innerHTML = `
      <div class="ps-item">
        <div class="ps-label">Всего строк в прайсе</div>
        <div class="ps-val">${stats.total}</div>
      </div>
      <div class="ps-item" style="border-left: 3px solid #16A34A;">
        <div class="ps-label">Точных совпадений</div>
        <div class="ps-val" style="color: #16A34A;">${stats.exact}</div>
      </div>
      <div class="ps-item" style="border-left: 3px solid #B85C3A;">
        <div class="ps-label">С изменением цены</div>
        <div class="ps-val" style="color: #B85C3A;">${stats.changed}</div>
      </div>
      <div class="ps-item" style="border-left: 3px solid #D97706;">
        <div class="ps-label">Требуют проверки</div>
        <div class="ps-val" style="color: #D97706;">${stats.manual}</div>
      </div>
      <div class="ps-item">
        <div class="ps-label">Новые / Не найдены</div>
        <div class="ps-val">${stats.notFound}</div>
      </div>
    `;
  }

  function renderPricingPreviewTable() {
    const tbody = document.getElementById('previewPricingTableBody');
    if (!AdminApp.pricingImport) return;

    let rows = AdminApp.pricingImport.rows;
    if (AdminApp.activePricingFilter === 'exact') rows = rows.filter(r => r.matchType === 'exact');
    else if (AdminApp.activePricingFilter === 'changed') rows = rows.filter(r => r.changeType === 'changed_price');
    else if (AdminApp.activePricingFilter === 'manual') rows = rows.filter(r => r.matchType === 'manual_check' || r.matchType === 'probable');
    else if (AdminApp.activePricingFilter === 'not_found') rows = rows.filter(r => r.matchType === 'not_found');

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty-cell">В данной вкладке нет позиций.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const isChecked = AdminApp.pricingSelectedRows.has(r.rowId);
      const p = r.matchedProduct;
      const diffStr = r.diffRetail > 0
        ? `<strong style="color: #16A34A;">+${r.diffRetail.toLocaleString('ru-RU')} ₽</strong>`
        : r.diffRetail < 0
        ? `<strong style="color: #DC2626;">-${Math.abs(r.diffRetail).toLocaleString('ru-RU')} ₽</strong>`
        : `<span style="color: #8E908A;">0 ₽</span>`;

      return `
        <tr>
          <td>
            <input type="checkbox" class="pricing-row-chk" data-row-id="${r.rowId}" ${isChecked ? 'checked' : ''} ${!p ? 'disabled' : ''}>
          </td>
          <td><span style="font-size: 0.6875rem; background: #F0EEE9; padding: 2px 6px; border-radius: 3px;">${r.supplier}</span></td>
          <td style="font-size: 0.75rem; font-weight: 500;">${escapeHtml(r.rawModel)}</td>
          <td>
            ${p ? `
              <div style="font-weight: 600; color: #1d1e1c;">${escapeHtml(p.model)}</div>
              <div style="font-size: 0.6875rem; color: #8E908A;">ID: ${p.id}</div>
            ` : '<span style="color: #8E908A; font-style: italic;">Не сопоставлен</span>'}
          </td>
          <td class="num-cell">${r.oldPurchase ? r.oldPurchase.toLocaleString('ru-RU') + ' ₽' : '—'}</td>
          <td class="num-cell" style="font-weight: 600;">${r.newPurchase.toLocaleString('ru-RU')} ₽</td>
          <td class="num-cell" style="color: #B85C3A; font-weight: 700;">+10 000 ₽</td>
          <td class="num-cell">${r.oldRetail ? r.oldRetail.toLocaleString('ru-RU') + ' ₽' : '—'}</td>
          <td class="num-cell" style="font-weight: 700; color: #1d1e1c;">${r.newRetail.toLocaleString('ru-RU')} ₽</td>
          <td class="num-cell">${diffStr}</td>
          <td>
            <span class="status-pill status-${r.matchType === 'exact' ? 'Подтверждена' : r.matchType === 'not_found' ? 'Отменена' : 'Ожидает-расчёта'}">
              ${r.matchType === 'exact' ? '✓ Точное' : r.matchType === 'probable' ? '⚡ Вероятное' : r.matchType === 'manual_check' ? '⚠️ Проверить' : '✕ Не найден'}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row checkbox handlers
    tbody.querySelectorAll('.pricing-row-chk').forEach(cb => {
      cb.onchange = (e) => {
        const id = e.target.dataset.rowId;
        if (e.target.checked) AdminApp.pricingSelectedRows.add(id);
        else AdminApp.pricingSelectedRows.delete(id);
        updateApplyButtonState();
      };
    });

    updateApplyButtonState();
  }

  function toggleSelectAllPricingRows(e) {
    const checked = e.target.checked;
    const rows = AdminApp.pricingImport?.rows || [];
    rows.forEach(r => {
      if (r.matchedProduct) {
        if (checked) AdminApp.pricingSelectedRows.add(r.rowId);
        else AdminApp.pricingSelectedRows.delete(r.rowId);
      }
    });
    renderPricingPreviewTable();
  }

  function updateApplyButtonState() {
    const btn = document.getElementById('btnApplySelectedPrices');
    const count = AdminApp.pricingSelectedRows.size;
    btn.disabled = count === 0;
    btn.textContent = `✓ Применить подтверждённые розничные цены (${count})`;
  }

  async function applyConfirmedPrices() {
    if (!AdminApp.pricingImport) return;
    const itemsToApply = AdminApp.pricingImport.rows.filter(r => AdminApp.pricingSelectedRows.has(r.rowId) && r.matchedProduct);

    if (itemsToApply.length === 0) {
      showToast('Не выбрано ни одной позиции для публикации.', 'warning');
      return;
    }

    const confirmed = window.confirm(
      `ВНИМАНИЕ: Подтверждение публикации розничных цен.\n\n` +
      `Вы собираетесь утвердить розничные цены для ${itemsToApply.length} моделей дверей.\n` +
      `Формула: РОЗНИЧНАЯ ЦЕНА = ЗАКУПКА + 10 000 ₽.\n\n` +
      `Опубликовать новые цены в публичном каталоге интернет-магазина «Двери №1»?`
    );

    if (!confirmed) return;

    try {
      const res = await apiFetch('/api/pricing/apply', {
        method: 'POST',
        body: {
          approvedItems: itemsToApply,
          adminUser: AdminApp.user ? `${AdminApp.user.name} (${AdminApp.user.role})` : 'Администратор'
        }
      });

      showToast(`Цены успешно применены для ${res.appliedCount} дверей!`, 'success');
      document.getElementById('pricingPreviewContainer').style.display = 'none';
      AdminApp.pricingImport = null;
    } catch (err) {
      showToast('Ошибка применения цен: ' + err.message, 'error');
    }
  }

  // ----------------------------------------------------------------------------
  // 7. РАЗДЕЛ: СКЛАДСКИЕ ОСТАТКИ (INVENTORY)
  // ----------------------------------------------------------------------------
  async function loadInventory(params = new URLSearchParams()) {
    // Warehouse pills
    document.querySelectorAll('.warehouse-pills-bar .wh-pill').forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll('.warehouse-pills-bar .wh-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        AdminApp.activeWarehouse = pill.dataset.wh;
        loadInventory();
      };
    });

    const search = document.getElementById('inventorySearchInput').value;
    const category = document.getElementById('inventoryCategoryFilter').value;
    const lowStock = document.getElementById('inventoryLowStockCheckbox').checked;

    try {
      const q = new URLSearchParams({
        search,
        category,
        lowStock: lowStock ? 'true' : 'false',
        page: AdminApp.inventoryPage,
        limit: 50
      });
      const data = await apiFetch(`/api/admin/inventory?${q.toString()}`);

      document.getElementById('inventoryCounterLabel').textContent = `Показано: ${data.total} позиций`;
      renderInventoryTable(data.items);
    } catch (err) {
      showToast('Ошибка загрузки остатков', 'error');
    }
  }

  function renderInventoryTable(items) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Позиции склада не найдены.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(item => {
      const imgPath = item.image ? `../data/catalog-output/${item.image}` : '../logo.png';
      const k = item.stocks.kazan_main;
      const c = item.stocks.chelny_main;

      return `
        <tr>
          <td>
            <img src="${imgPath}" style="width: 36px; height: 50px; object-fit: contain; background: #fff; border-radius: 3px; border: 1px solid #E2DFD7;" alt="">
          </td>
          <td>
            <div style="font-weight: 600; color: #1d1e1c;">${escapeHtml(item.model)}</div>
            <div style="font-size: 0.6875rem; color: #8E908A;">${escapeHtml(item.brand)} • ID: ${item.productId}</div>
          </td>
          <td><span style="font-size: 0.75rem; background: #F0EEE9; padding: 2px 6px; border-radius: 3px;">${escapeHtml(item.category)}</span></td>
          <td style="text-align: center;">
            <div class="stock-tag-group">
              <span class="st-fact" title="Фактический остаток">${k.actual}</span> /
              <span class="st-res" title="Зарезервировано">${k.reserved}</span> /
              <span class="st-avail" title="Доступно к продаже">${k.available} шт.</span>
            </div>
          </td>
          <td style="text-align: center;">
            <div class="stock-tag-group">
              <span class="st-fact" title="Фактический остаток">${c.actual}</span> /
              <span class="st-res" title="Зарезервировано">${c.reserved}</span> /
              <span class="st-avail" title="Доступно к продаже">${c.available} шт.</span>
            </div>
          </td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn-subtle" onclick="window.AdminApp.openStockAdjustModal('${item.productId}', '${escapeHtml(item.model)}')">Корректировать</button>
              <button type="button" class="btn-subtle" onclick="window.AdminApp.openStockTransferModal('${item.productId}', '${escapeHtml(item.model)}')">Переместить</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function openStockAdjustModal(productId, modelName) {
    document.getElementById('stockAdjustModelName').textContent = modelName;
    document.getElementById('formStockAdjust').dataset.productId = productId;
    document.getElementById('modalStockAdjust').style.display = 'flex';
  }

  async function handleStockAdjustSubmit(e) {
    e.preventDefault();
    const productId = e.target.dataset.productId;
    const warehouseId = document.getElementById('stockAdjustWarehouse').value;
    const actual = document.getElementById('stockAdjustNewQty').value;
    const reason = document.getElementById('stockAdjustReason').value;

    try {
      await apiFetch('/api/admin/inventory/adjust', {
        method: 'POST',
        body: { productId, warehouseId, actual, reason }
      });
      showToast('Остаток успешно обновлен', 'success');
      document.getElementById('modalStockAdjust').style.display = 'none';
      loadInventory();
    } catch (err) {
      showToast('Ошибка корректировки: ' + err.message, 'error');
    }
  }

  function openStockTransferModal(productId, modelName) {
    document.getElementById('stockTransferModelName').textContent = modelName;
    document.getElementById('formStockTransfer').dataset.productId = productId;
    document.getElementById('modalStockTransfer').style.display = 'flex';
  }

  async function handleStockTransferSubmit(e) {
    e.preventDefault();
    const productId = e.target.dataset.productId;
    const fromWarehouse = document.getElementById('transferFromWh').value;
    const toWarehouse = document.getElementById('transferToWh').value;
    const count = document.getElementById('transferQuantity').value;
    const reason = document.getElementById('transferReason').value;

    try {
      await apiFetch('/api/admin/inventory/transfer', {
        method: 'POST',
        body: { productId, fromWarehouse, toWarehouse, count, reason }
      });
      showToast('Межскладское перемещение выполнено', 'success');
      document.getElementById('modalStockTransfer').style.display = 'none';
      loadInventory();
    } catch (err) {
      showToast('Ошибка перемещения: ' + err.message, 'error');
    }
  }

  // ----------------------------------------------------------------------------
  // 8. РАЗДЕЛ: ПОСТАВЩИКИ (SUPPLIERS)
  // ----------------------------------------------------------------------------
  async function loadSuppliers() {
    try {
      const data = await apiFetch('/api/pricing/suppliers');
      const container = document.getElementById('suppliersCardsGrid');
      const suppliers = Object.values(data.suppliers || {});

      container.innerHTML = suppliers.map(s => `
        <div class="supplier-card">
          <div class="supp-top">
            <span class="supp-name">${escapeHtml(s.name)}</span>
            <span class="supp-rule-pill">+10 000 ₽</span>
          </div>
          <div class="supp-rule-desc">${escapeHtml(s.ruleDesc)}</div>
          <div class="supp-footer">
            <span>Статус: <strong>Активен</strong></span>
            <span>Базовая наценка: <strong>10 000 ₽</strong></span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      showToast('Ошибка загрузки поставщиков', 'error');
    }
  }

  // ----------------------------------------------------------------------------
  // 9. РАЗДЕЛ: КЛИЕНТЫ (CUSTOMERS)
  // ----------------------------------------------------------------------------
  async function loadCustomers() {
    const search = document.getElementById('customerSearchInput').value;
    const city = document.getElementById('customerCityFilter').value;
    const sort = document.getElementById('customerSortFilter').value;

    try {
      const q = new URLSearchParams({ search, city, sort });
      const data = await apiFetch(`/api/admin/customers?${q.toString()}`);

      document.getElementById('customersCounterLabel').textContent = `Клиентов: ${data.total}`;
      renderCustomersTable(data.customers);
    } catch (err) {
      showToast('Ошибка загрузки клиентов', 'error');
    }
  }

  function renderCustomersTable(customers) {
    const tbody = document.getElementById('customersTableBody');
    if (!customers || customers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">Клиенты не найдены.</td></tr>`;
      return;
    }

    tbody.innerHTML = customers.map(c => `
      <tr>
        <td style="font-weight: 600; color: #1d1e1c;">${escapeHtml(c.name)}</td>
        <td><a href="tel:${c.phone}" class="ci-phone">${escapeHtml(c.phone)}</a></td>
        <td>${escapeHtml(c.city)}</td>
        <td style="color: #656762; font-size: 0.75rem;">${formatDate(c.firstContactAt)}</td>
        <td style="color: #656762; font-size: 0.75rem;">${formatDate(c.lastContactAt)}</td>
        <td class="num-cell" style="font-weight: 600;">${c.ordersCount} шт.</td>
        <td class="num-cell" style="font-weight: 700; color: #1d1e1c;">${c.totalSpent.toLocaleString('ru-RU')} ₽</td>
        <td style="font-size: 0.75rem; color: #656762;">${c.notes?.length ? escapeHtml(c.notes[0].text) : '—'}</td>
        <td><button type="button" class="btn-subtle" onclick="navigateSection('orders', { search: '${c.phone}' })">Заказы →</button></td>
      </tr>
    `).join('');
  }

  // ----------------------------------------------------------------------------
  // 10. РАЗДЕЛ: УСЛУГИ И МОНТАЖ (SERVICES)
  // ----------------------------------------------------------------------------
  async function loadServices() {
    try {
      const data = await apiFetch('/api/admin/services');
      const tbody = document.getElementById('servicesTableBody');

      tbody.innerHTML = (data.services || []).map(s => `
        <tr>
          <td><span style="font-size: 0.75rem; background: #F0EEE9; padding: 2px 6px; border-radius: 3px;">${escapeHtml(s.category)}</span></td>
          <td style="font-weight: 600; color: #1d1e1c;">${escapeHtml(s.name)}</td>
          <td class="num-cell" style="font-weight: 700; color: #B85C3A; font-size: 0.9375rem;">${s.price.toLocaleString('ru-RU')} ₽</td>
          <td style="color: #656762; font-size: 0.75rem;">${escapeHtml(s.priceUnit)}</td>
          <td style="font-size: 0.75rem; color: #656762;">${escapeHtml(s.conditions)}</td>
        </tr>
      `).join('');
    } catch (err) {
      showToast('Ошибка загрузки прейскуранта услуг', 'error');
    }
  }

  // ----------------------------------------------------------------------------
  // 11. РАЗДЕЛ: СОТРУДНИКИ (STAFF — OWNER ONLY)
  // ----------------------------------------------------------------------------
  async function loadStaff() {
    try {
      const data = await apiFetch('/api/admin/staff');
      const tbody = document.getElementById('staffTableBody');

      tbody.innerHTML = (data.users || []).map(u => `
        <tr>
          <td style="font-weight: 600; color: #1d1e1c;">${escapeHtml(u.name)}</td>
          <td style="font-family: monospace; font-size: 0.75rem;">${escapeHtml(u.login)}</td>
          <td><span class="status-pill ${u.role === 'owner' ? 'status-Ожидает-расчёта' : u.role === 'admin' ? 'status-В-обработке' : 'status-Подтверждена'}">${getRoleDisplayName(u.role)}</span></td>
          <td><span class="status-pill ${u.active ? 'status-Подтверждена' : 'status-Отменена'}">${u.active ? 'Активен' : 'Заблокирован'}</span></td>
          <td style="font-size: 0.75rem; color: #656762;">${formatDate(u.createdAt)}</td>
          <td style="font-size: 0.75rem; color: #656762;">${u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Никогда'}</td>
          <td>${u.role !== 'owner' ? `<button type="button" class="btn-subtle" onclick="alert('Сброс пароля отправлен администратору')">Сброс пароля</button>` : '—'}</td>
        </tr>
      `).join('');
    } catch (err) {
      showToast('Ошибка загрузки сотрудников', 'error');
    }
  }

  // ----------------------------------------------------------------------------
  // 12. РАЗДЕЛ: ЖУРНАЛ АУДИТА (AUDIT LOG)
  // ----------------------------------------------------------------------------
  async function loadAuditLog() {
    const search = document.getElementById('auditSearchInput').value;
    const type = document.getElementById('auditTypeFilter').value;

    try {
      const q = new URLSearchParams({ search, type });
      const data = await apiFetch(`/api/admin/audit?${q.toString()}`);
      document.getElementById('auditCounterLabel').textContent = `Записей в логе: ${data.total}`;
      const tbody = document.getElementById('auditTableBody');

      if (!data.logs || data.logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Записи аудита отсутствуют.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.logs.map(l => `
        <tr>
          <td style="font-size: 0.75rem; color: #656762; white-space: nowrap;">${formatDate(l.timestamp)}</td>
          <td style="font-weight: 600; color: #1d1e1c;">${escapeHtml(l.user)}</td>
          <td><span style="font-size: 0.6875rem; background: #F0EEE9; padding: 2px 6px; border-radius: 3px;">${escapeHtml(l.action)}</span></td>
          <td style="font-weight: 500;">${escapeHtml(l.entityId)}</td>
          <td style="font-size: 0.75rem; color: #8E908A;">${escapeHtml(l.oldValue || '—')}</td>
          <td style="font-size: 0.75rem; font-weight: 500; color: #222320;">${escapeHtml(l.newValue || '—')}</td>
          <td style="font-size: 0.75rem; color: #656762;">${escapeHtml(l.details)}</td>
        </tr>
      `).join('');
    } catch (err) {
      showToast('Ошибка загрузки журнала аудита', 'error');
    }
  }

  // ----------------------------------------------------------------------------
  // 13. РАЗДЕЛ: НАСТРОЙКИ И БЭКАПЫ (SETTINGS & BACKUPS — OWNER ONLY)
  // ----------------------------------------------------------------------------
  async function loadSettings() {
    try {
      const data = await apiFetch('/api/admin/backups');
      const container = document.getElementById('backupsListContainer');

      if (!data.backups || data.backups.length === 0) {
        container.innerHTML = `<div class="empty-cell">Резервные копии пока не создавались.</div>`;
        return;
      }

      container.innerHTML = data.backups.map(b => `
        <div class="backup-item-row">
          <div>
            <div style="font-weight: 600; color: #1d1e1c;">${escapeHtml(b.backupId)}</div>
            <div style="font-size: 0.6875rem; color: #8E908A;">${formatDate(b.createdAt)} • ${b.sizeKb} КБ</div>
          </div>
          <button type="button" class="btn-subtle" onclick="window.AdminApp.restoreBackup('${b.backupId}')">
            Восстановить
          </button>
        </div>
      `).join('');
    } catch (err) {
      showToast('Ошибка загрузки резервных копий', 'error');
    }
  }

  async function createBackupNow() {
    try {
      showToast('Создание полного снимка базы данных...', 'info');
      const res = await apiFetch('/api/admin/backups/create', { method: 'POST' });
      showToast(`Бэкап ${res.backupId} успешно создан (${res.sizeKb} КБ)!`, 'success');
      loadSettings();
    } catch (err) {
      showToast('Ошибка создания бэкапа: ' + err.message, 'error');
    }
  }

  async function restoreBackup(backupId) {
    const ok = window.confirm(`ВНИМАНИЕ: Вы уверены, что хотите восстановить базу данных из копии "${backupId}"? Все текущие несохраненные данные будут заменены.`);
    if (!ok) return;

    try {
      showToast('Восстановление базы данных...', 'info');
      await apiFetch('/api/admin/backups/restore', {
        method: 'POST',
        body: { backupId }
      });
      showToast('Данные успешно восстановлены!', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      showToast('Ошибка восстановления: ' + err.message, 'error');
    }
  }

  // ----------------------------------------------------------------------------
  // 14. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ И СЛУШАТЕЛИ
  // ----------------------------------------------------------------------------
  function formatDate(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return isoStr;
    }
  }

  function formatSplitDate(isoStr) {
    if (!isoStr) return '<span class="ord-date-val">—</span>';
    try {
      const d = new Date(isoStr);
      const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      return `<span class="ord-date-val">${date}</span><span class="ord-time-val">${time}</span>`;
    } catch (e) {
      return `<span class="ord-date-val">${isoStr}</span>`;
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function navigateSection(sec, params = {}) {
    let hash = `#${sec}`;
    const q = new URLSearchParams(params).toString();
    if (q) hash += `?${q}`;
    window.location.hash = hash;
  }

  // Login form submit
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    const alertBox = document.getElementById('loginAlert');
    alertBox.style.display = 'none';

    try {
      const res = await apiFetch('/api/admin/auth/login', {
        method: 'POST',
        body: { login, password }
      });

      AdminApp.token = res.token;
      AdminApp.user = res.user;
      localStorage.setItem('dver1_admin_token', res.token);

      showToast(`Добро пожаловать, ${res.user.name}!`, 'success');
      showAppScreen();
      initRouter();
    } catch (err) {
      alertBox.textContent = err.message || 'Ошибка авторизации.';
      alertBox.style.display = 'block';
    }
  });

  // Logout button
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if (AdminApp.token) {
      try {
        await apiFetch('/api/admin/auth/logout', { method: 'POST' });
      } catch (e) {}
    }
    handleAuthFailure('Вы успешно вышли из системы.');
  });

  // Drawer & modal close buttons
  document.getElementById('btnCloseOrderDrawer')?.addEventListener('click', () => {
    document.getElementById('drawerOrderDetail').style.display = 'none';
  });

  document.getElementById('btnSaveOrderProcessing')?.addEventListener('click', saveOrderProcessing);
  document.getElementById('btnSendOrderComment')?.addEventListener('click', sendOrderComment);

  document.getElementById('btnCloseProductModal')?.addEventListener('click', () => {
    document.getElementById('modalProductEdit').style.display = 'none';
  });
  document.getElementById('btnCancelProductEdit')?.addEventListener('click', () => {
    document.getElementById('modalProductEdit').style.display = 'none';
  });
  document.getElementById('formProductEdit')?.addEventListener('submit', saveProductEdit);

  document.getElementById('btnCloseStockModal')?.addEventListener('click', () => {
    document.getElementById('modalStockAdjust').style.display = 'none';
  });
  document.getElementById('btnCancelStockModal')?.addEventListener('click', () => {
    document.getElementById('modalStockAdjust').style.display = 'none';
  });
  document.getElementById('formStockAdjust')?.addEventListener('submit', handleStockAdjustSubmit);

  document.getElementById('btnCloseTransferModal')?.addEventListener('click', () => {
    document.getElementById('modalStockTransfer').style.display = 'none';
  });
  document.getElementById('btnCancelTransferModal')?.addEventListener('click', () => {
    document.getElementById('modalStockTransfer').style.display = 'none';
  });
  document.getElementById('formStockTransfer')?.addEventListener('submit', handleStockTransferSubmit);

  // Backup create
  document.getElementById('btnCreateBackupNow')?.addEventListener('click', createBackupNow);

  // Mobile navigation toggles
  document.getElementById('btnOpenMobileNav')?.addEventListener('click', () => {
    document.getElementById('adminSidebar').classList.add('open');
  });
  document.getElementById('btnCloseMobileNav')?.addEventListener('click', () => {
    document.getElementById('adminSidebar').classList.remove('open');
  });

  // Global search input debounce
  let searchDebounce;
  document.getElementById('globalSearchInput')?.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      const q = e.target.value.trim();
      if (q) navigateSection('catalog', { search: q });
    }, 400);
  });

  // Product edit modal tabs
  document.querySelectorAll('.modal-tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tabId = `ptabContent${capitalize(btn.dataset.ptab)}`;
      const content = document.getElementById(tabId);
      if (content) content.classList.add('active');
    };
  });

  // Quick fill helper for login
  window.quickFillLogin = function(email) {
    document.getElementById('loginEmail').value = email;
    if (email === 'owner@dver1.ru') document.getElementById('loginPassword').value = 'OwnerDver1!2026';
    else if (email === 'admin@dver1.ru') document.getElementById('loginPassword').value = 'AdminDver1!2026';
    else if (email === 'manager@dver1.ru') document.getElementById('loginPassword').value = 'ManagerDver1!2026';
  };

  // Expose global controller
  window.AdminApp = {
    openOrderDrawer,
    openProductModal,
    openStockAdjustModal,
    openStockTransferModal,
    restoreBackup,
    navigateSection
  };

  // Auto initialize on DOM ready
  document.addEventListener('DOMContentLoaded', checkAuthSession);

})();
