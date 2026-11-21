/**
 * ДВЕРИ №1 — ЕДИНЫЙ МОДУЛЬ ЛИДОГЕНЕРАЦИИ И ЗАЯВОК НА ЗАМЕР
 * Валидация телефона, маска +7, состояния кнопки, сбор контекста, аналитика
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // МАСКА И ВАЛИДАЦИЯ ТЕЛЕФОНА
  // --------------------------------------------------------------------------

  function getDigits(str) {
    return (str || '').replace(/\D/g, '');
  }

  function formatPhone(inputVal) {
    let digits = getDigits(inputVal);
    if (!digits) return '';

    // Если начинается с 8 или 7 — нормализуем к 7
    if (digits[0] === '8' || digits[0] === '7') {
      digits = '7' + digits.substring(1);
    } else {
      digits = '7' + digits;
    }

    digits = digits.substring(0, 11);

    let res = '+7';
    if (digits.length > 1) {
      res += ' (' + digits.substring(1, 4);
    }
    if (digits.length >= 4) {
      res += ') ' + digits.substring(4, 7);
    }
    if (digits.length >= 7) {
      res += '-' + digits.substring(7, 9);
    }
    if (digits.length >= 9) {
      res += '-' + digits.substring(9, 11);
    }
    return res;
  }

  function validatePhone(phoneStr) {
    const digits = getDigits(phoneStr);
    return digits.length === 11 && (digits[0] === '7' || digits[0] === '8');
  }

  function attachPhoneMask(inputEl) {
    if (!inputEl) return;

    inputEl.setAttribute('type', 'tel');
    inputEl.setAttribute('autocomplete', 'tel');
    inputEl.setAttribute('placeholder', '+7 (___) ___-__-__');

    inputEl.addEventListener('input', (e) => {
      const val = e.target.value;
      const formatted = formatPhone(val);
      e.target.value = formatted;
    });

    inputEl.addEventListener('focus', (e) => {
      if (!e.target.value) {
        e.target.value = '+7 (';
      }
    });

    inputEl.addEventListener('blur', (e) => {
      if (e.target.value === '+7 (' || e.target.value === '+7') {
        e.target.value = '';
      }
    });
  }

  // --------------------------------------------------------------------------
  // СБОР АВТОМАТИЧЕСКОГО КОНТЕКСТА
  // --------------------------------------------------------------------------

  function getLeadContext(overrides = {}) {
    let product = overrides.product || null;

    // Если продукт не передан явно, пробуем извлечь из глобального состояния PDP или каталога
    if (!product && window.pdpState && window.pdpState.product) {
      const p = window.pdpState.product;
      product = {
        id: p.id,
        name: p.model || p.name,
        price: (typeof window.calculateCurrentPrice === 'function' ? window.calculateCurrentPrice() : p.price),
        variant: window.pdpState.activeVariantIndex !== undefined && p.variants ? p.variants[window.pdpState.activeVariantIndex]?.name : '',
        size: window.pdpState.activeSize || '',
        opening: window.pdpState.activeOpening || ''
      };
    }

    // Состав корзины (если пользователь что-то добавил)
    let cartSummary = null;
    if (window.CartStore && typeof window.CartStore.getCart === 'function') {
      const cart = window.CartStore.getCart();
      if (cart && cart.length > 0) {
        cartSummary = {
          itemsCount: cart.length,
          items: cart.map(i => `${i.title || i.model} (${i.quantity} шт.)`).join(', ')
        };
      }
    }

    return {
      pageUrl: window.location.href,
      pageTitle: document.title,
      city: overrides.city || document.getElementById('leadCitySelect')?.value || 'Казань',
      source: overrides.source || 'Форма обратной связи',
      product,
      cart: cartSummary,
      submittedAt: new Date().toISOString()
    };
  }

  // --------------------------------------------------------------------------
  // ОТПРАВКА ЗАЯВКИ (SUBMIT LEAD)
  // --------------------------------------------------------------------------

  async function submitLead(payload, options = {}) {
    const formEl = options.formEl || null;
    const submitBtn = options.submitBtn || (formEl ? formEl.querySelector('button[type="submit"]') : null);

    // 1. Валидация телефона
    const phone = payload.phone?.trim();
    if (!phone || !validatePhone(phone)) {
      if (options.phoneInputEl) {
        options.phoneInputEl.classList.add('input-error');
        options.phoneInputEl.focus();
      }
      throw new Error('Пожалуйста, укажите корректный номер телефона в формате +7 (XXX) XXX-XX-XX.');
    }

    const name = payload.name?.trim();
    if (!name) {
      if (options.nameInputEl) {
        options.nameInputEl.classList.add('input-error');
        options.nameInputEl.focus();
      }
      throw new Error('Пожалуйста, укажите ваше имя.');
    }

    // 2. Генерация номера заявки и контекста
    const ticketNumber = 'ДВ-' + Math.floor(100000 + Math.random() * 900000);
    const context = getLeadContext(payload);

    const leadRecord = {
      ticketNumber,
      name,
      phone,
      city: payload.city || context.city,
      address: payload.address?.trim() || '',
      comment: payload.comment?.trim() || '',
      source: context.source,
      pageUrl: context.pageUrl,
      product: context.product,
      cart: context.cart,
      submittedAt: context.submittedAt
    };

    // 3. Состояние кнопки: LOADING
    let originalBtnHtml = '';
    if (submitBtn) {
      originalBtnHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.classList.add('btn-loading');
      submitBtn.innerHTML = `
        <span class="lead-btn-spinner" aria-hidden="true"></span>
        <span>Отправка заявки...</span>
      `;
    }

    try {
      const cfg = window.DVER_CONFIG || {};

      // Если задан рабочий эндпоинт — отправляем реальный POST запрос
      if (cfg.LEAD_ENDPOINT && cfg.LEAD_ENDPOINT.trim() !== '') {
        const res = await fetch(cfg.LEAD_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadRecord)
        });
        if (!res.ok) throw new Error('Сервер вернул статус ' + res.status);
      } else {
        // Имитация сетевой задержки для премиального фидбека UI
        await new Promise(r => setTimeout(r, 450));
      }

      // Сохраняем в localStorage для надёжности
      try {
        const history = JSON.parse(localStorage.getItem('DVER1_LEADS') || '[]');
        history.push(leadRecord);
        localStorage.setItem('DVER1_LEADS', JSON.stringify(history));
      } catch (err) {
        console.warn('LocalStorage save error:', err);
      }

      // Отправка событий в аналитику (Яндекс.Метрика / Google Analytics)
      if (typeof window.trackGoal === 'function') {
        window.trackGoal('lead_measure', {
          ticketNumber,
          source: leadRecord.source,
          city: leadRecord.city
        });
      }

      logAnalyticsEvent('lead_form_submitted', {
        ticketNumber,
        source: leadRecord.source,
        city: leadRecord.city
      });

      // 4. Состояние кнопки: SUCCESS
      if (submitBtn) {
        submitBtn.classList.remove('btn-loading');
        submitBtn.classList.add('btn-lead-success');
        submitBtn.innerHTML = `
          <span style="font-size: 1.1rem; margin-right: 6px;">✓</span>
          <span>Заявка принята, инженер свяжется в течение 15 минут</span>
        `;
      }

      // Формируем текст для предзаполненного сообщения в WhatsApp/Telegram
      let messengerText = `Здравствуйте! Заявка №${ticketNumber} на замер/консультацию.\nИмя: ${name}\nТелефон: ${phone}\nГород: ${leadRecord.city}`;
      if (leadRecord.address) messengerText += `\nАдрес: ${leadRecord.address}`;
      if (leadRecord.product) messengerText += `\nМодель: ${leadRecord.product.name} (${leadRecord.product.id || ''})`;
      if (leadRecord.comment) messengerText += `\nКомментарий: ${leadRecord.comment}`;

      // Показываем уведомление
      showToastNotice(`Заявка №${ticketNumber} успешно принята! Наш инженер свяжется с вами.`);

      // Возвращаем результат
      return {
        success: true,
        ticketNumber,
        leadRecord,
        messengerText,
        whatsAppUrl: cfg.getWhatsAppUrl ? cfg.getWhatsAppUrl(messengerText) : '',
        telegramUrl: cfg.getTelegramUrl ? cfg.getTelegramUrl(messengerText) : ''
      };

    } catch (err) {
      console.error('Ошибка отправки заявки:', err);

      // Состояние кнопки: ERROR
      if (submitBtn) {
        submitBtn.classList.remove('btn-loading');
        submitBtn.classList.add('btn-lead-error');
        submitBtn.innerHTML = `<span>Ошибка отправки. Попробуйте снова</span>`;
        setTimeout(() => {
          submitBtn.classList.remove('btn-lead-error');
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
        }, 3200);
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // АНАЛИТИКА
  // --------------------------------------------------------------------------

  function logAnalyticsEvent(eventName, eventData = {}) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: eventName,
        ...eventData
      });

      // Если подключен счетчик Яндекс.Метрики
      if (typeof window.ym === 'function') {
        const counters = Object.keys(window).filter(k => k.startsWith('yaCounter'));
        if (counters.length > 0) {
          window[counters[0]].reachGoal(eventName, eventData);
        }
      }
    } catch (e) {
      console.warn('Analytics event error:', e);
    }
  }

  function showToastNotice(message) {
    let toast = document.getElementById('siteToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'siteToast';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span style="color: #4CAF50; font-weight: bold; margin-right: 6px;">✓</span> <span>${message}</span>`;
    toast.classList.add('show', 'visible');
    setTimeout(() => {
      toast.classList.remove('show', 'visible');
    }, 4500);
  }

  // --------------------------------------------------------------------------
  // МОДАЛЬНОЕ ОКНО ЗАЯВКИ (МОНТИРОВАНИЕ И УПРАВЛЕНИЕ)
  // --------------------------------------------------------------------------

  let currentBoundProduct = null;

  function openLeadModal(options = {}) {
    let modal = document.getElementById('leadModal');
    if (!modal) {
      createLeadModalMarkup();
      modal = document.getElementById('leadModal');
    }
    if (!modal) return;

    const source = typeof options === 'string' ? options : (options.source || 'Вызов замерщика');
    const product = typeof options === 'object' ? (options.product || null) : null;
    currentBoundProduct = product;

    // Сводка выбранного товара в шапке модалки
    const summaryBox = document.getElementById('leadProductSummary');
    if (summaryBox) {
      if (product) {
        const pName = product.name || product.model || 'Дверное полотно';
        const pId = product.id ? `арт. ${product.id}` : '';
        const pPrice = product.price ? `${Number(product.price).toLocaleString('ru-RU')} ₽` : '';
        const pThumb = product.thumb || product.image || '';

        summaryBox.style.display = 'flex';
        summaryBox.innerHTML = `
          <div class="lead-product-badge">
            ${pThumb ? `<img src="${pThumb}" alt="${pName}" class="lead-product-badge-img" onerror="this.style.display='none'">` : ''}
            <div class="lead-product-badge-info">
              <span class="lead-badge-kicker">Выбранная модель для расчёта:</span>
              <div class="lead-badge-title">${pName} <span class="lead-badge-art">${pId}</span></div>
              ${pPrice ? `<div class="lead-badge-price">${pPrice}</div>` : ''}
            </div>
          </div>
        `;
      } else {
        summaryBox.style.display = 'block';
        summaryBox.innerHTML = `
          <div class="lead-default-summary">
            <strong>Бесплатный выезд инженера-замерщика</strong>
            <p>Точный лазерный замер дверных проёмов, демонстрация каталогов покрытий и веера эмалей на объекте.</p>
          </div>
        `;
      }
    }

    const titleEl = document.getElementById('leadModalTitle');
    if (titleEl) {
      titleEl.textContent = product ? 'Заявка на расчет и замер' : 'Вызов инженера-замерщика';
    }

    // Очистка состояния валидации
    const phoneInput = document.getElementById('leadPhoneInput');
    if (phoneInput) {
      attachPhoneMask(phoneInput);
      phoneInput.classList.remove('input-error');
    }
    const nameInput = document.getElementById('leadNameInput');
    if (nameInput) nameInput.classList.remove('input-error');

    modal.dataset.leadSource = source;
    modal.classList.add('open', 'active');
    document.body.classList.add('modal-open');
  }

  function closeLeadModal() {
    const modal = document.getElementById('leadModal');
    if (modal) {
      modal.classList.remove('open', 'active');
      document.body.classList.remove('modal-open');
    }
  }

  function createLeadModalMarkup() {
    const html = `
      <div class="modal-overlay" id="leadModal" role="dialog" aria-modal="true" aria-labelledby="leadModalTitle">
        <div class="modal-window lead-modal-window">
          <button type="button" class="modal-close-btn" id="btnCloseLeadModal" aria-label="Закрыть">✕</button>

          <div class="lead-form-header">
            <h2 class="lead-form-title" id="leadModalTitle">Вызов инженера-замерщика</h2>
            <div class="lead-form-subtitle">Профессиональный лазерный замер проемов с образцами покрытий и каталогами фурнитуры</div>
          </div>

          <div class="lead-product-summary-box" id="leadProductSummary"></div>

          <form id="leadOrderForm" class="lead-form-fields" novalidate>
            <div class="form-group">
              <label for="leadNameInput" class="form-label">Ваше имя *</label>
              <input type="text" id="leadNameInput" class="form-input" placeholder="Константин" required>
            </div>

            <div class="form-group">
              <label for="leadPhoneInput" class="form-label">Телефон для связи *</label>
              <input type="tel" id="leadPhoneInput" class="form-input" placeholder="+7 (___) ___-__-__" required>
            </div>

            <div class="form-group">
              <label for="leadCitySelect" class="form-label">Город замера / доставки</label>
              <select id="leadCitySelect" class="form-select">
                <option value="Казань">Казань и пригород</option>
                <option value="Набережные Челны">Набережные Челны и Закамье</option>
              </select>
            </div>

            <div class="form-group">
              <label for="leadAddressInput" class="form-label">Адрес объекта (улица, дом)</label>
              <input type="text" id="leadAddressInput" class="form-input" placeholder="ул. Сибирский тракт, д. 59б">
            </div>

            <div class="form-group">
              <label for="leadCommentInput" class="form-label">Комментарий или число проемов</label>
              <textarea id="leadCommentInput" class="form-textarea" rows="2" placeholder="Например: 4 межкомнатные двери, удобнее замер в субботу"></textarea>
            </div>

            <button type="submit" class="btn-lead-submit" id="btnSubmitLeadForm">
              Отправить заявку мастеру-замерщику
            </button>

            <div class="lead-form-privacy">
              Нажимая кнопку, вы подтверждаете согласие на обработку персональных данных в соответствии с политикой конфиденциальности.
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    initLeadForms();
  }

  function initLeadForms() {
    const modal = document.getElementById('leadModal');
    if (!modal) return;

    const closeBtn = document.getElementById('btnCloseLeadModal');
    if (closeBtn) closeBtn.onclick = closeLeadModal;

    modal.onclick = (e) => {
      if (e.target === modal) closeLeadModal();
    };

    const phoneInput = document.getElementById('leadPhoneInput');
    if (phoneInput) attachPhoneMask(phoneInput);

    const form = document.getElementById('leadOrderForm');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();

        const nameInput = document.getElementById('leadNameInput');
        const citySelect = document.getElementById('leadCitySelect');
        const addressInput = document.getElementById('leadAddressInput');
        const commentInput = document.getElementById('leadCommentInput');
        const submitBtn = document.getElementById('btnSubmitLeadForm');

        const payload = {
          name: nameInput?.value,
          phone: phoneInput?.value,
          city: citySelect?.value || 'Казань',
          address: addressInput?.value,
          comment: commentInput?.value,
          source: modal.dataset.leadSource || 'Модалка замера',
          product: currentBoundProduct
        };

        try {
          const result = await submitLead(payload, {
            formEl: form,
            submitBtn,
            phoneInputEl: phoneInput,
            nameInputEl: nameInput
          });

          // Предлагаем быстрый переход в мессенджер при желании
          setTimeout(() => {
            closeLeadModal();
            // Возвращаем кнопку в исходное состояние
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.classList.remove('btn-lead-success');
              submitBtn.innerHTML = `Отправить заявку мастеру-замерщику`;
            }
            if (form) form.reset();
          }, 2400);

        } catch (err) {
          showToastNotice(err.message || 'Ошибка отправки формы');
        }
      };
    }
  }

  // --------------------------------------------------------------------------
  // ПЛАВАЮЩИЙ ВИДЖЕТ СВЯЗИ (FLOATING ACTION WIDGET)
  // --------------------------------------------------------------------------

  function initFloatingWidget() {
    if (document.getElementById('floatingContactWidget')) return;

    const cfg = window.DVER_CONFIG || {
      getWhatsAppUrl: () => 'https://wa.me/78432050001',
      getTelegramUrl: () => 'https://t.me/dver1_manager'
    };

    const widgetHtml = `
      <div class="floating-contact-widget" id="floatingContactWidget" aria-label="Быстрая связь">
        <div class="floating-widget-popover" id="floatingWidgetPopover" aria-hidden="true">
          <div class="floating-popover-header">
            <span>Быстрая связь со специалистом</span>
          </div>
          <div class="floating-popover-actions">
            <a href="${cfg.getWhatsAppUrl('Здравствуйте! Хочу проконсультироваться по выбору дверей.')}" target="_blank" rel="noopener" class="floating-action-item floating-action-wa" aria-label="Написать в WhatsApp">
              <span class="floating-action-icon wa-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.04 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.34C9.33 7.34 9 7.41 8.73 7.71C8.46 8.01 7.7 8.72 7.7 10.17C7.7 11.62 8.76 13.02 8.91 13.22C9.06 13.43 10.95 16.48 13.92 17.65C16.38 18.62 16.89 18.42 17.42 18.37C17.96 18.32 19.14 17.67 19.39 16.97C19.64 16.27 19.64 15.67 19.57 15.54C19.5 15.42 19.3 15.35 19 15.2C18.7 15.05 17.22 14.32 16.94 14.22C16.67 14.12 16.47 14.07 16.27 14.37C16.07 14.67 15.5 15.35 15.33 15.54C15.16 15.74 14.99 15.77 14.69 15.62C14.39 15.47 13.43 15.16 12.3 14.15C11.42 13.36 10.83 12.39 10.66 12.09C10.49 11.79 10.64 11.63 10.79 11.48C10.92 11.35 11.09 11.13 11.24 10.96C11.39 10.78 11.44 10.66 11.54 10.46C11.64 10.26 11.59 10.08 11.51 9.93C11.44 9.78 10.84 8.3 10.59 7.7C10.35 7.12 10.1 7.2 9.91 7.19C9.74 7.19 9.53 7.34 9.53 7.34Z"/>
                </svg>
              </span>
              <span class="floating-action-text">
                <strong>Написать в WhatsApp</strong>
                <small>Ответим за 5 минут</small>
              </span>
            </a>

            <a href="${cfg.getTelegramUrl('Здравствуйте! Хочу проконсультироваться по выбору дверей.')}" target="_blank" rel="noopener" class="floating-action-item floating-action-tg" aria-label="Написать в Telegram">
              <span class="floating-action-icon tg-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                </svg>
              </span>
              <span class="floating-action-text">
                <strong>Написать в Telegram</strong>
                <small>Дежурный консультант</small>
              </span>
            </a>

            <button type="button" class="floating-action-item floating-action-measure" id="btnFloatingMeasure" aria-label="Заказать бесплатный замер">
              <span class="floating-action-icon measure-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>
              </span>
              <span class="floating-action-text">
                <strong>Бесплатный замер</strong>
                <small>Выезд инженера с образцами</small>
              </span>
            </button>
          </div>
        </div>

        <button type="button" class="floating-widget-trigger" id="floatingWidgetTrigger" aria-label="Связаться с нами" aria-expanded="false">
          <span class="trigger-icon-chat" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </span>
          <span class="trigger-icon-close" aria-hidden="true">✕</span>
          <span class="floating-pulse-ring" aria-hidden="true"></span>
        </button>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', widgetHtml);

    const trigger = document.getElementById('floatingWidgetTrigger');
    const popover = document.getElementById('floatingWidgetPopover');
    const widget = document.getElementById('floatingContactWidget');

    if (trigger && popover && widget) {
      trigger.onclick = () => {
        const isOpen = widget.classList.toggle('active');
        trigger.setAttribute('aria-expanded', isOpen);
        popover.setAttribute('aria-hidden', !isOpen);
      };

      document.addEventListener('click', (e) => {
        if (!widget.contains(e.target) && widget.classList.contains('active')) {
          widget.classList.remove('active');
          trigger.setAttribute('aria-expanded', 'false');
          popover.setAttribute('aria-hidden', 'true');
        }
      });

      const btnMeasure = document.getElementById('btnFloatingMeasure');
      if (btnMeasure) {
        btnMeasure.onclick = () => {
          widget.classList.remove('active');
          openLeadModal({ source: 'Плавающая кнопка связи (Floating Widget)' });
        };
      }
    }
  }

  // --------------------------------------------------------------------------
  // АВТОИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ DOM
  // --------------------------------------------------------------------------

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initLeadForms();
      initFloatingWidget();
    });
  } else {
    initLeadForms();
    initFloatingWidget();
  }

  // Экспорт в глобальную область
  window.DverLeads = {
    submitLead,
    formatPhone,
    validatePhone,
    attachPhoneMask,
    openLeadModal,
    closeLeadModal,
    initLeadForms,
    initFloatingWidget,
    logAnalyticsEvent
  };
})();
