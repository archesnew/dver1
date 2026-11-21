/**
 * ДВЕРИ №1 — ЕДИНЫЙ МОДУЛЬ ПЕРЕКЛЮЧЕНИЯ ГОРОДОВ (V3.9.0)
 * Синхронизирует выбранный город (Казань / Набережные Челны) в шапке,
 * футере, модалке замера и корзине с сохранением в localStorage.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'DVER1_CITY';
  const DEFAULT_CITY = 'kazan';

  function getCities() {
    return (window.DVER_CONFIG && window.DVER_CONFIG.CITIES) || {
      kazan: {
        id: 'kazan',
        name: 'Казань',
        address: 'ул. Сибирский тракт, 59б',
        schedule: 'Ежедневно 09:00–19:00',
        phoneDisplay: '+7 (843) 205-00-01',
        phoneRaw: '+78432050001'
      },
      chelny: {
        id: 'chelny',
        name: 'Набережные Челны',
        address: 'Казанский проспект, 232',
        schedule: 'Пн–Сб 09:00–18:00',
        phoneDisplay: '+7 (843) 205-00-01',
        phoneRaw: '+78432050001'
      }
    };
  }

  function getStoredCityId() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && getCities()[stored]) {
        return stored;
      }
    } catch (e) {
      console.warn('LocalStorage unavailable for city:', e);
    }
    return DEFAULT_CITY;
  }

  let currentCityId = getStoredCityId();

  function getCurrentCity() {
    return getCities()[currentCityId] || getCities()[DEFAULT_CITY];
  }

  function setCity(cityId) {
    const cities = getCities();
    if (!cities[cityId]) return;
    currentCityId = cityId;

    try {
      localStorage.setItem(STORAGE_KEY, cityId);
    } catch (e) {
      console.warn('Cannot write city to LocalStorage:', e);
    }

    updateUI();

    // Отправляем пользовательское событие
    window.dispatchEvent(new CustomEvent('dver:citychange', {
      detail: { cityId, city: getCurrentCity() }
    }));

    if (typeof window.trackGoal === 'function') {
      window.trackGoal('city_change', { cityId, cityName: cities[cityId].name });
    }
  }

  function updateUI() {
    const city = getCurrentCity();

    // 1. Обновляем все текстовые лейблы города в шапке и на страницах
    document.querySelectorAll('.current-city-label').forEach(el => {
      el.textContent = city.name;
    });

    document.querySelectorAll('[data-city-text="name"]').forEach(el => {
      el.textContent = city.name;
    });
    document.querySelectorAll('[data-city-text="address"]').forEach(el => {
      el.textContent = city.address;
    });
    document.querySelectorAll('[data-city-text="schedule"]').forEach(el => {
      el.textContent = city.schedule;
    });

    // 2. Подсвечиваем активный город в выпадающих меню
    document.querySelectorAll('.city-dropdown-item').forEach(btn => {
      const id = btn.getAttribute('data-city-id');
      const isActive = id === currentCityId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // 3. Синхронизируем модалку замера (#leadModal)
    const leadCitySelect = document.getElementById('leadCity');
    if (leadCitySelect) {
      leadCitySelect.value = city.name;
    }
    const leadCityRadios = document.querySelectorAll('input[name="leadCityRadio"]');
    if (leadCityRadios.length) {
      leadCityRadios.forEach(r => {
        r.checked = (r.value === city.name || r.value === city.id);
      });
    }

    // 4. Синхронизируем кнопки выбора города в корзине (cart.html)
    document.querySelectorAll('.city-select-btn').forEach(btn => {
      const btnCity = btn.getAttribute('data-city');
      const isActive = btnCity === city.name;
      btn.classList.toggle('active', isActive);
    });
  }

  // Создание виджета переключателя городов в шапке
  function initHeaderSwitcher() {
    // Ищем контейнер шапки
    const headerContainer = document.querySelector('.header-container');
    if (!headerContainer) return;

    // Проверяем, не смонтирован ли уже
    if (document.getElementById('headerCityWidget')) return;

    const widget = document.createElement('div');
    widget.id = 'headerCityWidget';
    widget.className = 'header-city-widget';

    const city = getCurrentCity();
    const cities = getCities();

    widget.innerHTML = `
      <button type="button" class="btn-city-switcher" id="btnCitySwitcher" aria-expanded="false" aria-haspopup="true" aria-label="Выбрать город: ${city.name}">
        <svg class="city-pin-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <span class="current-city-label">${city.name}</span>
        <svg class="city-caret-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <div class="city-dropdown-menu" id="cityDropdownMenu" role="listbox" aria-label="Города присутствия">
        <div class="city-dropdown-header">Ваш город для замера и доставки:</div>
        ${Object.keys(cities).map(id => {
          const c = cities[id];
          const isActive = id === currentCityId;
          return `
            <button type="button" class="city-dropdown-item ${isActive ? 'active' : ''}" data-city-id="${c.id}" role="option" aria-selected="${isActive ? 'true' : 'false'}">
              <div class="city-item-info">
                <span class="city-item-name">${c.name}</span>
                <span class="city-item-addr">${c.address}</span>
              </div>
              <svg class="city-check-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
          `;
        }).join('')}
      </div>
    `;

    // Вставляем виджет перед блоком навигации или после логотипа
    const headerNav = headerContainer.querySelector('.header-nav');
    const headerLogo = headerContainer.querySelector('.header-logo-link');

    if (headerLogo && headerNav) {
      headerLogo.insertAdjacentElement('afterend', widget);
    } else if (headerLogo) {
      headerLogo.insertAdjacentElement('afterend', widget);
    } else {
      headerContainer.prepend(widget);
    }

    // Слушатели открытия/закрытия
    const btn = document.getElementById('btnCitySwitcher');
    const menu = document.getElementById('cityDropdownMenu');

    if (btn && menu) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains('active');
        if (isOpen) {
          closeCityMenu();
        } else {
          openCityMenu();
        }
      });

      menu.querySelectorAll('.city-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const cityId = item.getAttribute('data-city-id');
          if (cityId) {
            setCity(cityId);
            closeCityMenu();
          }
        });
      });

      document.addEventListener('click', (e) => {
        if (!widget.contains(e.target)) {
          closeCityMenu();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu.classList.contains('active')) {
          closeCityMenu();
          btn.focus();
        }
      });
    }

    function openCityMenu() {
      menu.classList.add('active');
      btn.classList.add('active');
      btn.setAttribute('aria-expanded', 'true');
    }

    function closeCityMenu() {
      menu.classList.remove('active');
      btn.classList.remove('active');
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  // Публичный API
  window.DverCity = {
    getCity: getCurrentCity,
    getCityId: () => currentCityId,
    setCity: setCity,
    getCities: getCities,
    updateUI: updateUI
  };

  // Инициализация при готовности DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initHeaderSwitcher();
      updateUI();
    });
  } else {
    initHeaderSwitcher();
    updateUI();
  }
})();
