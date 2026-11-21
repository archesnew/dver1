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
