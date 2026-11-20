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
      leadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Спасибо! Ваша заявка на визит в шоурум принята. Менеджер свяжется с вами для согласования удобного времени.');
        closeLeadModal();
        leadForm.reset();
      });
    }
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
  });
})();
