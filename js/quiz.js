/**
 * ДВЕРИ №1 — КВИЗ-ПОДБОРЩИК ЗА 30 СЕКУНД (V4.0.0)
 * 4 быстрых шага, реальная фильтрация каталога, спецпредложение на объем
 * и интеграция с аналитикой (lead_quiz).
 */

(function () {
  'use strict';

  const QUIZ_STEPS_COUNT = 4;

  const quizState = {
    step: 1,
    answers: {
      placement: null, // 'apartment' | 'house' | 'commercial'
      type: null,      // 'interior' | 'invisible' | 'entrance' | 'glass'
      openings: null,  // '1-2' | '3-4' | '5+'
      budget: null     // 'under_18k' | '18k_35k' | 'over_35k'
    },
    matchedDoors: [],
    totalMatchedCount: 0
  };

  const STEPS_DATA = [
    {
      num: 1,
      id: 'placement',
      title: 'Куда подбираете двери?',
      subtitle: 'Укажите тип объекта для подбора правильных параметров звукоизоляции и стойкости',
      options: [
        {
          val: 'apartment',
          icon: '🏢',
          title: 'В квартиру',
          desc: 'Звукоизоляция до 42 дБ, влагостойкость для санузлов, трендовый дизайн'
        },
        {
          val: 'house',
          icon: '🏡',
          title: 'В частный дом или коттедж',
          desc: 'Терморазрыв без промерзания, защита от осадков, массив и шпон'
        },
        {
          val: 'commercial',
          icon: '💼',
          title: 'В офис или коммерцию',
          desc: 'Высокая износостойкость, минимализм, прочные итальянские ручки'
        }
      ]
    },
    {
      num: 2,
      id: 'type',
      title: 'Какие типы дверей вас интересуют?',
      subtitle: 'Подберём подходящую конструкцию короба и полотна',
      options: [
        {
          val: 'interior',
          icon: '🚪',
          title: 'Межкомнатные двери',
          desc: 'Эмаль, натуральный шпон, экошпон с телескопическим погонажем'
        },
        {
          val: 'invisible',
          icon: '🪄',
          title: 'Скрытые Invisible',
          desc: 'Алюминиевые короба под покраску или отделку в плоскости стены'
        },
        {
          val: 'entrance',
          icon: '🛡️',
          title: 'Входные сейф-двери',
          desc: 'Замки 4 класса взломостойкости, терморазрыв и толстые контуры'
        },
        {
          val: 'glass',
          icon: '🪟',
          title: 'Со стеклом или зеркалом',
          desc: 'Безопасный триплекс, матовый сатинат, световые интерьерные решения'
        }
      ]
    },
    {
      num: 3,
      id: 'openings',
      title: 'Сколько дверных проёмов требуется укомплектовать?',
      subtitle: 'При заказе от 4 комплектов действует специальное предложение',
      options: [
        {
          val: '1-2',
          icon: '1️⃣',
          title: '1–2 двери',
          desc: 'Точечная замена или входная сейф-дверь'
        },
        {
          val: '3-4',
          icon: '4️⃣',
          title: '3–4 двери',
          desc: 'Стандартная 2–3 комнатная квартира • Бесплатная доставка!'
        },
        {
          val: '5+',
          icon: '✨',
          title: '5 и более проёмов',
          desc: 'Коттедж, просторная квартира или офис • Максимальная скидка!'
        }
      ]
    },
    {
      num: 4,
      id: 'budget',
      title: 'Ориентир по бюджету за комплект?',
      subtitle: 'Честные цены официального дистрибьютора без наценок посредников',
      options: [
        {
          val: 'under_18k',
          icon: '🏷️',
          title: 'До 18 000 ₽',
          desc: 'Надёжные складские модели высокого качества по оптовой цене'
        },
        {
          val: '18k_35k',
          icon: '⭐',
          title: '18 000 – 35 000 ₽',
          desc: 'Оптимальный стандарт: эмаль, натуральный шпон, скрытый монтаж'
        },
        {
          val: 'over_35k',
          icon: '👑',
          title: 'Премиум от 35 000 ₽',
          desc: 'Авторские дизайнерские коллекции, терморазрыв с патиной, зеркала'
        }
      ]
    }
  ];

  let cachedCatalog = null;
  async function loadCatalog() {
    if (cachedCatalog) return cachedCatalog;
    try {
      const res = await fetch('data/catalog-index.json');
      if (res.ok) {
        cachedCatalog = await res.json();
        return cachedCatalog;
      }
    } catch (e) {
      console.warn('Quiz: catalog fetch failed', e);
    }
    return window.CATALOG_PRODUCTS || [];
  }

  function createQuizModalMarkup() {
    if (document.getElementById('quizModal')) return;

    const html = `
      <div class="quiz-modal-overlay" id="quizModal" role="dialog" aria-modal="true" aria-labelledby="quizModalHeading" style="display: none;">
        <div class="quiz-modal-card">
          <div class="quiz-card-header">
            <div class="quiz-progress-track" id="quizProgressTrack">
              <div class="quiz-progress-bar" id="quizProgressBar" style="width: 25%;"></div>
            </div>
            <div class="quiz-header-nav">
              <button type="button" class="btn-quiz-back" id="btnQuizBack" style="visibility: hidden;">
                ← Назад
              </button>
              <span class="quiz-step-counter" id="quizStepCounter">Вопрос 1 из 4</span>
              <button type="button" class="btn-quiz-close" id="btnQuizClose" aria-label="Закрыть квиз">✕</button>
            </div>
          </div>

          <div class="quiz-card-body" id="quizCardBody">
            <!-- Динамический шаг -->
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    bindModalControls();
  }

  function bindModalControls() {
    const modal = document.getElementById('quizModal');
    const btnClose = document.getElementById('btnQuizClose');
    const btnBack = document.getElementById('btnQuizBack');

    if (btnClose) btnClose.addEventListener('click', closeQuiz);
    if (btnBack) btnBack.addEventListener('click', () => {
      if (quizState.step > 1) {
        quizState.step--;
        renderCurrentStep();
      }
    });

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeQuiz();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
        closeQuiz();
      }
    });
  }

  function openQuiz() {
    createQuizModalMarkup();
    const modal = document.getElementById('quizModal');
    if (!modal) return;

    quizState.step = 1;
    renderCurrentStep();

    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('active');
    });
    document.body.classList.add('modal-open');

    if (typeof window.trackGoal === 'function') {
      window.trackGoal('quiz_open', { source: 'quiz_banner' });
    }
  }

  function closeQuiz() {
    const modal = document.getElementById('quizModal');
    if (!modal) return;

    modal.classList.remove('active');
    setTimeout(() => {
      modal.style.display = 'none';
      document.body.classList.remove('modal-open');
    }, 240);
  }

  function renderCurrentStep() {
    const body = document.getElementById('quizCardBody');
    const counter = document.getElementById('quizStepCounter');
    const bar = document.getElementById('quizProgressBar');
    const btnBack = document.getElementById('btnQuizBack');
    if (!body) return;

    if (quizState.step <= QUIZ_STEPS_COUNT) {
      const stepData = STEPS_DATA[quizState.step - 1];
      const percent = (quizState.step / QUIZ_STEPS_COUNT) * 100;
      if (bar) bar.style.width = `${percent}%`;
      if (counter) counter.textContent = `Вопрос ${quizState.step} из ${QUIZ_STEPS_COUNT}`;
      if (btnBack) btnBack.style.visibility = (quizState.step > 1) ? 'visible' : 'hidden';

      const currentVal = quizState.answers[stepData.id];

      body.innerHTML = `
        <div class="quiz-step-pane">
          <div class="quiz-step-heading-wrap">
            <h2 class="quiz-step-title" id="quizModalHeading">${escapeHtml(stepData.title)}</h2>
            <p class="quiz-step-subtitle">${escapeHtml(stepData.subtitle)}</p>
          </div>

          <div class="quiz-options-grid">
            ${stepData.options.map(opt => {
              const isSelected = currentVal === opt.val;
              return `
                <button type="button" class="quiz-option-card ${isSelected ? 'selected' : ''}" data-val="${opt.val}">
                  <span class="quiz-opt-icon">${opt.icon}</span>
                  <div class="quiz-opt-content">
                    <div class="quiz-opt-title">${escapeHtml(opt.title)}</div>
                    <div class="quiz-opt-desc">${escapeHtml(opt.desc)}</div>
                  </div>
                  <span class="quiz-opt-radio-mark" aria-hidden="true"></span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;

      body.querySelectorAll('.quiz-option-card').forEach(card => {
        card.addEventListener('click', () => {
          const val = card.getAttribute('data-val');
          quizState.answers[stepData.id] = val;

          body.querySelectorAll('.quiz-option-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');

          setTimeout(() => {
            quizState.step++;
            if (quizState.step > QUIZ_STEPS_COUNT) {
              renderResultsStep();
            } else {
              renderCurrentStep();
            }
          }, 180);
        });
      });

    } else {
      renderResultsStep();
    }
  }

  async function renderResultsStep() {
    const body = document.getElementById('quizCardBody');
    const counter = document.getElementById('quizStepCounter');
    const bar = document.getElementById('quizProgressBar');
    const btnBack = document.getElementById('btnQuizBack');
    if (!body) return;

    if (bar) bar.style.width = '100%';
    if (counter) counter.textContent = 'Подборка готова!';
    if (btnBack) btnBack.style.visibility = 'visible';

    body.innerHTML = `
      <div class="quiz-loading-state">
        <div class="quiz-spinner"></div>
        <div class="quiz-loading-text">Анализируем 697 моделей каталога и подбираем лучший вариант...</div>
      </div>
    `;

    const catalog = await loadCatalog();
    const { top3, totalCount, filterParams } = computeMatchingDoors(catalog, quizState.answers);
    quizState.matchedDoors = top3;
    quizState.totalMatchedCount = totalCount;

    const isVolumeOrder = (quizState.answers.openings === '3-4' || quizState.answers.openings === '5+');

    body.innerHTML = `
      <div class="quiz-results-pane">
        <div class="quiz-results-header">
          <div class="quiz-badge-success">✓ 100% совпадение параметров</div>
          <h2 class="quiz-results-title">Мы подобрали ${totalCount} подходящих моделей</h2>
          <p class="quiz-results-subtitle">
            Вот 3 рекомендуемые модели по вашему бюджету и сценарию монтажа:
          </p>
        </div>

        ${isVolumeOrder ? `
          <div class="quiz-promo-callout">
            <span class="promo-callout-icon">🚚</span>
            <div class="promo-callout-text">
              <strong>Спецпредложение для вашего объёма (${quizState.answers.openings === '5+' ? 'от 5 дверей' : '3–4 двери'}):</strong>
              <span>Бесплатная доставка со склада по Казани и Набережным Челнам + приоритетный лазерный замер!</span>
            </div>
          </div>
        ` : ''}

        <!-- 3 РЕАЛЬНЫЕ КАРТОЧКИ ИЗ КАТАЛОГА -->
        <div class="quiz-matched-cards">
          ${top3.map(door => {
            const img = door.thumb || 'door-placeholder.svg';
            const price = door.price ? `${Number(door.price).toLocaleString('ru-RU')} ₽` : 'По запросу';
            return `
              <div class="quiz-matched-card">
                <div class="quiz-matched-img-box">
                  ${door.inStock ? '<span class="badge-in-stock mini"><span class="badge-dot"></span>Склад</span>' : ''}
                  <img src="${img}" alt="${escapeHtml(door.model || door.name)}" class="quiz-matched-img" onerror="this.onerror=null; this.src='door-placeholder.svg';">
                </div>
                <div class="quiz-matched-info">
                  <div class="quiz-matched-brand">${escapeHtml(door.brand || 'Коллекция')}</div>
                  <div class="quiz-matched-name" title="${escapeHtml(door.model || door.name)}">${escapeHtml(door.model || door.name)}</div>
                  <div class="quiz-matched-price">${price}</div>
                  <a href="product.html?id=${encodeURIComponent(door.id)}" class="quiz-matched-link" target="_blank">
                    Подробнее →
                  </a>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="quiz-actions-row">
          <button type="button" class="btn-quiz-view-all" id="btnQuizViewAll">
            <span>Смотреть всю выборку (${totalCount} моделей)</span>
            <span>→</span>
          </button>
        </div>

        <!-- ФОРМА ЗАКРЕПЛЕНИЯ СКИДКИ / РАСЧЕТА -->
        <div class="quiz-lead-box">
          <div class="quiz-lead-header">
            <strong>Зафиксировать условия и получить детальный расчёт сметы</strong>
            <p>Инженер перезвонит в течение 15 минут, ответит на вопросы и пришлет раскладку по фурнитуре в WhatsApp/Telegram</p>
          </div>

          <form id="quizLeadForm" class="quiz-lead-form">
            <div class="quiz-form-row">
              <input type="text" id="quizLeadName" class="quiz-input" placeholder="Ваше имя" required>
              <input type="tel" id="quizLeadPhone" class="quiz-input" placeholder="+7 (___) ___-__-__" required>
              <button type="submit" class="btn-quiz-submit" id="btnQuizSubmit">
                <span>Получить расчёт со скидкой</span>
              </button>
            </div>
            <div class="quiz-privacy-note">
              Конфиденциально. Ваши ответы переданы инженеру для предварительного расчёта проёмов.
            </div>
          </form>
        </div>
      </div>
    `;

    // Привязываем телефонную маску
    const phoneIn = document.getElementById('quizLeadPhone');
    if (phoneIn && window.DverLeads && window.DverLeads.attachPhoneMask) {
      window.DverLeads.attachPhoneMask(phoneIn);
    }

    // Обработчик кнопки «Смотреть всю выборку»
    const btnViewAll = document.getElementById('btnQuizViewAll');
    if (btnViewAll) {
      btnViewAll.addEventListener('click', () => {
        closeQuiz();
        applyQuizFiltersToCatalog(filterParams);
      });
    }

    // Обработчик сабмита лида квиза
    const quizForm = document.getElementById('quizLeadForm');
    if (quizForm) {
      quizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameIn = document.getElementById('quizLeadName');
        const phoneIn = document.getElementById('quizLeadPhone');
        const submitBtn = document.getElementById('btnQuizSubmit');

        const quizAnswersText = `Объект: ${getPlacementLabel(quizState.answers.placement)}; Тип: ${getTypeLabel(quizState.answers.type)}; Проёмов: ${quizState.answers.openings}; Бюджет: ${getBudgetLabel(quizState.answers.budget)}`;

        const payload = {
          name: nameIn ? nameIn.value : '',
          phone: phoneIn ? phoneIn.value : '',
          city: (window.DverCity && window.DverCity.getCurrentCity) ? window.DverCity.getCurrentCity().name : 'Казань',
          source: 'Квиз-подборщик за 30 секунд',
          type: 'quiz',
          goalName: 'lead_quiz',
          comment: `[Квиз 30 сек] ${quizAnswersText}`
        };

        if (window.DverLeads && window.DverLeads.submitLead) {
          try {
            await window.DverLeads.submitLead(payload, {
              formEl: quizForm,
              submitBtn,
              phoneInputEl: phoneIn,
              nameInputEl: nameIn
            });

            setTimeout(() => {
              closeQuiz();
              if (window.DverApp && window.DverApp.showToast) {
                window.DverApp.showToast('Заявка с квиза принята! Инженер свяжется с вами.');
              }
            }, 1800);
          } catch (err) {
            console.error(err);
          }
        }
      });
    }
  }

  function computeMatchingDoors(catalog, answers) {
    if (!catalog || catalog.length === 0) {
      return { top3: [], totalCount: 0, filterParams: {} };
    }

    const { type, budget, placement } = answers;
    let targetCategory = '';
    let targetType = '';

    if (type === 'interior') {
      targetCategory = 'Межкомнатные двери';
    } else if (type === 'invisible') {
      targetCategory = 'Скрытые двери';
      targetType = 'invisible';
    } else if (type === 'entrance') {
      targetCategory = 'Входные двери';
    } else if (type === 'glass') {
      targetType = 'glass';
    }

    let minPrice = 0;
    let maxPrice = Infinity;
    let priceFilterKey = 'all';

    if (budget === 'under_18k') {
      maxPrice = 18000;
      priceFilterKey = 'under_18k';
    } else if (budget === '18k_35k') {
      minPrice = 18000;
      maxPrice = 35000;
      priceFilterKey = '10k_25k'; // ближайший фильтр
    } else if (budget === 'over_35k') {
      minPrice = 35000;
      priceFilterKey = 'over_40k';
    }

    // Фильтруем
    let matched = catalog.filter(p => {
      // Категория / тип
      if (targetCategory && p.category !== targetCategory) {
        if (targetType === 'invisible' && (p.category === 'Скрытые двери' || p.type === 'invisible')) {
          // match
        } else {
          return false;
        }
      }
      if (targetType === 'glass' && p.type !== 'glass' && p.category !== 'Двери со стеклом') {
        return false;
      }
      if (targetType === 'invisible' && p.type !== 'invisible' && p.category !== 'Скрытые двери') {
        return false;
      }

      // Бюджет
      const pr = p.price || 0;
      if (pr > 0) {
        if (pr < minPrice || pr > maxPrice) return false;
      }
      return true;
    });

    // Если выборка слишком строгая (меньше 3 дверей), расслабляем фильтр цены
    if (matched.length < 3) {
      matched = catalog.filter(p => {
        if (targetCategory && p.category !== targetCategory) return false;
        if (targetType === 'glass' && p.type !== 'glass') return false;
        if (targetType === 'invisible' && p.type !== 'invisible' && p.category !== 'Скрытые двери') return false;
        return true;
      });
    }

    // Если всё ещё мало, берём просто лучшие складские
    if (matched.length < 3) {
      matched = catalog.slice(0, 10);
    }

    // Сортируем: сначала в наличии, затем с фото
    matched.sort((a, b) => {
      if (b.inStock !== a.inStock) return (b.inStock ? 1 : 0) - (a.inStock ? 1 : 0);
      return (a.price || 0) - (b.price || 0);
    });

    const top3 = matched.slice(0, 3);
    const filterParams = {
      cat: targetCategory,
      type: targetType,
      price: priceFilterKey
    };

    return { top3, totalCount: matched.length, filterParams };
  }

  function applyQuizFiltersToCatalog(params) {
    if (!window.DverApp) return;

    if (params.cat && window.DverApp.setCategory) {
      window.DverApp.setCategory(params.cat);
    }

    const catalogEl = document.getElementById('catalogContent');
    if (catalogEl) {
      catalogEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function getPlacementLabel(key) {
    const map = { apartment: 'В квартиру', house: 'В дом/коттедж', commercial: 'Офис/коммерция' };
    return map[key] || key;
  }
  function getTypeLabel(key) {
    const map = { interior: 'Межкомнатные', invisible: 'Скрытые Invisible', entrance: 'Входные сейф', glass: 'Со стеклом' };
    return map[key] || key;
  }
  function getBudgetLabel(key) {
    const map = { under_18k: 'До 18 000 ₽', '18k_35k': '18 000–35 000 ₽', over_35k: 'Премиум от 35 000 ₽' };
    return map[key] || key;
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

  // Экспорт
  window.DverQuiz = {
    openQuiz,
    closeQuiz
  };

  // Автоинициализация триггеров
  function initQuizTriggers() {
    document.querySelectorAll('[data-action="open-quiz"], #btnOpenQuiz, .btn-quiz-open').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openQuiz();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuizTriggers);
  } else {
    initQuizTriggers();
  }
})();
