// ==========================================================================
// ДВЕРИ №1 — CART & CHECKOUT CONTROLLER (cart.js)
// Отрисовка корзины, пошаговое оформление заявки, SMS-верификация
// ==========================================================================

(function() {
  'use strict';

  // Состояние процесса оформления
  const checkoutState = {
    step: 1,
    client: {
      name: '',
      phone: '',
      city: 'Казань'
    },
    delivery: {
      type: 'pickup',
      installation: true,
      comment: ''
    },
    verifiedPhone: null,
    verifiedToken: null,
    timerSeconds: 60,
    timerInterval: null,
    isSubmitting: false
  };

  // --------------------------------------------------------------------------
  // 1. ИНИЦИАЛИЗАЦИЯ И РЕНДЕР КОРЗИНЫ
  // --------------------------------------------------------------------------

  function initCartPage() {
    // 1. Восстановление переданной по ссылке спецификации (?share=...)
    restoreSharedCart();

    // 2. Первоначальный рендер
    renderCart();

    // Слушаем события обновления корзины из любых источников
    window.addEventListener('dver1:cart-updated', () => {
      renderCart();
    });

    // Привязка кнопок выгрузки PDF и расшаривания подборки
    const btnShare = document.getElementById('btnShareCart');
    const btnPdf = document.getElementById('btnDownloadPdf');
    const btnSummaryPdf = document.getElementById('btnSummaryPdf');

    if (btnShare) btnShare.addEventListener('click', shareCart);
    if (btnPdf) btnPdf.addEventListener('click', generatePdfSpec);
    if (btnSummaryPdf) btnSummaryPdf.addEventListener('click', generatePdfSpec);

    // Привязка кнопок старта оформления
    const btnStart = document.getElementById('btnStartCheckout');
    const btnMobile = document.getElementById('btnMobileCheckout');
    if (btnStart) btnStart.addEventListener('click', openCheckoutModal);
    if (btnMobile) btnMobile.addEventListener('click', openCheckoutModal);

    // Модальное окно оформления
    const btnClose = document.getElementById('btnCloseCheckout');
    const overlay = document.getElementById('checkoutModal');
    if (btnClose) btnClose.addEventListener('click', closeCheckoutModal);
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCheckoutModal();
      });
    }

    // Кнопки навигации по шагам модалки
    const btnPrev = document.getElementById('btnCheckoutPrev');
    const btnNext = document.getElementById('btnCheckoutNext');
    if (btnPrev) btnPrev.addEventListener('click', handleStepPrev);
    if (btnNext) btnNext.addEventListener('click', handleStepNext);

    // Кнопка повторной отправки SMS
    const btnResend = document.getElementById('btnResendSms');
    if (btnResend) btnResend.addEventListener('click', handleResendSms);

    // Кнопка закрытия экрана успеха
    const btnFinish = document.getElementById('btnFinishSuccess');
    if (btnFinish) {
      btnFinish.addEventListener('click', () => {
        closeCheckoutModal();
        window.location.href = 'index.html#catalog';
      });
    }

    // Инициализация интерактивных контролов формы
    initFormControls();
    initMobileMenu();
  }

  function resolveCartImg(img) {
    if (!img) return 'door-placeholder.svg';
    if (img.startsWith('http://') || img.startsWith('https://')) return img;
    if (img.startsWith('data/catalog-output/thumbs/') || img.startsWith('data/catalog-output/webp/')) return img;
    if (img.startsWith('thumbs/') || img.startsWith('webp/')) return 'data/catalog-output/' + img;
    if (img.startsWith('catalog-images/')) {
      const base = img.replace(/^catalog-images\//, '').replace(/\.[^.]+$/, '');
      return 'data/catalog-output/thumbs/' + base + '.webp';
    }
    return img;
  }

  function renderCart() {
    const cart = window.CartStore.getCart();
    const totals = window.CartStore.calculateTotals(cart);

    const itemsContainer = document.getElementById('cartItemsContainer');
    const emptyView = document.getElementById('cartEmptyView');
    const contentGrid = document.getElementById('cartContentGrid');
    const mobileBar = document.getElementById('mobileCartStickyBar');
    const headerCount = document.getElementById('cartHeaderItemsCount');

    if (!itemsContainer) return;

    if (cart.length === 0) {
      if (emptyView) emptyView.style.display = 'block';
      if (contentGrid) contentGrid.style.display = 'none';
      if (mobileBar) mobileBar.style.display = 'none';
      if (headerCount) headerCount.textContent = '0 позиций';
      return;
    }

    if (emptyView) emptyView.style.display = 'none';
    if (contentGrid) contentGrid.style.display = 'grid';
    if (mobileBar) mobileBar.style.display = 'flex';
    if (headerCount) headerCount.textContent = `${totals.totalCount} ${pluralize(totals.totalCount, 'позиция', 'позиции', 'позиций')}`;

    // Отрисовка списка товаров
    let html = '';
    const standardRooms = (window.DVER_CONFIG && window.DVER_CONFIG.ROOMS) || [
      'Гостиная', 'Спальня', 'Санузел', 'Гардеробная', 'Входная группа', 'Кухня', 'Детская', 'Кабинет'
    ];

    cart.forEach(item => {
      const currentRoom = item.room || 'Гостиная';
      const isCustomRoom = !standardRooms.includes(currentRoom);

      let roomsOptionsHtml = '';
      standardRooms.forEach(rm => {
        const selected = (currentRoom === rm) ? 'selected' : '';
        roomsOptionsHtml += `<option value="${escapeHtml(rm)}" ${selected}>${escapeHtml(rm)}</option>`;
      });

      const currentOpening = item.opening || 'Уточнит замерщик';

      const priceDisplay = item.isPriceKnown && typeof item.unitPrice === 'number'
        ? `
          <div class="cart-item-price-val">${(item.unitPrice * item.quantity).toLocaleString('ru-RU')} ₽</div>
          <div class="cart-item-price-unit">${item.unitPrice.toLocaleString('ru-RU')} ₽ / ед.</div>
        `
        : `
          <div class="cart-item-price-uncertain">Цена уточняется</div>
          <div class="cart-item-price-unit">По спецификации проемов</div>
        `;

      const uncertainAlert = !item.isPriceKnown
        ? `<div class="cart-spec-uncertain-alert"><span>ℹ</span> Точная цена полотна и фурнитуры рассчитывается инженером</div>`
        : '';

      const resolvedImage = resolveCartImg(item.image);

      const kitPillClass = item.kitType === 'kit' ? 'pill-kit' : 'pill-leaf';
      const kitTitle = item.kitTypeTitle || (item.kitType === 'kit' ? 'Комплект «под ключ»' : 'Только полотно');

      html += `
        <article class="cart-item-card" data-id="${escapeHtml(item.id)}">
          <div class="cart-item-image-box">
            <img class="cart-item-img" src="${escapeHtml(resolvedImage)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.onerror=null; this.src='door-placeholder.svg';">
          </div>

          <div class="cart-item-info">
            <div>
              <div class="cart-item-brand-row">${escapeHtml(item.brand)}${item.collection ? ' • ' + escapeHtml(item.collection) : ''}</div>
              <h3 class="cart-item-title">
                <a href="product.html?id=${encodeURIComponent(item.productId)}">${escapeHtml(item.title)}</a>
              </h3>
              
              <div class="cart-item-specs-grid">
                <span class="cart-spec-pill"><strong>Цвет:</strong> ${escapeHtml(item.variant)}</span>
                <span class="cart-spec-pill"><strong>Размер:</strong> ${escapeHtml(item.size)}</span>
                <span class="cart-spec-pill ${kitPillClass}"><strong>Комплектация:</strong> ${escapeHtml(kitTitle)}</span>
                ${item.hardware ? `<span class="cart-spec-pill"><strong>Состав:</strong> ${escapeHtml(item.hardware)}</span>` : ''}
              </div>

              <!-- РАСПРЕДЕЛЕНИЕ ПО КОМНАТАМ И СТОРОНА ОТКРЫВАНИЯ (SPRINT 3) -->
              <div class="cart-item-custom-fields">
                <div class="cart-field-group">
                  <label class="cart-field-label">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    <span>Помещение:</span>
                  </label>
                  <div class="cart-room-combo">
                    <select class="cart-room-select" data-id="${escapeHtml(item.id)}">
                      ${roomsOptionsHtml}
                      <option value="__custom__" ${isCustomRoom ? 'selected' : ''}>+ Свой вариант...</option>
                    </select>
                    <input type="text" class="cart-room-custom-input" data-id="${escapeHtml(item.id)}" placeholder="Название комнаты" value="${isCustomRoom ? escapeHtml(currentRoom) : ''}" style="${isCustomRoom ? 'display: block;' : 'display: none;'}">
                  </div>
                </div>

                <div class="cart-field-group">
                  <label class="cart-field-label">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><circle cx="14" cy="12" r="1.5"/></svg>
                    <span>Открывание:</span>
                  </label>
                  <select class="cart-opening-select" data-id="${escapeHtml(item.id)}">
                    <option value="Левое" ${currentOpening === 'Левое' ? 'selected' : ''}>Левое</option>
                    <option value="Правое" ${currentOpening === 'Правое' ? 'selected' : ''}>Правое</option>
                    <option value="Уточнит замерщик" ${(currentOpening === 'Уточнит замерщик' || currentOpening === 'Универсальное') ? 'selected' : ''}>Уточнит замерщик</option>
                  </select>
                </div>
              </div>

              ${uncertainAlert}
            </div>

            <button type="button" class="btn-remove-item" data-remove-id="${escapeHtml(item.id)}">
              <span>✕</span>
              <span>Удалить из спецификации</span>
            </button>
          </div>

          <div class="cart-item-actions-box">
            <div class="cart-item-price-block">
              ${priceDisplay}
            </div>

            <div class="cart-stepper-wrap">
              <button type="button" class="cart-stepper-btn" data-step-id="${escapeHtml(item.id)}" data-delta="-1" aria-label="Уменьшить">-</button>
              <span class="cart-stepper-val">${item.quantity}</span>
              <button type="button" class="cart-stepper-btn" data-step-id="${escapeHtml(item.id)}" data-delta="1" aria-label="Увеличить">+</button>
            </div>
          </div>
        </article>
      `;
    });

    itemsContainer.innerHTML = html;

    // Слушатели смены комнаты
    itemsContainer.querySelectorAll('.cart-room-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const id = sel.getAttribute('data-id');
        const customInput = itemsContainer.querySelector(`.cart-room-custom-input[data-id="${id}"]`);
        if (sel.value === '__custom__') {
          if (customInput) {
            customInput.style.display = 'block';
            customInput.focus();
          }
        } else {
          if (customInput) customInput.style.display = 'none';
          window.CartStore.updateItem(id, { room: sel.value });
        }
      });
    });

    // Слушатели кастомного ввода комнаты
    itemsContainer.querySelectorAll('.cart-room-custom-input').forEach(input => {
      input.addEventListener('input', () => {
        const id = input.getAttribute('data-id');
        const val = input.value.trim() || 'Помещение';
        window.CartStore.updateItem(id, { room: val });
      });
    });

    // Слушатели смены стороны открывания
    itemsContainer.querySelectorAll('.cart-opening-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const id = sel.getAttribute('data-id');
        window.CartStore.updateItem(id, { opening: sel.value });
      });
    });

    // Навешивание событий удаления и степпера
    itemsContainer.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-remove-id');
        window.CartStore.removeItem(id);
      });
    });

    itemsContainer.querySelectorAll('.cart-stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-step-id');
        const delta = parseInt(btn.getAttribute('data-delta'), 10) || 0;
        window.CartStore.updateQuantity(id, delta);
      });
    });

    // Отрисовка сводки заказа справа
    const summaryUnits = document.getElementById('summaryTotalUnits');
    const summaryKnown = document.getElementById('summaryKnownPrice');
    const summaryUncertainRow = document.getElementById('summaryUncertainRow');
    const summaryUncertainCount = document.getElementById('summaryUncertainCount');
    const summaryTotal = document.getElementById('summaryFinalTotal');
    const mobileStickyTotal = document.getElementById('mobileStickyTotal');

    if (summaryUnits) summaryUnits.textContent = `${totals.totalCount} шт.`;
    if (summaryKnown) summaryKnown.textContent = `${totals.knownItemsTotal.toLocaleString('ru-RU')} ₽`;

    if (summaryUncertainRow && summaryUncertainCount) {
      if (totals.hasUncertainPrices) {
        summaryUncertainRow.style.display = 'flex';
        summaryUncertainCount.textContent = `${totals.uncertainCount} шт. (по расчету фабрики)`;
      } else {
        summaryUncertainRow.style.display = 'none';
      }
    }

    const totalText = totals.knownItemsTotal > 0
      ? `${totals.knownItemsTotal.toLocaleString('ru-RU')} ₽${totals.hasUncertainPrices ? ' *' : ''}`
      : 'По индивидуальной смете';

    if (summaryTotal) summaryTotal.textContent = totalText;
    if (mobileStickyTotal) mobileStickyTotal.textContent = totalText;
  }

  // --------------------------------------------------------------------------
  // 2. ПОШАГОВЫЙ ПРОЦЕСС ОФОРМЛЕНИЯ ЗАЯВКИ
  // --------------------------------------------------------------------------

  function openCheckoutModal() {
    const cart = window.CartStore.getCart();
    if (cart.length === 0) {
      alert('Корзина пуста. Добавьте двери в спецификацию перед оформлением.');
      return;
    }

    // Если телефон уже верифицирован в сессии
    const auth = window.CartStore.getAuth();
    if (auth && auth.token && auth.phone) {
      checkoutState.verifiedPhone = auth.phone;
      checkoutState.verifiedToken = auth.token;
      checkoutState.client.phone = auth.phone;
      const phoneInput = document.getElementById('clientPhone');
      if (phoneInput) phoneInput.value = auth.phone;
    }

    setCheckoutStep(1);
    const modal = document.getElementById('checkoutModal');
    if (modal) modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCheckoutModal() {
    const modal = document.getElementById('checkoutModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    clearInterval(checkoutState.timerInterval);
  }

  function setCheckoutStep(stepNumber) {
    checkoutState.step = stepNumber;

    // Обновление индикатора шагов
    const tracker = document.getElementById('checkoutTracker');
    if (tracker) {
      tracker.querySelectorAll('.checkout-step-tab').forEach(tab => {
        const s = parseInt(tab.getAttribute('data-step'), 10);
        tab.classList.remove('active', 'completed');
        if (s === stepNumber) {
          tab.classList.add('active');
        } else if (s < stepNumber) {
          tab.classList.add('completed');
        }
      });
    }

    // Переключение видимости вкладок
    document.querySelectorAll('.checkout-step-pane').forEach(pane => {
      pane.classList.remove('active');
    });

    const activePane = document.getElementById(`checkoutStep${stepNumber}`);
    if (activePane) activePane.classList.add('active');

    // Кнопки Назад / Далее
    const btnPrev = document.getElementById('btnCheckoutPrev');
    const btnNext = document.getElementById('btnCheckoutNext');
    const footer = document.getElementById('checkoutFooter');

    if (footer) footer.style.display = (stepNumber === 'success') ? 'none' : 'flex';

    if (btnPrev) {
      btnPrev.style.visibility = (stepNumber > 1 && stepNumber !== 'success') ? 'visible' : 'hidden';
    }

    if (btnNext) {
      if (stepNumber === 1) {
        btnNext.innerHTML = '<span>Получить SMS-код</span> <span>→</span>';
      } else if (stepNumber === 2) {
        btnNext.innerHTML = '<span>Подтвердить телефон</span> <span>→</span>';
      } else if (stepNumber === 3) {
        btnNext.innerHTML = '<span>К подтверждению</span> <span>→</span>';
      } else if (stepNumber === 4) {
        btnNext.innerHTML = '<span>Отправить заявку</span> <span>✓</span>';
      }
    }
  }

  function handleStepPrev() {
    if (checkoutState.step > 1) {
      // Если возвращаемся со 2 шага, останавливаем таймер
      if (checkoutState.step === 2) clearInterval(checkoutState.timerInterval);
      setCheckoutStep(checkoutState.step - 1);
    }
  }

  async function handleStepNext() {
    if (checkoutState.isSubmitting) return;

    // ШАГ 1 -> ШАГ 2: Валидация контактов и запрос SMS
    if (checkoutState.step === 1) {
      const nameInput = document.getElementById('clientName');
      const phoneInput = document.getElementById('clientPhone');

      const name = nameInput ? nameInput.value.trim() : '';
      const phone = phoneInput ? phoneInput.value.trim() : '';

      if (!name) {
        alert('Пожалуйста, укажите ваше имя.');
        if (nameInput) nameInput.focus();
        return;
      }

      const digits = phone.replace(/\D/g, '');
      if (digits.length < 11) {
        alert('Пожалуйста, укажите полный номер телефона РФ.');
        if (phoneInput) phoneInput.focus();
        return;
      }

      checkoutState.client.name = name;
      checkoutState.client.phone = phone;

      // Если номер уже был подтверждён в текущей сессии с валидным токеном
      if (checkoutState.verifiedToken && checkoutState.verifiedPhone === phone) {
        setCheckoutStep(3);
        return;
      }

      await requestSmsCode(phone);
      return;
    }

    // ШАГ 2 -> ШАГ 3: Проверка введенного SMS-кода
    if (checkoutState.step === 2) {
      const d1 = document.getElementById('smsDigit1')?.value || '';
      const d2 = document.getElementById('smsDigit2')?.value || '';
      const d3 = document.getElementById('smsDigit3')?.value || '';
      const d4 = document.getElementById('smsDigit4')?.value || '';
      const code = `${d1}${d2}${d3}${d4}`.trim();

      if (code.length !== 4) {
        showSmsError('Введите все 4 цифры проверочного кода.');
        return;
      }

      await verifySmsCode(checkoutState.client.phone, code);
      return;
    }

    // ШАГ 3 -> ШАГ 4: Сохранение опций доставки и переход к подтверждению
    if (checkoutState.step === 3) {
      const chk = document.getElementById('chkInstallation');
      const comment = document.getElementById('clientComment');

      checkoutState.delivery.installation = chk ? chk.checked : true;
      checkoutState.delivery.comment = comment ? comment.value.trim() : '';

      prepareConfirmationStep();
      setCheckoutStep(4);
      return;
    }

    // ШАГ 4 -> ОТПРАВКА ЗАЯВКИ НА СЕРВЕР
    if (checkoutState.step === 4) {
      await submitOrderToServer();
    }
  }

  // --------------------------------------------------------------------------
  // 3. SMS ВЕРИФИКАЦИЯ
  // --------------------------------------------------------------------------

  async function requestSmsCode(phone) {
    const btnNext = document.getElementById('btnCheckoutNext');
    if (btnNext) {
      btnNext.disabled = true;
      btnNext.innerHTML = '<span>Отправка SMS...</span>';
    }

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Не удалось отправить проверочный код. Попробуйте позже.');
        if (btnNext) {
          btnNext.disabled = false;
          btnNext.innerHTML = '<span>Получить SMS-код</span> <span>→</span>';
        }
        return;
      }

      // Успешно отправлено
      const phoneDisplay = document.getElementById('smsTargetPhoneDisplay');
      if (phoneDisplay) phoneDisplay.textContent = phone;

      hideSmsError();
      clearSmsInputs();
      startSmsCountdown(data.retryAfter || 60);

      setCheckoutStep(2);

      // Автофокус на первую цифру
      setTimeout(() => {
        document.getElementById('smsDigit1')?.focus();
      }, 300);

    } catch (err) {
      alert('Ошибка соединения с сервером при отправке SMS. Проверьте подключение к сети.');
    } finally {
      if (btnNext) btnNext.disabled = false;
    }
  }

  async function verifySmsCode(phone, code) {
    const btnNext = document.getElementById('btnCheckoutNext');
    if (btnNext) {
      btnNext.disabled = true;
      btnNext.innerHTML = '<span>Проверка кода...</span>';
    }

    try {
      const guestCart = window.CartStore.getCart();
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, guestCart })
      });
      const data = await res.json();

      if (!res.ok) {
        showSmsError(data.error || 'Неверный код подтверждения.');
        if (btnNext) {
          btnNext.disabled = false;
          btnNext.innerHTML = '<span>Подтвердить телефон</span> <span>→</span>';
        }
        return;
      }

      // Телефон успешно подтверждён
      clearInterval(checkoutState.timerInterval);
      checkoutState.verifiedPhone = phone;
      checkoutState.verifiedToken = data.token;

      // Сохраняем сессию и синхронизируем объединённую корзину
      window.CartStore.setAuth({ token: data.token, phone: phone });
      if (data.cart && Array.isArray(data.cart)) {
        window.CartStore.setCart(data.cart);
      }

      setCheckoutStep(3);

    } catch (err) {
      showSmsError('Сбой сети при проверке кода. Пожалуйста, повторите попытку.');
    } finally {
      if (btnNext) btnNext.disabled = false;
    }
  }

  async function handleResendSms() {
    if (checkoutState.client.phone) {
      await requestSmsCode(checkoutState.client.phone);
    }
  }

  function startSmsCountdown(seconds = 60) {
    clearInterval(checkoutState.timerInterval);
    checkoutState.timerSeconds = seconds;

    const timerEl = document.getElementById('smsTimerSeconds');
    const noteEl = document.getElementById('smsCountdownNote');
    const resendBtn = document.getElementById('btnResendSms');

    if (timerEl) timerEl.textContent = checkoutState.timerSeconds;
    if (noteEl) noteEl.style.display = 'block';
    if (resendBtn) resendBtn.disabled = true;

    checkoutState.timerInterval = setInterval(() => {
      checkoutState.timerSeconds -= 1;
      if (timerEl) timerEl.textContent = checkoutState.timerSeconds;

      if (checkoutState.timerSeconds <= 0) {
        clearInterval(checkoutState.timerInterval);
        if (noteEl) noteEl.style.display = 'none';
        if (resendBtn) resendBtn.disabled = false;
      }
    }, 1000);
  }

  function showSmsError(msg) {
    const banner = document.getElementById('smsErrorBanner');
    if (banner) {
      banner.textContent = msg;
      banner.style.display = 'block';
    }
  }

  function hideSmsError() {
    const banner = document.getElementById('smsErrorBanner');
    if (banner) banner.style.display = 'none';
  }

  function clearSmsInputs() {
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById(`smsDigit${i}`);
      if (el) el.value = '';
    }
  }

  // --------------------------------------------------------------------------
  // 4. СБОРКА И ОТПРАВКА ЗАКАЗА НА СЕРВЕР
  // --------------------------------------------------------------------------

  function prepareConfirmationStep() {
    const cName = document.getElementById('confirmClientName');
    const cPhone = document.getElementById('confirmClientPhone');
    const cCity = document.getElementById('confirmCityDelivery');
    const cInst = document.getElementById('confirmInstallation');
    const miniList = document.getElementById('confirmMiniList');
    const totalSum = document.getElementById('confirmTotalSum');

    if (cName) cName.textContent = checkoutState.client.name;
    if (cPhone) cPhone.textContent = checkoutState.client.phone;
    if (cCity) {
      const delText = checkoutState.delivery.type === 'delivery' ? 'Адресная доставка' : 'Самовывоз из салона';
      cCity.textContent = `${checkoutState.client.city} • ${delText}`;
    }
    if (cInst) {
      cInst.textContent = checkoutState.delivery.installation ? 'Требуется профессиональный монтаж' : 'Без монтажа';
    }

    const cart = window.CartStore.getCart();
    const totals = window.CartStore.calculateTotals(cart);

    if (miniList) {
      miniList.innerHTML = cart.map(it => `
        <div class="confirm-mini-item">
          <span class="confirm-mini-title">${it.quantity} × ${escapeHtml(it.title)} (${escapeHtml(it.variant)}, ${escapeHtml(it.size)})</span>
          <span class="confirm-mini-price">${it.isPriceKnown && typeof it.unitPrice === 'number' ? (it.unitPrice * it.quantity).toLocaleString('ru-RU') + ' ₽' : 'Уточняется'}</span>
        </div>
      `).join('');
    }

    if (totalSum) {
      totalSum.textContent = totals.knownItemsTotal > 0
        ? `${totals.knownItemsTotal.toLocaleString('ru-RU')} ₽${totals.hasUncertainPrices ? ' *' : ''}`
        : 'По согласованию';
    }
  }

  async function submitOrderToServer() {
    const btnNext = document.getElementById('btnCheckoutNext');
    checkoutState.isSubmitting = true;

    if (btnNext) {
      btnNext.disabled = true;
      btnNext.innerHTML = '<span>Фиксация заявки в системе...</span>';
    }

    try {
      const cart = window.CartStore.getCart();
      const idempotencyKey = `idemp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const orderPayload = {
        token: checkoutState.verifiedToken,
        idempotencyKey: idempotencyKey,
        client: {
          name: checkoutState.client.name,
          phone: checkoutState.client.phone,
          city: checkoutState.client.city
        },
        delivery: {
          type: checkoutState.delivery.type,
          installation: checkoutState.delivery.installation,
          comment: checkoutState.delivery.comment
        },
        items: cart
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Ошибка при сохранении заявки на сервере. Пожалуйста, повторите.');
        if (btnNext) {
          btnNext.disabled = false;
          btnNext.innerHTML = '<span>Отправить заявку</span> <span>✓</span>';
        }
        checkoutState.isSubmitting = false;
        return;
      }

      // УСПЕХ!
      const orderId = data.orderId || (data.order && data.order.id) || 'D1-2026';
      
      // Очищаем корзину клиента
      window.CartStore.clearCart();

      // Отображаем экран успеха
      const badge = document.getElementById('successOrderNumberBadge');
      if (badge) badge.textContent = `Номер заявки: #${orderId}`;

      document.querySelectorAll('.checkout-step-pane').forEach(p => p.classList.remove('active'));
      const successPane = document.getElementById('checkoutStepSuccess');
      if (successPane) successPane.classList.add('active');

      const footer = document.getElementById('checkoutFooter');
      if (footer) footer.style.display = 'none';

      const tracker = document.getElementById('checkoutTracker');
      if (tracker) tracker.style.display = 'none';

    } catch (err) {
      alert('Сетевая ошибка при отправке заявки. Проверьте интернет-соединение.');
      if (btnNext) {
        btnNext.disabled = false;
        btnNext.innerHTML = '<span>Отправить заявку</span> <span>✓</span>';
      }
    } finally {
      checkoutState.isSubmitting = false;
    }
  }

  // --------------------------------------------------------------------------
  // 5. ИНТЕРАКТИВНЫЕ КОНТРОЛЫ И МАСКИ
  // --------------------------------------------------------------------------

  function initFormControls() {
    // Селектор города
    document.querySelectorAll('.city-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.city-select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        checkoutState.client.city = btn.getAttribute('data-city');
      });
    });

    // Способ доставки
    document.querySelectorAll('.delivery-card-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.delivery-card-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        checkoutState.delivery.type = btn.getAttribute('data-delivery');
      });
    });

    // Телефонная маска (+7 (XXX) XXX-XX-XX)
    const phoneInput = document.getElementById('clientPhone');
    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        phoneInput.value = formatRussianPhone(e.target.value);
      });
    }

    // Автоматический переход между 4 цифрами SMS
    for (let i = 1; i <= 4; i++) {
      const box = document.getElementById(`smsDigit${i}`);
      if (!box) continue;

      box.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val ? val[0] : '';
        if (val && i < 4) {
          document.getElementById(`smsDigit${i + 1}`)?.focus();
        }
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && i > 1) {
          document.getElementById(`smsDigit${i - 1}`)?.focus();
        }
      });

      // Поддержка вставки (Paste) 4 цифр целиком
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        if (pasted) {
          for (let k = 0; k < 4 && k < pasted.length; k++) {
            const digitInput = document.getElementById(`smsDigit${k + 1}`);
            if (digitInput) digitInput.value = pasted[k];
          }
          document.getElementById('smsDigit4')?.focus();
        }
      });
    }

    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCheckoutModal();
    });
  }

  function formatRussianPhone(value) {
    const digits = value.replace(/\D/g, '');
    let res = '+7 ';
    let clean = digits;
    if (digits.startsWith('7') || digits.startsWith('8')) {
      clean = digits.slice(1);
    }
    if (!clean) return '+7 ';

    if (clean.length > 0) res += '(' + clean.substring(0, 3);
    if (clean.length >= 3) res += ') ';
    if (clean.length > 3) res += clean.substring(3, 6);
    if (clean.length >= 6) res += '-';
    if (clean.length > 6) res += clean.substring(6, 8);
    if (clean.length >= 8) res += '-';
    if (clean.length > 8) res += clean.substring(8, 10);

    return res;
  }

  function initMobileMenu() {
    const btn = document.getElementById('mobileMenuBtn');
    const overlay = document.getElementById('mobileMenuOverlay');
    const panel = document.getElementById('mobileMenuPanel');

    if (btn && panel && overlay) {
      btn.addEventListener('click', () => {
        const isOpen = panel.classList.contains('open');
        if (isOpen) {
          panel.classList.remove('open');
          overlay.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
        } else {
          panel.classList.add('open');
          overlay.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });

      overlay.addEventListener('click', () => {
        panel.classList.remove('open');
        overlay.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
    }
  }

  // --------------------------------------------------------------------------
  // SPRINT 3: ШЕРИНГ ПОДБОРКИ, PDF СМЕТА И УВЕДОМЛЕНИЯ
  // --------------------------------------------------------------------------

  function showToast(msg) {
    let toast = document.getElementById('siteToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'siteToast';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  // 1. Поделиться подборкой (Сериализация корзины в URL)
  function shareCart() {
    const cart = window.CartStore.getCart();
    if (!cart || cart.length === 0) {
      showToast('Спецификация пуста — добавьте двери для создания ссылки');
      return;
    }

    const payload = cart.map(it => ({
      id: it.productId,
      t: it.title || it.model,
      b: it.brand,
      v: it.variant,
      s: it.size,
      o: it.opening,
      r: it.room,
      k: it.kitType,
      opt: it.kitOptions || [],
      q: it.quantity,
      p: it.unitPrice,
      img: it.image
    }));

    try {
      const jsonStr = JSON.stringify(payload);
      const b64 = btoa(encodeURIComponent(jsonStr));
      const url = `${window.location.origin}${window.location.pathname}?share=${b64}`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          showToast('✓ Ссылка на подборку скопирована');
        }).catch(() => {
          prompt('Скопируйте ссылку на спецификацию:', url);
        });
      } else {
        prompt('Скопируйте ссылку на спецификацию:', url);
      }
    } catch (e) {
      console.error('Ошибка создания ссылки:', e);
      showToast('Не удалось сформировать ссылку');
    }
  }

  // 2. Восстановление подборки из ?share=...
  function restoreSharedCart() {
    const params = new URLSearchParams(window.location.search);
    const shareParam = params.get('share');
    if (!shareParam) return;

    try {
      const decodedJson = decodeURIComponent(atob(shareParam));
      const items = JSON.parse(decodedJson);
      if (Array.isArray(items) && items.length > 0) {
        const restored = items.map(it => {
          const isPriceKnown = typeof it.p === 'number' && it.p > 0;
          const kitType = it.k || 'kit';
          const kitTypeTitle = kitType === 'kit' ? 'Комплект «под ключ»' : 'Только полотно';
          const optList = Array.isArray(it.opt) ? it.opt : [];
          return {
            id: `${it.id}-${it.v}-${it.s}-${kitType}-${optList.length}-${it.o || 'uni'}`,
            productId: it.id,
            title: it.t || 'Модель двери',
            brand: it.b || 'Двери №1',
            variant: it.v || 'Базовое покрытие',
            size: it.s || '800 × 2000 мм',
            opening: it.o || 'Уточнит замерщик',
            room: it.r || 'Гостиная',
            kitType: kitType,
            kitTypeTitle: kitTypeTitle,
            kitOptions: optList,
            scenario: kitType === 'kit' ? 'standard_kit_with_hardware' : 'leaf_only',
            scenarioTitle: kitTypeTitle,
            hardware: optList.length > 0 ? optList.join(', ') : (kitType === 'kit' ? 'Базовый комплект' : 'Без фурнитуры'),
            quantity: Math.max(1, parseInt(it.q, 10) || 1),
            unitPrice: isPriceKnown ? it.p : null,
            isPriceKnown: isPriceKnown,
            image: it.img || 'door-placeholder.svg'
          };
        });

        window.CartStore.setCart(restored);
        showToast('✓ Спецификация успешно загружена по ссылке');

        // Очищаем параметр из адресной строки без перезагрузки
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (e) {
      console.error('Ошибка восстановления подборки:', e);
    }
  }

  // 3. Генерация печатной сметы PDF
  function generatePdfSpec() {
    const cart = window.CartStore.getCart();
    if (!cart || cart.length === 0) {
      showToast('Корзина пуста — добавьте двери для выгрузки сметы');
      return;
    }

    const printContainer = document.getElementById('printablePdfSpec');
    if (!printContainer) return;

    const totals = window.CartStore.calculateTotals(cart);
    const dateStr = new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    let rowsHtml = '';
    cart.forEach((it, idx) => {
      const rowSum = (it.isPriceKnown && typeof it.unitPrice === 'number')
        ? `${(it.unitPrice * it.quantity).toLocaleString('ru-RU')} ₽`
        : 'По запросу';
      const unitPriceStr = (it.isPriceKnown && typeof it.unitPrice === 'number')
        ? `${it.unitPrice.toLocaleString('ru-RU')} ₽`
        : 'По запросу';
      const imgPath = resolveCartImg(it.image);

      rowsHtml += `
        <tr>
          <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
          <td style="text-align: center; width: 60px;">
            <img src="${escapeHtml(imgPath)}" style="width: 44px; height: 60px; object-fit: contain;" alt="">
          </td>
          <td>
            <strong>${escapeHtml(it.brand)} • ${escapeHtml(it.title)}</strong><br>
            <small style="color: #666;">Цвет: ${escapeHtml(it.variant)} | Размер: ${escapeHtml(it.size)}</small>
          </td>
          <td><strong>${escapeHtml(it.room || 'Гостиная')}</strong></td>
          <td>${escapeHtml(it.opening || 'Уточнит замерщик')}</td>
          <td>
            <small><strong>${escapeHtml(it.kitTypeTitle || (it.kitType === 'kit' ? 'Комплект «под ключ»' : 'Только полотно'))}</strong></small><br>
            <small style="color: #555;">${escapeHtml(it.hardware || '')}</small>
          </td>
          <td style="text-align: center; font-weight: 600;">${it.quantity} шт.</td>
          <td style="text-align: right; white-space: nowrap;">${unitPriceStr}</td>
          <td style="text-align: right; font-weight: 700; white-space: nowrap;">${rowSum}</td>
        </tr>
      `;
    });

    printContainer.innerHTML = `
      <div class="print-doc-header">
        <div class="print-header-top">
          <div class="print-logo-box">
            <img src="logo.png" alt="Двери №1" class="print-logo-img">
            <div class="print-tagline">ПРЕМИАЛЬНЫЕ ШОУРУМЫ ДВЕРЕЙ И ИНЖЕНЕРНЫХ СИСТЕМ</div>
          </div>
          <div class="print-meta-box">
            <div class="print-doc-number">СПЕЦИФИКАЦИЯ-СМЕТА № DVER-${Date.now().toString().slice(-6)}</div>
            <div class="print-doc-date">Дата формирования: ${dateStr}</div>
          </div>
        </div>
        <div class="print-contacts-bar">
          <span><strong>Казань:</strong> ул. Сибирский тракт, 59б</span>
          <span><strong>Челны:</strong> Казанский пр-т, 232</span>
          <span><strong>Единый телефон:</strong> +7 (843) 205-00-01</span>
          <span><strong>Сайт:</strong> dver1.ru</span>
        </div>
      </div>

      <table class="print-spec-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Фото</th>
            <th>Модель и отделка</th>
            <th>Помещение</th>
            <th>Открывание</th>
            <th>Комплектация</th>
            <th>Кол-во</th>
            <th>Цена / ед.</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="6" style="text-align: right; font-weight: 700;">ИТОГО ПО СПЕЦИФИКАЦИИ:</td>
            <td style="text-align: center; font-weight: 700;">${totals.totalCount} шт.</td>
            <td></td>
            <td style="text-align: right; font-weight: 800; font-size: 1.1em; color: #111;">
              ${totals.knownItemsTotal.toLocaleString('ru-RU')} ₽
            </td>
          </tr>
        </tfoot>
      </table>

      <div class="print-footer-notes">
        <p><strong>Примечание:</strong> Предварительная спецификация сформирована в шоуруме «Двери №1». Окончательная комплектация, толщина телескопических доборов и присадка замков верифицируются инженером-замерщиком при выезде на объект с лазерным измерительным комплексом.</p>
        <div class="print-signature-row">
          <div>Заказчик: _______________________ / __________________</div>
          <div>Инженер-куратор: _______________________ / __________________</div>
        </div>
      </div>
    `;

    window.print();
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

  function pluralize(n, one, two, five) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 19) return five;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return two;
    return five;
  }

  // Запуск при загрузке документа
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCartPage);
  } else {
    initCartPage();
  }
})();
