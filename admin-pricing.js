// ==============================================================================
// ДВЕРИ №1 — ADMIN PRICING & PRICE LIST CONTROLLER (V3.3)
// Полноценная логика импорта, матчинга, предпросмотра и применения прайсов
// ==============================================================================

(function() {
  'use strict';

  // Global State for Pricing Section
  const PricingState = {
    suppliers: {},
    baseMarkup: 10000,
    currentImport: null, // parsed & matched data
    activeFilterTab: 'all', // 'all', 'changed', 'unchanged', 'manual', 'new_items'
    selectedRowIds: new Set(),
    catalogSearchCache: [],
    historyList: [],
    currentBindingRowId: null
  };

  // DOM Elements
  let el = {};

  function initElements() {
    el = {
      navTabs: document.querySelectorAll('.admin-nav-item'),
      views: {
        catalog: document.getElementById('viewCatalog'),
        pricing: document.getElementById('viewPricing'),
        history: document.getElementById('viewHistory')
      },
      // Pricing Section Elements
      supplierSelect: document.getElementById('pricingSupplierSelect'),
      supplierRuleBadge: document.getElementById('supplierRuleBadge'),
      fileInput: document.getElementById('priceFileInput'),
      dropZone: document.getElementById('priceDropZone'),
      rawTextInput: document.getElementById('rawPriceTextInput'),
      btnParseText: document.getElementById('btnParseText'),
      // Preview Section
      previewSection: document.getElementById('pricingPreviewSection'),
      previewSummary: document.getElementById('previewSummaryStats'),
      previewTabs: document.querySelectorAll('.filter-tab-btn'),
      previewTableBody: document.getElementById('previewTableBody'),
      selectAllCheckbox: document.getElementById('selectAllRows'),
      btnApplySelected: document.getElementById('btnApplySelected'),
      btnApplyAllConfirmed: document.getElementById('btnApplyAllConfirmed'),
      btnCancelImport: document.getElementById('btnCancelImport'),
      // Manual Bind Modal
      modalManualBind: document.getElementById('modalManualBind'),
      bindRowTitle: document.getElementById('bindRowTitle'),
      bindSearchInput: document.getElementById('bindSearchInput'),
      bindSearchResults: document.getElementById('bindSearchResults'),
      btnCloseBindModal: document.getElementById('btnCloseBindModal'),
      // History Section
      historyListContainer: document.getElementById('historyListContainer'),
      btnRefreshHistory: document.getElementById('btnRefreshHistory')
    };
  }

  // ----------------------------------------------------------------------------
  // 1. ИНИЦИАЛИЗАЦИЯ И ЗАГРУЗКА СПРАВОЧНИКОВ
  // ----------------------------------------------------------------------------
  async function initPricingSystem() {
    initElements();
    attachEvents();
    await loadSuppliers();
    await loadCatalogCache();
    await loadHistory();
  }

  async function loadSuppliers() {
    try {
      const res = await fetch('/api/pricing/suppliers');
      const data = await res.json();
      PricingState.suppliers = data.suppliers || {};
      PricingState.baseMarkup = data.baseMarkup || 10000;

      // Populate supplier select
      if (el.supplierSelect) {
        el.supplierSelect.innerHTML = `
          <option value="">-- Автоматическое определение поставщика --</option>
          ${Object.values(PricingState.suppliers).map(s => `
            <option value="${s.key}">${escapeHtml(s.name)}</option>
          `).join('')}
        `;
      }
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    }
  }

  async function loadCatalogCache() {
    try {
      const res = await fetch('/api/pricing/catalog');
      const data = await res.json();
      PricingState.catalogSearchCache = data.products || [];
    } catch (err) {
      console.error('Failed to load catalog cache:', err);
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/pricing/history');
      const data = await res.json();
      PricingState.historyList = data.history || [];
      renderHistoryView();
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  // ----------------------------------------------------------------------------
  // 2. ОБРАБОТЧИКИ СОБЫТИЙ И НАВИГАЦИЯ
  // ----------------------------------------------------------------------------
  function attachEvents() {
    // Navigation Tabs
    el.navTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = tab.dataset.view;
        switchView(targetView);
      });
    });

    // Supplier Select Change
    if (el.supplierSelect) {
      el.supplierSelect.addEventListener('change', () => {
        const key = el.supplierSelect.value;
        const s = PricingState.suppliers[key];
        if (s && el.supplierRuleBadge) {
          el.supplierRuleBadge.textContent = s.ruleDesc;
          el.supplierRuleBadge.style.display = 'block';
        } else if (el.supplierRuleBadge) {
          el.supplierRuleBadge.textContent = 'Правило: Розничная цена = Закупка + 10 000 ₽';
          el.supplierRuleBadge.style.display = 'block';
        }
      });
    }

    // Drag & Drop
    if (el.dropZone && el.fileInput) {
      el.dropZone.addEventListener('click', () => el.fileInput.click());

      el.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.dropZone.classList.add('dragover');
      });

      el.dropZone.addEventListener('dragleave', () => {
        el.dropZone.classList.remove('dragover');
      });

      el.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        el.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFileUpload(e.dataTransfer.files[0]);
        }
      });

      el.fileInput.addEventListener('change', () => {
        if (el.fileInput.files && el.fileInput.files.length > 0) {
          handleFileUpload(el.fileInput.files[0]);
        }
      });
    }

    // Parse Text from Textarea
    if (el.btnParseText && el.rawTextInput) {
      el.btnParseText.addEventListener('click', () => {
        const text = el.rawTextInput.value.trim();
        if (!text) {
          alert('Вставьте текст или таблицу с прайс-листом в поле ввода.');
          return;
        }
        handleTextParse(text);
      });
    }

    // Preview Filter Tabs
    el.previewTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        el.previewTabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        PricingState.activeFilterTab = btn.dataset.tab;
        renderPreviewTable();
      });
    });

    // Select All Checkbox
    if (el.selectAllCheckbox) {
      el.selectAllCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const visibleRows = getFilteredRows();
        visibleRows.forEach(r => {
          if (checked) {
            PricingState.selectedRowIds.add(r.rowId);
          } else {
            PricingState.selectedRowIds.delete(r.rowId);
          }
        });
        renderPreviewTable();
        updateActionButtons();
      });
    }

    // Action Buttons
    if (el.btnApplySelected) {
      el.btnApplySelected.addEventListener('click', () => applyConfirmedChanges(false));
    }
    if (el.btnApplyAllConfirmed) {
      el.btnApplyAllConfirmed.addEventListener('click', () => applyConfirmedChanges(true));
    }
    if (el.btnCancelImport) {
      el.btnCancelImport.addEventListener('click', () => cancelImport());
    }

    // Manual Bind Modal
    if (el.btnCloseBindModal) {
      el.btnCloseBindModal.addEventListener('click', () => closeManualBindModal());
    }
    if (el.bindSearchInput) {
      el.bindSearchInput.addEventListener('input', (e) => renderBindSearchResults(e.target.value));
    }
    if (el.btnRefreshHistory) {
      el.btnRefreshHistory.addEventListener('click', () => loadHistory());
    }
  }

  function switchView(viewName) {
    el.navTabs.forEach(t => t.classList.toggle('active', t.dataset.view === viewName));
    Object.keys(el.views).forEach(key => {
      if (el.views[key]) {
        el.views[key].style.display = (key === viewName) ? 'block' : 'none';
      }
    });

    if (viewName === 'history') {
      loadHistory();
    }
  }

  // ----------------------------------------------------------------------------
  // 3. ОБРАБОТКА ЗАГРУЗКИ ФАЙЛОВ И ТЕКСТА
  // ----------------------------------------------------------------------------
  async function handleFileUpload(file) {
    showLoading('Загрузка и парсинг файла ' + file.name + '...');
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        await executeImportPipeline({
          fileBase64: base64,
          filename: file.name,
          forcedSupplier: el.supplierSelect ? el.supplierSelect.value : null
        });
      };
      reader.readAsDataURL(file);
    } catch (err) {
      hideLoading();
      alert('Ошибка чтения файла: ' + err.message);
    }
  }

  async function handleTextParse(text) {
    showLoading('Парсинг и сопоставление позиций прайс-листа...');
    await executeImportPipeline({
      textContent: text,
      filename: 'Буфер обмена (Таблица/Текст)',
      forcedSupplier: el.supplierSelect ? el.supplierSelect.value : null
    });
  }

  async function executeImportPipeline(payload) {
    try {
      // 1. Parse File / Text on Backend
      const parseRes = await fetch('/api/pricing/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const parsedData = await parseRes.json();

      if (parsedData.error) {
        throw new Error(parsedData.error);
      }

      if (!parsedData.items || parsedData.items.length === 0) {
        hideLoading();
        alert('В документе не найдено распознаваемых позиций с ценами. Проверьте формат прайс-листа.');
        return;
      }

      // Update supplier select to detected supplier if was auto
      if (el.supplierSelect && parsedData.supplier) {
        el.supplierSelect.value = parsedData.supplier;
        const s = PricingState.suppliers[parsedData.supplier];
        if (s && el.supplierRuleBadge) {
          el.supplierRuleBadge.textContent = s.ruleDesc;
          el.supplierRuleBadge.style.display = 'block';
        }
      }

      // 2. Run Catalog Matching on Backend
      const matchRes = await fetch('/api/pricing/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: parsedData.items,
          supplierKey: parsedData.supplier
        })
      });
      const matchedData = await matchRes.json();

      if (matchedData.error) {
        throw new Error(matchedData.error);
      }

      // 3. Set State & Render Preview
      PricingState.currentImport = {
        meta: parsedData,
        rows: matchedData.items
      };

      // Select by default exact matches with price changes
      PricingState.selectedRowIds.clear();
      matchedData.items.forEach(r => {
        if (r.isApproved) {
          PricingState.selectedRowIds.add(r.rowId);
        }
      });

      hideLoading();
      renderPreviewSection();

    } catch (err) {
      hideLoading();
      alert('Ошибка импорта: ' + err.message);
    }
  }

  // ----------------------------------------------------------------------------
  // 4. ОТОБРАЖЕНИЕ ПРЕДПРОСМОТРА И ТАБЛИЦЫ
  // ----------------------------------------------------------------------------
  function renderPreviewSection() {
    if (!PricingState.currentImport) {
      el.previewSection.style.display = 'none';
      return;
    }

    el.previewSection.style.display = 'block';
    el.previewSection.scrollIntoView({ behavior: 'smooth' });

    const rows = PricingState.currentImport.rows;
    const stats = {
      total: rows.length,
      exact: rows.filter(r => r.matchType === 'exact').length,
      probable: rows.filter(r => r.matchType === 'probable').length,
      manual: rows.filter(r => r.matchType === 'manual_check').length,
      notFound: rows.filter(r => r.matchType === 'not_found').length,
      changed: rows.filter(r => r.changeType === 'changed_price').length,
      unchanged: rows.filter(r => r.changeType === 'unchanged').length,
      newItems: rows.filter(r => r.changeType === 'new_item').length
    };

    // Render Stats
    el.previewSummary.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Всего позиций в прайсе</div>
        <div class="stat-val">${stats.total}</div>
        <div class="stat-sub">Дата: ${PricingState.currentImport.meta.date}</div>
      </div>
      <div class="stat-card stat-success">
        <div class="stat-label">Точных совпадений</div>
        <div class="stat-val">${stats.exact}</div>
        <div class="stat-sub">Готовы к публикации</div>
      </div>
      <div class="stat-card stat-warning">
        <div class="stat-label">Требуют проверки</div>
        <div class="stat-val">${stats.probable + stats.manual}</div>
        <div class="stat-sub">${stats.probable} вероятных, ${stats.manual} спорных</div>
      </div>
      <div class="stat-card stat-neutral">
        <div class="stat-label">Новые / Не найдены</div>
        <div class="stat-val">${stats.notFound}</div>
        <div class="stat-sub">Нет в текущем каталоге</div>
      </div>
      <div class="stat-card stat-accent">
        <div class="stat-label">Изменение розничной цены</div>
        <div class="stat-val">${stats.changed}</div>
        <div class="stat-sub">${stats.unchanged} без изменений</div>
      </div>
    `;

    renderPreviewTable();
    updateActionButtons();
  }

  function getFilteredRows() {
    if (!PricingState.currentImport) return [];
    const tab = PricingState.activeFilterTab;
    const rows = PricingState.currentImport.rows;

    switch (tab) {
      case 'changed':
        return rows.filter(r => r.changeType === 'changed_price');
      case 'unchanged':
        return rows.filter(r => r.changeType === 'unchanged');
      case 'manual':
        return rows.filter(r => r.matchType === 'manual_check' || r.matchType === 'probable');
      case 'new_items':
        return rows.filter(r => r.matchType === 'not_found');
      case 'all':
      default:
        return rows;
    }
  }

  function renderPreviewTable() {
    const rows = getFilteredRows();

    if (rows.length === 0) {
      el.previewTableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 40px; color: #94a3b8;">
            В данной группе нет позиций.
          </td>
        </tr>
      `;
      return;
    }

    el.previewTableBody.innerHTML = rows.map(r => {
      const isSelected = PricingState.selectedRowIds.has(r.rowId);
      const isExact = r.matchType === 'exact';
      const isProbable = r.matchType === 'probable';
      const isManual = r.matchType === 'manual_check';
      const isNotFound = r.matchType === 'not_found';

      let statusBadge = '';
      if (isExact) {
        statusBadge = `<span class="badge-status-ok" title="Точное совпадение модели">✓ Точное (${r.matchScore}%)</span>`;
      } else if (isProbable) {
        statusBadge = `<span class="badge-status-prob" title="Высокая вероятность совпадения">⚡ Вероятное (${r.matchScore}%)</span>`;
      } else if (isManual) {
        statusBadge = `<span class="badge-status-ocr" title="Требуется ручное подтверждение">⚠️ Проверить (${r.matchScore}%)</span>`;
      } else {
        statusBadge = `<span class="badge-status-notfound" title="Товар не найден в текущем каталоге">✕ Не найден</span>`;
      }

      // Diff badge
      let diffHtml = '<span style="color: #94a3b8;">0 ₽</span>';
      if (r.diffRetail > 0) {
        diffHtml = `<span style="color: #34d399; font-weight: 600;">+${formatMoney(r.diffRetail)} ₽</span>`;
      } else if (r.diffRetail < 0) {
        diffHtml = `<span style="color: #f87171; font-weight: 600;">-${formatMoney(Math.abs(r.diffRetail))} ₽</span>`;
      }

      const p = r.matchedProduct;
      const productCell = p ? `
        <div class="table-product-cell">
          <img src="${p.image ? ('data/catalog-output/' + p.image) : 'logo.png'}" class="table-prod-thumb" alt="">
          <div>
            <div style="font-weight: 600; color: #fff;">${escapeHtml(p.model)}</div>
            <div style="font-size: 0.75rem; color: #94a3b8;">${escapeHtml(p.brand)} • ID: ${p.id}</div>
          </div>
        </div>
      ` : `
        <div style="color: #94a3b8; font-style: italic; font-size: 0.8125rem;">
          Не привязан к товару каталога
          <button type="button" class="btn-bind-inline" onclick="window.AdminPricing.openManualBind('${r.rowId}')">+ Привязать</button>
        </div>
      `;

      return `
        <tr class="preview-row ${isSelected ? 'row-selected' : ''}" data-row-id="${r.rowId}">
          <td style="text-align: center;">
            <input type="checkbox" class="row-checkbox" data-row-id="${r.rowId}" ${isSelected ? 'checked' : ''} ${!p ? 'disabled' : ''}>
          </td>
          <td><span class="supplier-pill">${escapeHtml(r.supplier)}</span></td>
          <td>
            <div style="font-weight: 500; color: #f1f5f9;">${escapeHtml(r.rawModel)}</div>
            ${r.rawCode ? `<div style="font-size: 0.75rem; color: #64748b;">Арт: ${escapeHtml(r.rawCode)}</div>` : ''}
          </td>
          <td>${productCell}</td>
          <td class="num-cell">${r.oldPurchase ? (formatMoney(r.oldPurchase) + ' ₽') : '—'}</td>
          <td class="num-cell" style="font-weight: 600; color: #e2e8f0;">${formatMoney(r.newPurchase)} ₽</td>
          <td class="num-cell" style="color: #c28b5b; font-weight: 600;">+10 000 ₽</td>
          <td class="num-cell">${r.oldRetail ? (formatMoney(r.oldRetail) + ' ₽') : '—'}</td>
          <td class="num-cell" style="font-weight: 700; color: #60a5fa; font-size: 0.9375rem;">${formatMoney(r.newRetail)} ₽</td>
          <td class="num-cell">${diffHtml}</td>
          <td>
            ${statusBadge}
            ${p ? `<button type="button" class="btn-rebind-tiny" title="Изменить сопоставление" onclick="window.AdminPricing.openManualBind('${r.rowId}')">✎</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    // Attach row checkbox handlers
    el.previewTableBody.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const rowId = e.target.dataset.rowId;
        if (e.target.checked) {
          PricingState.selectedRowIds.add(rowId);
        } else {
          PricingState.selectedRowIds.delete(rowId);
        }
        updateActionButtons();
      });
    });
  }

  function updateActionButtons() {
    const selCount = PricingState.selectedRowIds.size;
    if (el.btnApplySelected) {
      el.btnApplySelected.textContent = `✓ Применить выбранные изменения (${selCount})`;
      el.btnApplySelected.disabled = selCount === 0;
    }

    if (el.btnApplyAllConfirmed && PricingState.currentImport) {
      const confirmedCount = PricingState.currentImport.rows.filter(r => r.matchedProduct && (r.matchType === 'exact' || r.matchType === 'probable')).length;
      el.btnApplyAllConfirmed.textContent = `⚡ Применить все подтверждённые (${confirmedCount})`;
      el.btnApplyAllConfirmed.disabled = confirmedCount === 0;
    }
  }

  // ----------------------------------------------------------------------------
  // 5. ПРИМЕНЕНИЕ ИЗМЕНЕНИЙ (SAFEGUARD CONFIRMATION)
  // ----------------------------------------------------------------------------
  async function applyConfirmedChanges(applyAllConfirmed = false) {
    if (!PricingState.currentImport) return;

    let targetRows = [];
    if (applyAllConfirmed) {
      targetRows = PricingState.currentImport.rows.filter(r => r.matchedProduct && (r.matchType === 'exact' || r.matchType === 'probable'));
    } else {
      targetRows = PricingState.currentImport.rows.filter(r => PricingState.selectedRowIds.has(r.rowId) && r.matchedProduct);
    }

    if (targetRows.length === 0) {
      alert('Не выбрано ни одной сопоставленной позиции для применения.');
      return;
    }

    // Explicit confirmation
    const confirmMsg = `ВНИМАНИЕ: Подтверждение публикации розничных цен.\n\n` +
      `Вы собираетесь обновить цены для ${targetRows.length} моделей дверей.\n` +
      `Правило: РОЗНИЧНАЯ ЦЕНА = ЗАКУПКА + 10 000 ₽.\n\n` +
      `Изменения сразу вступят в силу в базе данных каталога и на витрине магазина.\n\n` +
      `Применить выбранные цены?`;

    if (!confirm(confirmMsg)) return;

    showLoading(`Применение новых цен (${targetRows.length} позиций)...`);

    try {
      const res = await fetch('/api/pricing/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedItems: targetRows,
          adminUser: 'Куратор каталога'
        })
      });
      const result = await res.json();

      hideLoading();

      if (result.success) {
        alert(`✓ Успешно обновлены цены для ${result.appliedCount} товаров!\nИзменения сохранены в журнале аудита.`);
        // Reload catalog cache and history
        await loadCatalogCache();
        await loadHistory();
        // Clear import preview
        cancelImport();
        // Switch to history tab
        switchView('history');
      } else {
        alert('Ошибка при сохранении: ' + (result.error || 'Неизвестная ошибка'));
      }
    } catch (err) {
      hideLoading();
      alert('Ошибка соединения с сервером: ' + err.message);
    }
  }

  function cancelImport() {
    PricingState.currentImport = null;
    PricingState.selectedRowIds.clear();
    if (el.previewSection) el.previewSection.style.display = 'none';
    if (el.rawTextInput) el.rawTextInput.value = '';
    if (el.fileInput) el.fileInput.value = '';
  }

  // ----------------------------------------------------------------------------
  // 6. РУЧНАЯ ПРИВЯЗКА ТОВАРА (MANUAL BIND MODAL)
  // ----------------------------------------------------------------------------
  function openManualBind(rowId) {
    if (!PricingState.currentImport) return;
    const row = PricingState.currentImport.rows.find(r => r.rowId === rowId);
    if (!row) return;

    PricingState.currentBindingRowId = rowId;
    el.bindRowTitle.textContent = `${row.rawModel} (Закупка: ${formatMoney(row.purchasePrice)} ₽ → Новая розница: ${formatMoney(row.newRetail)} ₽)`;
    el.modalManualBind.style.display = 'flex';
    el.bindSearchInput.value = row.rawModel.split(' ')[0] || '';
    renderBindSearchResults(el.bindSearchInput.value);
  }

  function closeManualBindModal() {
    el.modalManualBind.style.display = 'none';
    PricingState.currentBindingRowId = null;
  }

  function renderBindSearchResults(query) {
    const q = (query || '').toLowerCase().trim();
    const catalog = PricingState.catalogSearchCache;

    const filtered = catalog.filter(p => {
      if (!q) return true;
      const str = (p.id + ' ' + p.model + ' ' + p.brand + ' ' + (p.collection || '')).toLowerCase();
      return str.includes(q);
    }).slice(0, 30);

    if (filtered.length === 0) {
      el.bindSearchResults.innerHTML = `<div style="padding: 24px; text-align: center; color: #94a3b8;">По запросу «${escapeHtml(q)}» ничего не найдено.</div>`;
      return;
    }

    el.bindSearchResults.innerHTML = filtered.map(p => {
      const img = p.image ? ('data/catalog-output/' + p.image) : 'logo.png';
      return `
        <div class="bind-candidate-card" onclick="window.AdminPricing.selectManualBindProduct('${p.id}')">
          <img src="${img}" class="bind-cand-thumb" alt="">
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #fff;">${escapeHtml(p.model)}</div>
            <div style="font-size: 0.75rem; color: #94a3b8;">
              ${escapeHtml(p.brand)} • ${escapeHtml(p.collection || '—')} • ID: ${p.id}
            </div>
            <div style="font-size: 0.8125rem; color: #60a5fa; margin-top: 4px;">
              Текущая розница: ${formatMoney(p.price)} ₽ (Закупка: ${formatMoney(p.dealer_price || (p.price - 10000))} ₽)
            </div>
          </div>
          <button type="button" class="btn-bind-action">Выбрать →</button>
        </div>
      `;
    }).join('');
  }

  function selectManualBindProduct(productId) {
    if (!PricingState.currentBindingRowId || !PricingState.currentImport) return;

    const row = PricingState.currentImport.rows.find(r => r.rowId === PricingState.currentBindingRowId);
    const prod = PricingState.catalogSearchCache.find(p => p.id === productId);

    if (row && prod) {
      row.matchedProduct = {
        id: prod.id,
        model: prod.model,
        brand: prod.brand,
        collection: prod.collection,
        category: prod.category,
        image: prod.image
      };
      row.matchType = 'exact';
      row.matchScore = 100;
      row.oldPurchase = prod.dealer_price || (prod.price - 10000);
      row.oldRetail = prod.price;
      row.diffRetail = row.newRetail - row.oldRetail;
      row.changeType = (row.diffRetail === 0) ? 'unchanged' : 'changed_price';
      row.isApproved = true;

      PricingState.selectedRowIds.add(row.rowId);

      closeManualBindModal();
      renderPreviewSection();
    }
  }

  // ----------------------------------------------------------------------------
  // 7. ОТОБРАЖЕНИЕ ЖУРНАЛА ИСТОРИИ (AUDIT TRAIL)
  // ----------------------------------------------------------------------------
  function renderHistoryView() {
    if (!el.historyListContainer) return;

    const list = PricingState.historyList;
    if (list.length === 0) {
      el.historyListContainer.innerHTML = `
        <div style="padding: 48px; text-align: center; color: #94a3b8; background: #16202e; border-radius: 8px;">
          Журнал изменений пуст. Все применённые через систему прайс-листы будут автоматически фиксироваться здесь.
        </div>
      `;
      return;
    }

    el.historyListContainer.innerHTML = list.map(entry => {
      const items = entry.items || [];
      return `
        <div class="history-entry-card">
          <div class="history-entry-header">
            <div>
              <span class="badge-status-ok">✓ Применено</span>
              <strong style="margin-left: 8px; color: #fff;">${escapeHtml(entry.displayDate || entry.date)}</strong>
              <span style="color: #94a3b8; margin-left: 12px;">Оператор: ${escapeHtml(entry.admin || 'Администратор')}</span>
            </div>
            <div style="color: #60a5fa; font-weight: 600;">
              Обновлено дверей: ${entry.appliedCount} шт.
            </div>
          </div>
          <div class="history-items-table-wrap">
            <table class="history-table">
              <thead>
                <tr>
                  <th>Модель двери</th>
                  <th>ID</th>
                  <th>Поставщик</th>
                  <th>Старая закупка</th>
                  <th>Новая закупка</th>
                  <th>Старая розница</th>
                  <th>Новая розница</th>
                  <th>Изменение</th>
                </tr>
              </thead>
              <tbody>
                ${items.slice(0, 15).map(it => `
                  <tr>
                    <td style="font-weight: 500; color: #f8fafc;">${escapeHtml(it.model)}</td>
                    <td style="color: #64748b; font-size: 0.75rem;">${it.productId}</td>
                    <td><span class="supplier-pill">${escapeHtml(it.supplier || it.brand)}</span></td>
                    <td class="num-cell">${formatMoney(it.oldPurchase)} ₽</td>
                    <td class="num-cell" style="font-weight: 600; color: #e2e8f0;">${formatMoney(it.newPurchase)} ₽</td>
                    <td class="num-cell">${formatMoney(it.oldRetail)} ₽</td>
                    <td class="num-cell" style="font-weight: 700; color: #60a5fa;">${formatMoney(it.newRetail)} ₽</td>
                    <td class="num-cell">
                      ${it.diff > 0 ? `<span style="color: #34d399; font-weight: 600;">+${formatMoney(it.diff)} ₽</span>` : (it.diff < 0 ? `<span style="color: #f87171; font-weight: 600;">-${formatMoney(Math.abs(it.diff))} ₽</span>` : '<span style="color: #94a3b8;">0 ₽</span>')}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ${items.length > 15 ? `<div style="padding: 8px 12px; font-size: 0.75rem; color: #94a3b8; text-align: center;">... и ещё ${items.length - 15} позиций в данной сессии</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ----------------------------------------------------------------------------
  // УТИЛИТЫ
  // ----------------------------------------------------------------------------
  function formatMoney(num) {
    if (num === null || num === undefined || isNaN(num)) return '—';
    return String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showLoading(msg) {
    let loader = document.getElementById('adminPricingLoader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'adminPricingLoader';
      loader.className = 'admin-loader-overlay';
      document.body.appendChild(loader);
    }
    loader.innerHTML = `
      <div class="admin-loader-box">
        <div class="spinner"></div>
        <div style="margin-top: 12px; font-weight: 600; color: #fff;">${escapeHtml(msg)}</div>
      </div>
    `;
    loader.style.display = 'flex';
  }

  function hideLoading() {
    const loader = document.getElementById('adminPricingLoader');
    if (loader) loader.style.display = 'none';
  }

  // Expose global controller
  window.AdminPricing = {
    init: initPricingSystem,
    openManualBind,
    selectManualBindProduct,
    switchView
  };

  document.addEventListener('DOMContentLoaded', initPricingSystem);

})();
