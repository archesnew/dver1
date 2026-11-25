/**
 * ДВЕРИ №1 — ЕДИНАЯ КОНФИГУРАЦИЯ СВЯЗИ И ЛИДОГЕНЕРАЦИИ (V3.2)
 * Централизованные контакты, мессенджеры и эндпоинты
 */

(function () {
  'use strict';

  const DVER_CONFIG = {
    PHONE_DISPLAY: "+7 (965) 627-10-10",
    PHONE_RAW: "+79656271010",
    WHATSAPP_NUMBER: "79656271010",
    TELEGRAM_USERNAME: "dveri_1",
    TELEGRAM_CATALOG_URL: "https://t.me/dveri_1",
    MAX_CATALOG_URL: "https://max.ru/join/ta3eyKCyExYWI37TCWrSAkzOkKTQAamITFpQHj9FEi4",
    LEAD_ENDPOINT: "", // URL webhook/бота; если пустой — срабатывает graceful fallback с WhatsApp/Telegram
    YM_COUNTER_ID: null, // Плейсхолдер для номера счётчика Яндекс.Метрики (Спринт 5)

    // Города присутствия и магазины
    CITIES: {
      kazan: {
        id: 'kazan',
        name: 'Казань',
        storeName: 'Магазин «Двери Голливуда»',
        address: 'ул. Рихарда Зорге, 100',
        schedule: 'Ежедневно 09:00–19:00',
        phoneDisplay: '+7 (965) 627-10-10',
        phoneRaw: '+79656271010',
        coords: [55.7445, 49.2121]
      },
      chelny: {
        id: 'chelny',
        name: 'Набережные Челны',
        storeName: 'Магазин «Двери №1»',
        address: 'ТЦ «Кама», пр-т Московский, 126Б (53/07а), 2 этаж',
        addressHint: 'Большая Кама — ближе к «Тулпар», с эскалатора налево',
        schedule: 'Ежедневно 09:00–18:00',
        phoneDisplay: '+7 (965) 627-10-10',
        phoneRaw: '+79656271010',
        coords: [55.7366, 52.4268]
      }
    },

    // Рейтинги и отзывы на гео-сервисах (Спринт 8 — Задача 2)
    RATINGS: {
      yandex: {
        score: '5.0',
        reviewsCount: 142,
        url: 'https://yandex.ru/maps/org/dveri_1/1892345091/',
        title: 'Яндекс Карты',
        badge: 'Выбор покупателей 2025'
      },
      twoGis: {
        score: '4.9',
        reviewsCount: 98,
        url: 'https://2gis.ru/kazan/firm/70000001034567890',
        title: '2ГИС',
        badge: 'Надёжный партнёр'
      }
    },

    // Мотивация корзины и базовые расценки монтажа (Спринт 8 — Задача 5)
    FREE_DELIVERY_MIN_QTY: 4,
    INSTALLATION_PRICE_INTERIOR: 3500,
    INSTALLATION_PRICE_ENTRANCE: 4500,

    // Базовые доплаты для комплекта «под ключ» (Спринт 3)
    KIT_SURCHARGES: {
      interior: [
        { id: 'casing', name: 'Короб и наличники (телескопические)', price: 4500, defaultActive: true },
        { id: 'hinges', name: 'Скрытые петли (2 шт.)', price: 3200, defaultActive: true },
        { id: 'lock', name: 'Магнитный замок + ручка', price: 2800, defaultActive: true },
        { id: 'dobor', name: 'Доборы (комплект)', price: 2400, defaultActive: false }
      ],
      entrance: [
        { id: 'delivery_lift', name: 'Доставка и подъём на этаж', price: 2500, defaultActive: true },
        { id: 'turnkey_install', name: 'Монтаж под ключ с демонтажем', price: 4500, defaultActive: true }
      ]
    },

    // Палитра оттенков стен для примерки полотна
    WALL_COLORS: [
      { id: 'white', name: 'Белый', hex: '#F7F7F5', default: true },
      { id: 'beige', name: 'Тёплый беж', hex: '#E8DFD1' },
      { id: 'concrete', name: 'Серый бетон', hex: '#C9CCC8' },
      { id: 'graphite', name: 'Графит', hex: '#36393F' },
      { id: 'sage', name: 'Шалфей', hex: '#9BA89B' },
      { id: 'terracotta', name: 'Терракота', hex: '#B87D64' },
      { id: 'wood', name: 'Светлое дерево', hex: '#D8C3A5' }
    ],

    // Список стандартных помещений для спецификации
    ROOMS: [
      'Гостиная',
      'Спальня',
      'Санузел',
      'Гардеробная',
      'Входная группа',
      'Кухня',
      'Детская',
      'Кабинет'
    ],

    // Варианты стороны открывания
    OPENING_DIRECTIONS: [
      'Левое',
      'Правое',
      'Уточнит замерщик'
    ],

    // Генераторы ссылок на мессенджеры с предзаполненным текстом
    getWhatsAppUrl(messageText) {
      const cleanPhone = (this.WHATSAPP_NUMBER || '').replace(/[^\d]/g, '');
      const text = messageText || 'Здравствуйте! Хочу проконсультироваться по выбору дверей.';
      return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    },

    getTelegramUrl(messageText) {
      const username = (this.TELEGRAM_USERNAME || '').replace('@', '');
      const text = messageText || 'Здравствуйте! Хочу проконсультироваться по выбору дверей.';
      return `https://t.me/${username}?text=${encodeURIComponent(text)}`;
    },

    // Предзаполненный текст для карточки товара или быстрого просмотра
    getProductInquiryText(product) {
      if (!product) {
        return 'Здравствуйте! Хочу проконсультироваться по моделям дверей в наличии.';
      }
      const name = product.name || product.model || 'Дверное полотно';
      const id = product.id ? `арт. ${product.id}` : '';
      const priceStr = product.price
        ? `от ${Number(product.price).toLocaleString('ru-RU')} ₽`
        : 'цена по запросу';
      return `Здравствуйте! Интересует дверь ${name} (${id}, ${priceStr}). Подскажите по наличию и срокам.`;
    }
  };

  window.DVER_CONFIG = DVER_CONFIG;
  window.DverConfig = DVER_CONFIG;
})();
