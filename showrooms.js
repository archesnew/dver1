/**
 * СТРАНИЦА ШОУРУМОВ «ДВЕРИ №1» — СКРИПТ УПРАВЛЕНИЯ
 * Управление шапкой Apple Liquid Glass, мобильным меню и модальными окнами визита
 */

(function () {
  'use strict';

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

    function openMenu() {
      toggleBtn.classList.add('open');
      toggleBtn.setAttribute('aria-expanded', 'true');
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      if (overlay) overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = panel.classList.contains('open');
      if (isOpen) closeMenu();
      else openMenu();
    });

    if (overlay) {
      overlay.addEventListener('click', closeMenu);
    }

    window.closeMobileMenu = closeMenu;
  }

  function initHeaderScrollEffect() {
    const header = document.getElementById('siteHeader');
    if (!header) return;

    function onScroll() {
      if (window.scrollY > 12) {
        header.classList.add('is-scrolled');
      } else {
        header.classList.remove('is-scrolled');
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Модальное окно записи в шоурум
  function openLeadModal(title) {
    const modal = document.getElementById('leadModal');
    const modalTitle = document.getElementById('leadModalTitle');
    if (!modal) return;

    if (modalTitle && title) {
      modalTitle.textContent = title;
    }
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeLeadModal() {
    const modal = document.getElementById('leadModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function setupModals() {
    const btnClose = document.getElementById('btnCloseLeadModal');
    if (btnClose) {
      btnClose.addEventListener('click', closeLeadModal);
    }

    const modal = document.getElementById('leadModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeLeadModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLeadModal();
    });

    const leadForm = document.getElementById('leadOrderForm');
    if (leadForm) {
      leadForm.onsubmit = null;
      leadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameEl = document.getElementById('leadName');
        const phoneEl = document.getElementById('leadPhone');
        const cityEl = document.getElementById('leadCity');
        const commentEl = document.getElementById('leadComment');
        const submitBtn = leadForm.querySelector('button[type="submit"]');

        if (window.DverLeads && typeof window.DverLeads.submitLead === 'function') {
          try {
            await window.DverLeads.submitLead({
              name: nameEl ? nameEl.value : '',
              phone: phoneEl ? phoneEl.value : '',
              city: cityEl ? cityEl.value : 'Казань',
              comment: commentEl ? commentEl.value : '',
              source: document.getElementById('leadModalTitle')?.textContent || 'Страница магазинов'
            }, {
              formEl: leadForm,
              submitBtn,
              nameInputEl: nameEl,
              phoneInputEl: phoneEl
            });
            setTimeout(() => {
              closeLeadModal();
              leadForm.reset();
            }, 1400);
          } catch (err) {
            alert(err.message || 'Проверьте корректность имени и номера телефона.');
          }
        } else {
          alert('Спасибо! Ваша заявка принята. Менеджер свяжется с вами в ближайшее время.');
          closeLeadModal();
          leadForm.reset();
        }
      });
    }
  }

  function initShowroomsMap() {
    const iframe = document.getElementById('showroomYandexMap');
    const tabs = document.querySelectorAll('.map-city-tab');
    if (!iframe || !tabs.length) return;

    const mapUrls = {
      kazan: 'https://yandex.ru/map-widget/v1/?ll=49.212100%2C55.744500&z=16&pt=49.212100%2C55.744500%2Cpm2rdm',
      chelny: 'https://yandex.ru/map-widget/v1/?ll=52.426800%2C55.736600&z=16&pt=52.426800%2C55.736600%2Cpm2rdm'
    };

    function selectCity(cityKey, shouldScroll) {
      if (!mapUrls[cityKey]) return;
      iframe.src = mapUrls[cityKey];
      tabs.forEach(tab => {
        const active = tab.dataset.mapCity === cityKey;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      if (shouldScroll) {
        const section = document.getElementById('showroomsMapSection');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        selectCity(tab.dataset.mapCity, false);
      });
    });

    window.ShowroomsMap = { selectCity };
  }

  // Экспорт в глобальный scope для обработчиков onclick
  window.DverApp = {
    openLeadModal: openLeadModal,
    closeLeadModal: closeLeadModal
  };

  document.addEventListener('DOMContentLoaded', () => {
    initHeaderMenu();
    initHeaderScrollEffect();
    setupModals();
    initShowroomsMap();
  });
})();
