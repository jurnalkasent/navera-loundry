(function () {
  'use strict';

  const API = window.NaveraAPI;
  const Utils = window.NaveraUtils;

  document.addEventListener('DOMContentLoaded', function () {
    initializeYear();
    initializePasswordToggle();
    initializeLogin();
    initializeRegister();
    initializeRememberPhone();
  });

  function initializeYear() {
    const element = document.getElementById('authYear');

    if (element) {
      element.textContent = new Date().getFullYear();
    }
  }

  function initializePasswordToggle() {
    document.querySelectorAll('[data-password-toggle]').forEach(button => {
      button.addEventListener('click', function () {
        const input = document.getElementById(this.dataset.passwordToggle);

        if (!input) return;

        const icon = this.querySelector('i');
        const visible = input.type === 'text';

        input.type = visible ? 'password' : 'text';

        if (icon) {
          icon.className = visible ? 'bi bi-eye' : 'bi bi-eye-slash';
        }
      });
    });
  }

  function showMessage(element, message, type = 'error') {
    if (!element) return;

    element.textContent = message;
    element.className = `form-message show ${type}`;
  }

  function clearMessage(element) {
    if (!element) return;

    element.textContent = '';
    element.className = 'form-message';
  }

  function setButtonLoading(button, loading, text) {
    if (!button) return;

    if (loading) {
      button.dataset.originalContent = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span>${text}</span><i class="bi bi-arrow-repeat"></i>`;
    } else {
      button.disabled = false;

      if (button.dataset.originalContent) {
        button.innerHTML = button.dataset.originalContent;
        delete button.dataset.originalContent;
      }
    }
  }

  function normalizePhone(value) {
    let phone = String(value || '').replace(/[^\d+]/g, '');

    if (phone.startsWith('+62')) {
      phone = '0' + phone.slice(3);
    } else if (phone.startsWith('62')) {
      phone = '0' + phone.slice(2);
    }

    return phone;
  }

  function initializeRememberPhone() {
    const phoneInput = document.getElementById('loginPhone');
    const remember = document.getElementById('rememberPhone');

    if (!phoneInput || !remember) return;

    const savedPhone = localStorage.getItem('navera_remembered_login')
      || localStorage.getItem('navera_remembered_phone');

    if (savedPhone) {
      phoneInput.value = savedPhone;
      remember.checked = true;
    }
  }

  function initializeLogin() {
    const form = document.getElementById('loginForm');

    if (!form) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      const phoneInput = document.getElementById('loginPhone');
      const passwordInput = document.getElementById('loginPassword');
      const remember = document.getElementById('rememberPhone');
      const button = document.getElementById('loginButton');
      const message = document.getElementById('loginMessage');

      const identifier = phoneInput.value.trim();
      const password = passwordInput.value;

      clearMessage(message);

      if (!identifier) {
        showMessage(message, 'Username atau nomor WhatsApp wajib diisi.');
        phoneInput.focus();
        return;
      }

      if (!password) {
        showMessage(message, 'Password wajib diisi.');
        passwordInput.focus();
        return;
      }

      setButtonLoading(button, true, 'Memeriksa akun...');

      try {
        const response = await API.login(identifier, password);
        const data = response.data || response;

        const token = data.token || data.sessionToken;
        const user = data.user || data.profile;

        if (!response.success || !token || !user) {
          throw new Error(response.message || 'Data login tidak lengkap.');
        }

        const role = String(user.role || user.userRole || '').toUpperCase();

        const allowedRoles = ['ADMIN', 'CUSTOMER', 'STAFF'];

        if (!allowedRoles.includes(role)) {
          throw new Error('Role akun tidak dikenali.');
        }

        Utils.setSession(token, {
          ...user,
          role
        });

        if (remember && remember.checked) {
          localStorage.setItem('navera_remembered_login', identifier);
        } else {
          localStorage.removeItem('navera_remembered_login');
          localStorage.removeItem('navera_remembered_phone');
        }

        Utils.showToast('Login berhasil. Mengalihkan halaman...', 'success');

        window.setTimeout(() => {
          Utils.redirectByRole(role);
        }, 600);

      } catch (error) {
        showMessage(
          message,
          error.message || 'Login gagal. Periksa nomor dan password.'
        );
      } finally {
        setButtonLoading(button, false);
      }
    });
  }

  function initializeRegister() {
    const form = document.getElementById('registerForm');

    if (!form) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      const name = document.getElementById('registerName').value.trim();
      const username = document.getElementById('registerUsername').value.trim();
      const phone = normalizePhone(document.getElementById('registerPhone').value);
      const address = document.getElementById('registerAddress').value.trim();
      const password = document.getElementById('registerPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const agree = document.getElementById('agreeTerms').checked;

      const button = document.getElementById('registerButton');
      const message = document.getElementById('registerMessage');

      clearMessage(message);

      if (name.length < 3) {
        showMessage(message, 'Nama lengkap minimal 3 karakter.');
        return;
      }

      if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
        showMessage(message, 'Username harus 3–30 karakter dan hanya boleh menggunakan huruf, angka, titik, garis bawah, atau tanda hubung.');
        return;
      }

      if (!Utils.isValidPhone(phone)) {
        showMessage(message, 'Nomor WhatsApp tidak valid.');
        return;
      }

      if (address.length < 8) {
        showMessage(message, 'Alamat lengkap harus diisi dengan benar.');
        return;
      }

      if (!Utils.isValidPassword(password)) {
        showMessage(message, 'Password minimal 8 karakter.');
        return;
      }

      if (password !== confirmPassword) {
        showMessage(message, 'Konfirmasi password tidak sama.');
        return;
      }

      if (!agree) {
        showMessage(message, 'Silakan setujui ketentuan penggunaan layanan.');
        return;
      }

      const userData = {
        name,
        username,
        phone,
        address,
        password,
        role: 'CUSTOMER'
      };

      setButtonLoading(button, true, 'Membuat akun...');

      try {
        const response = await API.register(userData);

        if (!response.success) {
          throw new Error(response.message || 'Pendaftaran gagal.');
        }

        showMessage(
          message,
          'Pendaftaran berhasil! Silakan masuk menggunakan akun yang baru dibuat.',
          'success'
        );

        Utils.showToast('Akun NAVERA berhasil dibuat.', 'success');

        form.reset();

        window.setTimeout(() => {
          window.location.href = 'login.html';
        }, 1600);

      } catch (error) {
        showMessage(
          message,
          error.message || 'Terjadi kesalahan saat membuat akun.'
        );
      } finally {
        setButtonLoading(button, false);
      }
    });
  }

})();