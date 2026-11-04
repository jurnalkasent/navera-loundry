(function () {
  'use strict';

  const CONFIG = window.NAVERA_CONFIG || {};

  const Utils = {
    formatRupiah(value) {
      const number = Number(value) || 0;

      return new Intl.NumberFormat(CONFIG.LOCALE || 'id-ID', {
        style: 'currency',
        currency: CONFIG.CURRENCY || 'IDR',
        maximumFractionDigits: 0
      }).format(number);
    },

    formatNumber(value) {
      return new Intl.NumberFormat(CONFIG.LOCALE || 'id-ID').format(
        Number(value) || 0
      );
    },

    formatDate(value, options = {}) {
      if (!value) return '-';

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) return '-';

      return new Intl.DateTimeFormat(CONFIG.LOCALE || 'id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: CONFIG.TIMEZONE || 'Asia/Makassar',
        ...options
      }).format(date);
    },

    formatDateTime(value) {
      if (!value) return '-';

      return this.formatDate(value, {
        hour: '2-digit',
        minute: '2-digit'
      });
    },

    formatPhone(value) {
      return String(value || '').replace(/[^\d+]/g, '');
    },

    escapeHTML(value) {
      return String(value ?? '').replace(/[&<>"']/g, character => {
        const entities = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        };

        return entities[character];
      });
    },

    isValidPhone(value) {
      const phone = String(value || '').replace(/\D/g, '');
      return /^(\+?62|0)8\d{7,12}$/.test(phone);
    },

    isValidEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
    },

    isValidPassword(value) {
      return String(value || '').length >= (
        CONFIG.LIMITS?.MIN_PASSWORD_LENGTH || 8
      );
    },

    generateId(prefix = 'NVR') {
      const random = Math.random().toString(36).slice(2, 10).toUpperCase();
      const timestamp = Date.now().toString(36).toUpperCase();

      return `${prefix}-${timestamp}-${random}`;
    },

    getQueryParam(name) {
      return new URLSearchParams(window.location.search).get(name);
    },

    setSession(token, user) {
      if (!token || !user) return false;

      sessionStorage.setItem('navera_session', String(token));
      sessionStorage.setItem('navera_user', JSON.stringify(user));

      return true;
    },

    getToken() {
      return sessionStorage.getItem('navera_session') || '';
    },

    getUser() {
      try {
        const user = sessionStorage.getItem('navera_user');
        return user ? JSON.parse(user) : null;
      } catch (error) {
        return null;
      }
    },

    clearSession() {
      sessionStorage.removeItem('navera_session');
      sessionStorage.removeItem('navera_user');
    },

    redirectByRole(role) {
      const routes = {
        ADMIN: '../admin/admin.html',
        CUSTOMER: '../pembeli/pembeli.html',
        STAFF: '../staff/staff.html'
      };

      const destination = routes[String(role || '').toUpperCase()];

      if (!destination) {
        window.location.href = '../index.html';
        return;
      }

      window.location.href = destination;
    },

    logout() {
      const token = this.getToken();

      this.clearSession();

      if (window.NaveraAPI && token) {
        window.NaveraAPI.logout(token).catch(() => {});
      }

      window.location.href = '../index.html';
    },

    showToast(message, type = 'info', duration = 3500) {
      let container = document.getElementById('toastContainer');

      if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.className = `navera-toast navera-toast-${type}`;
      toast.textContent = message;

      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.classList.add('show');
      });

      window.setTimeout(() => {
        toast.classList.remove('show');

        window.setTimeout(() => {
          toast.remove();
        }, 300);
      }, duration);
    },

    setLoading(element, loading, loadingText = 'Memproses...') {
      if (!element) return;

      if (loading) {
        if (!element.dataset.originalText) {
          element.dataset.originalText = element.innerHTML;
        }

        element.disabled = true;
        element.innerHTML = loadingText;
      } else {
        element.disabled = false;

        if (element.dataset.originalText) {
          element.innerHTML = element.dataset.originalText;
          delete element.dataset.originalText;
        }
      }
    },

    async copyText(value) {
      try {
        await navigator.clipboard.writeText(String(value));
        this.showToast('Berhasil disalin.', 'success');
        return true;
      } catch (error) {
        this.showToast('Tidak dapat menyalin teks.', 'error');
        return false;
      }
    },

    debounce(callback, delay = 300) {
      let timeout;

      return function (...args) {
        clearTimeout(timeout);

        timeout = window.setTimeout(() => {
          callback.apply(this, args);
        }, delay);
      };
    },

    getInitials(name) {
      return String(name || '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join('');
    },

    safeImageUrl(url) {
      if (!url) return '';

      try {
        const parsed = new URL(url, window.location.origin);

        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return '';
        }

        return parsed.href;
      } catch (error) {
        return '';
      }
    }
  };

  window.NaveraUtils = Utils;
})();