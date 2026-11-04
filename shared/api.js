(function () {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbxf4l7Hasq2aVDI1WU08HHyErgBMHrXx02LF3CBS0cJTL0buH37KTK3AQkTiP7j2ENoKA/exec';

  function getToken() {
    return window.NaveraUtils && typeof window.NaveraUtils.getToken === 'function'
      ? window.NaveraUtils.getToken()
      : '';
  }

  async function request(action, payload = {}) {
    if (!API_URL || API_URL.includes('MASUKKAN_URL')) {
      throw new Error('URL Google Apps Script belum dikonfigurasi.');
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action,
        payload,
        token: payload.token || getToken()
      })
    });

    if (!response.ok) {
      throw new Error('Gagal menghubungi server. Kode: ' + response.status);
    }

    const result = await response.json();

    if (result && result.success === false) {
      throw new Error(result.message || 'Permintaan gagal diproses.');
    }

    return result;
  }

  const API = {
    request,

    getSession() {
      return window.NaveraUtils && typeof window.NaveraUtils.getUser === 'function'
        ? window.NaveraUtils.getUser()
        : null;
    },

    getPublicData() {
      return request('getPublicData', {
        include: ['products', 'reviews', 'settings']
      });
    },

    login(identifier, password) {
      return request('login', {
        identifier,
        password
      });
    },

    register(userData) {
      return request('register', userData);
    },

    logout(token) {
      return request('logout', {
        token: token || getToken()
      }).finally(() => {
        if (window.NaveraUtils && typeof window.NaveraUtils.clearSession === 'function') {
          window.NaveraUtils.clearSession();
        }
      });
    },

  };

  window.NaveraAPI = API;
})();