/**
 * ДВЕРИ №1 — СЛОЙ АНАЛИТИКИ И ЦЕЛИ ЯНДЕКС.МЕТРИКИ (SPRINT 5)
 * Централизованная отправка целей Яндекс.Метрики и отслеживание конверсий
 */

(function () {
  'use strict';

  function trackGoal(goalName, params = {}) {
    if (!goalName) return;

    const cfg = window.DVER_CONFIG || window.DverConfig || {};
    const counterId = cfg.YM_COUNTER_ID;

    if (counterId && typeof window.ym === 'function') {
      try {
        window.ym(counterId, 'reachGoal', goalName, params);
        console.debug(`[YM reachGoal: ${counterId}]`, goalName, params);
      } catch (err) {
        console.warn('[YM reachGoal error]', err);
      }
    } else {
      console.debug('[Analytics Goal]', goalName, params);
    }
  }

  // Делегированное глобальное отслеживание кликов по контактам и мессенджерам
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a, button');
    if (!link) return;

    const href = (link.getAttribute('href') || '').trim();

    if (href.startsWith('tel:')) {
      trackGoal('click_phone', { phone: href.replace('tel:', ''), text: link.textContent.trim() });
    } else if (href.includes('wa.me') || href.includes('whatsapp.com') || link.classList.contains('btn-sticky-whatsapp') || link.dataset.channel === 'whatsapp') {
      trackGoal('click_whatsapp', { href: href });
    } else if (href.includes('t.me') || link.dataset.channel === 'telegram') {
      trackGoal('click_telegram', { href: href });
    }
  }, { passive: true });

  window.DverAnalytics = {
    trackGoal
  };

  window.trackGoal = trackGoal;
})();
