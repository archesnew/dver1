// ==========================================================================
// ДВЕРИ №1 — ЕДИНАЯ КОРЗИНА И СПЕЦИФИКАЦИЯ (CART STORE)
// Хранение в localStorage ('DVER1_CART') + Синхронизация с сервером
// ==========================================================================

(function() {
  const STORAGE_KEY = 'DVER1_CART';
  const AUTH_KEY = 'DVER1_AUTH';

  const CartStore = {
    getCart() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error('[CartStore] Error reading cart:', e);
        return [];
      }
    },

    setCart(items) {
      try {
        const clean = Array.isArray(items) ? items : [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
        this.notifyUpdate(clean);
        return clean;
      } catch (e) {
        console.error('[CartStore] Error saving cart:', e);
        return [];
      }
    },

    addItem(item) {
      if (!item || !item.productId) return;
      const cart = this.getCart();

      // Normalize unique key
      const key = item.id || `${item.productId}-${item.variant || 'base'}-${item.size || 'std'}-${item.scenario || 'std'}-${item.opening || 'uni'}`;
      const qtyToAdd = Math.max(1, parseInt(item.quantity, 10) || 1);

      const existingIndex = cart.findIndex(it => it.id === key);
      if (existingIndex >= 0) {
        cart[existingIndex].quantity += qtyToAdd;
      } else {
        const isKnown = typeof item.unitPrice === 'number' && item.unitPrice > 0;
        cart.push({
          id: key,
          productId: item.productId,
          title: item.title || 'Модель двери',
          brand: item.brand || 'Двери №1',
          collection: item.collection || '',
          article: item.article || '',
          image: item.image || 'door-placeholder.svg',
          variant: item.variant || 'Базовое покрытие',
          size: item.size || '800 × 2000 мм',
          opening: item.opening || 'Универсальное',
          scenario: item.scenario || 'standard_kit_with_hardware',
          scenarioTitle: item.scenarioTitle || 'Полный комплект с фурнитурой',
          hardware: item.hardware || 'Базовая фурнитура с магнитным замком',
          wcTurn: Boolean(item.wcTurn),
          quantity: qtyToAdd,
          unitPrice: isKnown ? item.unitPrice : null,
          isPriceKnown: isKnown,
          priceText: isKnown ? `${item.unitPrice.toLocaleString('ru-RU')} ₽` : 'Цена уточняется'
        });
      }

      this.setCart(cart);
      this.syncBackground();
      return cart;
    },

    updateQuantity(id, delta) {
      const cart = this.getCart();
      const idx = cart.findIndex(it => it.id === id);
      if (idx === -1) return cart;

      cart[idx].quantity += delta;
      if (cart[idx].quantity <= 0) {
        cart.splice(idx, 1);
      }
      this.setCart(cart);
      this.syncBackground();
      return cart;
    },

    removeItem(id) {
      const cart = this.getCart();
      const filtered = cart.filter(it => it.id !== id);
      this.setCart(filtered);
      this.syncBackground();
      return filtered;
    },

    clearCart() {
      this.setCart([]);
      this.syncBackground();
    },

    calculateTotals(customCart) {
      const cart = customCart || this.getCart();
      let totalCount = 0;
      let knownItemsTotal = 0;
      let hasUncertainPrices = false;
      let uncertainCount = 0;

      cart.forEach(item => {
        const qty = item.quantity || 1;
        totalCount += qty;
        if (item.isPriceKnown && typeof item.unitPrice === 'number') {
          knownItemsTotal += item.unitPrice * qty;
        } else {
          hasUncertainPrices = true;
          uncertainCount += qty;
        }
      });

      return {
        totalCount,
        knownItemsTotal,
        hasUncertainPrices,
        uncertainCount,
        formattedTotal: knownItemsTotal > 0 ? `${knownItemsTotal.toLocaleString('ru-RU')} ₽` : 'По запросу'
      };
    },

    notifyUpdate(cart) {
      const totals = this.calculateTotals(cart);
      // Update any badge in DOM
      document.querySelectorAll('#headerCartCount, .cart-badge-count').forEach(badge => {
        badge.textContent = totals.totalCount;
        badge.style.display = totals.totalCount > 0 ? 'inline-flex' : 'none';
      });

      window.dispatchEvent(new CustomEvent('dver1:cart-updated', {
        detail: { cart, totals }
      }));
    },

    // Auth helpers for phone binding
    getAuth() {
      try {
        const raw = localStorage.getItem(AUTH_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    setAuth(authData) {
      try {
        if (authData) {
          localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
        } else {
          localStorage.removeItem(AUTH_KEY);
        }
      } catch (e) {
        console.error('[CartStore] Error setting auth:', e);
      }
    },

    async syncBackground() {
      const auth = this.getAuth();
      const cart = this.getCart();
      if (!auth || !auth.token) return;

      try {
        await fetch('/api/cart/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: auth.phone,
            token: auth.token,
            items: cart
          })
        });
      } catch (e) {
        // Network failure is non-fatal for client storage
      }
    }
  };

  // Expose globally
  window.CartStore = CartStore;

  // Initialize badges when DOM loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CartStore.notifyUpdate(CartStore.getCart()));
  } else {
    CartStore.notifyUpdate(CartStore.getCart());
  }
})();
