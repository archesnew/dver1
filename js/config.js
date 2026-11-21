/**
 * ДВЕРИ №1 — ЕДИНАЯ КОНФИГУРАЦИЯ СВЯЗИ И ЛИДОГЕНЕРАЦИИ (V3.2)
 * Централизованные контакты, мессенджеры и эндпоинты
 */

(function () {
  'use strict';

  const DVER_CONFIG = {
    PHONE_DISPLAY: "+7 (843) 205-00-01",
    PHONE_RAW: "+78432050001",
    WHATSAPP_NUMBER: "78432050001",
    TELEGRAM_USERNAME: "dver1_manager",
    LEAD_ENDPOINT: "", // URL webhook/бота; если пустой — срабатывает graceful fallback с WhatsApp/Telegram

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
})();
