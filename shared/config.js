(function () {
  'use strict';

  const CONFIG = {
    APP_NAME: 'NAVERA',
    APP_FULL_NAME: 'NAVERA LAUNDRY & CARE',
    APP_TAGLINE: 'Every Fabric Deserves the Best Care.',

    TIMEZONE: 'Asia/Makassar',
    LOCALE: 'id-ID',
    CURRENCY: 'IDR',

    ROUTES: {
      HOME: '../index.html',
      LOGIN: '../auth/login.html',
      REGISTER: '../auth/register.html',
      ADMIN: '../admin/admin.html',
      CUSTOMER: '../pembeli/pembeli.html',
      STAFF: '../staff/staff.html'
    },

    AUTH: {
      SESSION_KEY: 'navera_session',
      USER_KEY: 'navera_user',
      SESSION_CHECK_INTERVAL: 300000
    },

    ROLES: {
      ADMIN: 'ADMIN',
      CUSTOMER: 'CUSTOMER',
      STAFF: 'STAFF'
    },

    ORDER_STATUS: {
      PENDING: 'PENDING',
      ACCEPTED: 'ACCEPTED',
      REJECTED: 'REJECTED',
      PROCESSING: 'PROCESSING',
      READY: 'READY',
      COMPLETED: 'COMPLETED',
      CANCELLED: 'CANCELLED'
    },

    PAYMENT_STATUS: {
      UNPAID: 'UNPAID',
      WAITING_VERIFICATION: 'WAITING_VERIFICATION',
      PAID: 'PAID',
      REJECTED: 'REJECTED',
      REFUNDED: 'REFUNDED'
    },

    PAYMENT_METHOD: {
      CASH: 'CASH',
      BANK_TRANSFER: 'BANK_TRANSFER',
      QRIS: 'QRIS'
    },

    ORDER_TYPE: {
      PICKUP_DELIVERY: 'PICKUP_DELIVERY',
      DROP_OFF: 'DROP_OFF'
    },

    LIMITS: {
      MIN_PASSWORD_LENGTH: 8,
      MAX_REVIEW_LENGTH: 1000,
      MAX_ADDRESS_LENGTH: 500,
      MAX_IMAGE_SIZE: 5242880
    }
  };

  window.NAVERA_CONFIG = Object.freeze(CONFIG);
})();