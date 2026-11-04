
const NAVERA = {
  TIMEZONE: "Asia/Makassar",
  SPREADSHEET_PROPERTY: "NAVERA_SPREADSHEET_ID",
  LEGACY_SPREADSHEET_PROPERTY: "1MVv8C0NvIE2Dcyu60Y3PLtqL44PBVQaWyeaLr_YrCJ8",
  DEFAULT_SPREADSHEET_ID: "1MVv8C0NvIE2Dcyu60Y3PLtqL44PBVQaWyeaLr_YrCJ8",
  INITIAL_ADMIN: {
    USERNAME: "keeki",
    PASSWORD: "12345678"
  },
  SESSION_HOURS: 12,
  SHEETS: {
    USERS: ["id", "name", "username", "phone", "email", "passwordHash", "passwordSalt", "role", "address", "active", "createdAt", "updatedAt", "sessionToken", "sessionExpiresAt"],
    PRODUCTS: ["id", "name", "description", "price", "unit", "imageUrl", "estimatedTime", "active", "createdAt", "updatedAt"],
    ORDERS: ["id", "customerId", "customerName", "customerPhone", "productId", "productName", "quantity", "unit", "unitPrice", "subtotal", "deliveryType", "address", "pickupSchedule", "paymentMethod", "paymentStatus", "status", "notes", "total", "createdAt", "updatedAt", "completedAt"],
    ORDER_ITEMS: ["id", "orderId", "productId", "productName", "quantity", "unit", "unitPrice", "subtotal", "createdAt"],
    PAYMENTS: ["id", "orderId", "customerId", "method", "amount", "status", "proofUrl", "verifiedBy", "verifiedAt", "createdAt", "updatedAt"],
    PAYMENT_METHODS: ["id", "name", "type", "accountName", "accountNumber", "imageUrl", "active", "createdAt", "updatedAt"],
    REVIEWS: ["id", "orderId", "customerId", "customerName", "rating", "comment", "approved", "createdAt", "updatedAt"],
    SETTINGS: ["key", "value", "updatedAt"],
    ORDER_HISTORY: ["id", "orderId", "actorId", "actorRole", "action", "oldStatus", "newStatus", "description", "createdAt"]
  },
  ORDER_STATUSES: ["PENDING", "ACCEPTED", "REJECTED", "PROCESSING", "READY", "COMPLETED", "CANCELLED"],
  ORDER_TRANSITIONS: {
    PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
    ACCEPTED: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["READY"],
    READY: ["COMPLETED"]
  }
};

let NAVERA_CACHE = {
  sheets: {},
  headers: {}
};

function doGet() {
  return output({
    success: true,
    message: "NAVERA API aktif.",
    application: "NAVERA LAUNDRY & CARE",
    timestamp: now()
  });
}

function doPost(e) {
  try {
    NAVERA_CACHE = { sheets: {}, headers: {} };

    const body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};

    const action = String(body.action || "").trim();
    const payload = body.payload && typeof body.payload === "object"
      ? body.payload
      : {};
    const token = body.token || payload.token || "";

    if (!action) throw new Error("Aksi API tidak ditemukan.");

    return output(dispatch(action, payload, token));
  } catch (error) {
    return output({
      success: false,
      message: safeError(error)
    });
  }
}

function output(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function now() {
  return Utilities.formatDate(
    new Date(),
    NAVERA.TIMEZONE,
    "yyyy-MM-dd'T'HH:mm:ss"
  );
}

function makeId(prefix) {
  return prefix + "_" + Utilities.getUuid().replace(/-/g, "").substring(0, 16).toUpperCase();
}

function safeError(error) {
  return String(error && error.message ? error.message : error || "Terjadi kesalahan.").substring(0, 300);
}

function withLock(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function properties() {
  return PropertiesService.getScriptProperties();
}

function configuredSpreadsheetId() {
  return NAVERA.DEFAULT_SPREADSHEET_ID
    || properties().getProperty(NAVERA.SPREADSHEET_PROPERTY)
    || properties().getProperty(NAVERA.LEGACY_SPREADSHEET_PROPERTY)
    || "";
}

function getSpreadsheet() {
  const id = configuredSpreadsheetId();

  if (!id) {
    throw new Error("NAVERA_SPREADSHEET_ID belum diatur pada Script Properties.");
  }

  return SpreadsheetApp.openById(id);
}

function getSheet(name) {
  const spreadsheet = getSpreadsheet();
  const sheet = findSheetByName(spreadsheet, name);

  if (!sheet) {
    throw new Error("Sheet " + name + " tidak ditemukan. Jalankan setupDatabase().");
  }

  return sheet;
}

function findSheetByName(spreadsheet, name) {
  const requestedName = String(name).trim().toLowerCase();

  return spreadsheet.getSheets().find(function(sheet) {
    return String(sheet.getName()).trim().toLowerCase() === requestedName;
  }) || null;
}

function setupDatabase() {
  return withLock(function() {
    let spreadsheetId = configuredSpreadsheetId();
    let spreadsheet;

    if (spreadsheetId) {
      spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      properties().setProperty(NAVERA.SPREADSHEET_PROPERTY, spreadsheetId);
    } else {
      spreadsheet = SpreadsheetApp.create("NAVERA_LAUNDRY_DATABASE");
      spreadsheetId = spreadsheet.getId();
      properties().setProperty(NAVERA.SPREADSHEET_PROPERTY, spreadsheetId);
    }

    archiveLegacySheet(spreadsheet, "COURIER_TASKS");
    archiveLegacySheet(spreadsheet, "TRACKING");

    Object.keys(NAVERA.SHEETS).forEach(function(name) {
      let sheet = findSheetByName(spreadsheet, name);

      if (!sheet) {
        const emptyDefaultSheet = spreadsheet.getSheetByName("Sheet1");

        if (emptyDefaultSheet && emptyDefaultSheet.getLastRow() === 0 && emptyDefaultSheet.getLastColumn() === 0) {
          emptyDefaultSheet.setName(name);
          sheet = emptyDefaultSheet;
        } else {
          sheet = spreadsheet.insertSheet(name);
        }
      }

      const requiredHeaders = NAVERA.SHEETS[name];
      const lastColumn = sheet.getLastColumn();

      if (lastColumn === 0) {
        sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
      } else {
        const currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
        const missingHeaders = requiredHeaders.filter(function(header) {
          return currentHeaders.indexOf(header) === -1;
        });

        if (missingHeaders.length) {
          sheet.getRange(1, lastColumn + 1, 1, missingHeaders.length).setValues([missingHeaders]);
        }
      }

      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, sheet.getLastColumn())
        .setBackground("#155EEF")
        .setFontColor("#FFFFFF")
        .setFontWeight("bold");
    });

    removeLegacyColumns("USERS", ["vehicle"]);
    removeLegacyColumns("ORDERS", ["courierId", "courierName"]);
    NAVERA_CACHE = { sheets: {}, headers: {} };
    retireLegacyCourierAccounts();
    migrateLegacyOrderStatuses();
    ensureSettings();

    let initialAdmin = null;
    const existingInitialAdmin = readRows("USERS").find(function(user) {
      return String(user.username || "").toLowerCase() === NAVERA.INITIAL_ADMIN.USERNAME;
    });

    if (existingInitialAdmin && String(existingInitialAdmin.role).toUpperCase() !== "ADMIN") {
      throw new Error("Username admin awal sudah digunakan akun non-admin: " + NAVERA.INITIAL_ADMIN.USERNAME);
    }

    if (!existingInitialAdmin) {
      const password = NAVERA.INITIAL_ADMIN.PASSWORD;

      initialAdmin = {
        username: NAVERA.INITIAL_ADMIN.USERNAME,
        password: password
      };

      insertRow("USERS", {
        id: makeId("USR"),
        name: "Administrator NAVERA",
        username: NAVERA.INITIAL_ADMIN.USERNAME,
        phone: "",
        email: "",
        passwordHash: password,
        passwordSalt: "",
        role: "ADMIN",
        address: "",
        active: true,
        createdAt: now(),
        updatedAt: now(),
        sessionToken: "",
        sessionExpiresAt: ""
      });
    }

    function archiveLegacySheet(spreadsheet, name) {
      const sheet = spreadsheet.getSheetByName(name);

      if (!sheet) return;

      const baseName = "ARCHIVED_" + name;
      const archiveName = spreadsheet.getSheetByName(baseName)
        ? baseName + "_" + Utilities.formatDate(new Date(), NAVERA.TIMEZONE, "yyyyMMdd_HHmmss")
        : baseName;

      sheet.setName(archiveName);
    }

    function removeLegacyColumns(name, legacyHeaders) {
      const sheet = getSheet(name);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
      const indexes = [];

      legacyHeaders.forEach(function(header) {
        const index = headers.indexOf(header);
        if (index !== -1) indexes.push(index + 1);
      });

      indexes.sort(function(a, b) {
        return b - a;
      }).forEach(function(index) {
        sheet.deleteColumn(index);
      });

      invalidateSheet(name);
      delete NAVERA_CACHE.headers[name];
    }

    function retireLegacyCourierAccounts() {
      readRows("USERS").filter(function(user) {
        return String(user.role).toUpperCase() === "COURIER";
      }).forEach(function(user) {
        updateRow("USERS", user.id, {
          role: "RETIRED",
          active: false,
          sessionToken: "",
          sessionExpiresAt: "",
          updatedAt: now()
        });
      });
    }

    function migrateLegacyOrderStatuses() {
      const migratedStatuses = {
        WAITING_COURIER: "ACCEPTED",
        ASSIGNED: "ACCEPTED",
        PICKED_UP: "ACCEPTED",
        READY_FOR_DELIVERY: "READY",
        DELIVERING: "READY"
      };

      readRows("ORDERS").forEach(function(order) {
        const currentStatus = String(order.status || "").toUpperCase();
        const nextStatus = migratedStatuses[currentStatus];

        if (nextStatus) {
          updateRow("ORDERS", order.id, {
            status: nextStatus,
            updatedAt: now()
          });
        }
      });
    }

    NAVERA_CACHE = { sheets: {}, headers: {} };

    SpreadsheetApp.flush();
    console.log("Database NAVERA: " + spreadsheet.getUrl());
    Logger.log("Database NAVERA: " + spreadsheet.getUrl());
    if (initialAdmin) {
      const credentials = "Admin awal dibuat. Username: " + initialAdmin.username
        + " | Password: " + initialAdmin.password;
      console.log(credentials);
      Logger.log(credentials);
    }

    return {
      success: true,
      message: "Database NAVERA berhasil disiapkan.",
      spreadsheetId: spreadsheetId,
      spreadsheetUrl: spreadsheet.getUrl(),
      initialAdmin: initialAdmin
    };
  });
}

function ensureSettings() {
  const defaults = {
    businessName: "NAVERA LAUNDRY & CARE",
    tagline: "Every Fabric Deserves the Best Care.",
    phone: "",
    address: "",
    hours: "",
    description: "Layanan laundry dan perawatan pakaian profesional.",
    logoUrl: "",
    currency: "IDR"
  };

  const current = readRows("SETTINGS");
  const existing = {};

  current.forEach(function(row) {
    existing[String(row.key)] = true;
  });

  Object.keys(defaults).forEach(function(key) {
    if (!existing[key]) {
      insertRow("SETTINGS", {
        key: key,
        value: defaults[key],
        updatedAt: now()
      });
    }
  });
}

function getHeaders(name) {
  if (NAVERA_CACHE.headers[name]) return NAVERA_CACHE.headers[name];

  const sheet = getSheet(name);
  const lastColumn = sheet.getLastColumn();

  if (!lastColumn) throw new Error("Header sheet " + name + " belum tersedia.");

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const map = {};

  headers.forEach(function(header, index) {
    map[header] = index;
  });

  NAVERA_CACHE.headers[name] = {
    list: headers,
    map: map
  };

  return NAVERA_CACHE.headers[name];
}

function readRows(name) {
  if (NAVERA_CACHE.sheets[name]) return NAVERA_CACHE.sheets[name];

  const sheet = getSheet(name);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    NAVERA_CACHE.sheets[name] = [];
    return [];
  }

  const headerInfo = getHeaders(name);
  const values = sheet.getRange(2, 1, lastRow - 1, headerInfo.list.length).getValues();

  const rows = values.map(function(valuesRow, index) {
    const item = {
      _row: index + 2
    };

    headerInfo.list.forEach(function(header, column) {
      const value = valuesRow[column];

      item[header] = value instanceof Date
        ? Utilities.formatDate(value, NAVERA.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss")
        : value;
    });

    return item;
  }).filter(function(item) {
    return Object.keys(item).some(function(key) {
      return key !== "_row" && item[key] !== "" && item[key] !== null;
    });
  });

  NAVERA_CACHE.sheets[name] = rows;
  return rows;
}

function invalidateSheet(name) {
  delete NAVERA_CACHE.sheets[name];
}

function insertRow(name, data) {
  const sheet = getSheet(name);
  const headers = getHeaders(name).list;

  const values = headers.map(function(header) {
    return data[header] === undefined ? "" : data[header];
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([values]);
  invalidateSheet(name);

  return data;
}

function findById(name, id, field) {
  const key = field || "id";

  return readRows(name).find(function(row) {
    return String(row[key]) === String(id);
  }) || null;
}

function findMany(name, field, value) {
  return readRows(name).filter(function(row) {
    return String(row[field]) === String(value);
  });
}

function updateRow(name, id, data, idField) {
  const sheet = getSheet(name);
  const headerInfo = getHeaders(name);
  const key = idField || "id";
  const keyIndex = headerInfo.map[key];

  if (keyIndex === undefined) throw new Error("Kolom " + key + " tidak ditemukan.");

  const record = readRows(name).find(function(row) {
    return String(row[key]) === String(id);
  });

  if (!record) throw new Error("Data tidak ditemukan.");

  const rowValues = sheet.getRange(record._row, 1, 1, headerInfo.list.length).getValues()[0];

  Object.keys(data).forEach(function(field) {
    const index = headerInfo.map[field];

    if (index !== undefined) {
      rowValues[index] = data[field];
    }
  });

  sheet.getRange(record._row, 1, 1, headerInfo.list.length).setValues([rowValues]);
  invalidateSheet(name);

  return true;
}

function normalizePhone(phone) {
  let value = String(phone || "").replace(/[^\d+]/g, "");

  if (value.indexOf("+62") === 0) {
    value = "0" + value.substring(3);
  } else if (value.indexOf("62") === 0) {
    value = "0" + value.substring(2);
  }

  return value;
}

function hashPassword(password, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + String(password),
    Utilities.Charset.UTF_8
  );

  return Utilities.base64Encode(bytes);
}

function verifyPassword(password, salt, expected) {
  const storedPassword = String(expected);
  const suppliedPassword = String(password);

  return suppliedPassword === storedPassword
    || hashPassword(suppliedPassword, salt) === storedPassword;
}

function requireFields(data, fields) {
  fields.forEach(function(field) {
    if (data[field] === undefined || data[field] === null || String(data[field]).trim() === "") {
      throw new Error("Kolom " + field + " wajib diisi.");
    }
  });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    phone: user.phone,
    email: user.email,
    role: user.role,
    address: user.address,
    active: isActive(user.active)
  };
}

function createSession(user) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  const expires = new Date(Date.now() + NAVERA.SESSION_HOURS * 60 * 60 * 1000).toISOString();

  updateRow("USERS", user.id, {
    sessionToken: token,
    sessionExpiresAt: expires,
    updatedAt: now()
  });

  return {
    token: token,
    expiresAt: expires,
    user: publicUser(user)
  };
}

function authenticate(token) {
  if (!token) throw new Error("Sesi tidak ditemukan. Silakan login kembali.");

  const user = readRows("USERS").find(function(row) {
    return String(row.sessionToken) === String(token);
  });

  if (!user || !isActive(user.active)) {
    throw new Error("Sesi tidak valid atau akun tidak aktif.");
  }

  if (!user.sessionExpiresAt || new Date(user.sessionExpiresAt).getTime() < Date.now()) {
    updateRow("USERS", user.id, {
      sessionToken: "",
      sessionExpiresAt: "",
      updatedAt: now()
    });

    throw new Error("Sesi telah berakhir. Silakan login kembali.");
  }

  return user;
}

function requireRole(user, roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  if (allowed.indexOf(String(user.role).toUpperCase()) === -1) {
    throw new Error("Kamu tidak memiliki izin untuk melakukan tindakan ini.");
  }
}

function isActive(value) {
  return value === true || String(value).toLowerCase() === "true" || value === 1;
}

function login(payload) {
  const identifier = String(payload.identifier || payload.phone || "").trim();
  requireFields({ identifier: identifier, password: payload.password }, ["identifier", "password"]);

  const user = readRows("USERS").find(function(row) {
    return String(row.username || "").toLowerCase() === identifier.toLowerCase();
  }) || readRows("USERS").find(function(row) {
    return normalizePhone(row.phone) === normalizePhone(identifier);
  });

  if (!user || !isActive(user.active) ||
      !verifyPassword(payload.password, user.passwordSalt, user.passwordHash)) {
    throw new Error("Username/nomor HP atau kata sandi salah.");
  }

  if (["ADMIN", "CUSTOMER", "STAFF"].indexOf(String(user.role).toUpperCase()) === -1) {
    throw new Error("Role akun tidak lagi tersedia. Hubungi administrator.");
  }

  return {
    success: true,
    message: "Login berhasil.",
    data: createSession(user)
  };
}

function registerCustomer(payload) {
  return withLock(function() {
    requireFields(payload, ["name", "username", "phone", "password", "address"]);

    const name = String(payload.name).trim();
    const username = String(payload.username).trim();
    const phone = normalizePhone(payload.phone);
    const password = String(payload.password);

    if (name.length < 2) throw new Error("Nama minimal 2 karakter.");
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) throw new Error("Username harus 3 sampai 30 karakter.");
    if (!/^0\d{8,14}$/.test(phone)) throw new Error("Nomor HP tidak valid.");
    if (password.length < 8) throw new Error("Kata sandi minimal 8 karakter.");

    const duplicate = readRows("USERS").some(function(user) {
      return normalizePhone(user.phone) === phone;
    });

    if (duplicate) throw new Error("Nomor HP sudah terdaftar.");

    const duplicateUsername = readRows("USERS").some(function(user) {
      return String(user.username || "").toLowerCase() === username.toLowerCase();
    });

    if (duplicateUsername) throw new Error("Username sudah digunakan.");

    const salt = Utilities.getUuid();

    insertRow("USERS", {
      id: makeId("USR"),
      name: name,
      username: username,
      phone: phone,
      email: String(payload.email || "").trim(),
      passwordHash: hashPassword(password, salt),
      passwordSalt: salt,
      role: "CUSTOMER",
      address: String(payload.address).trim(),
      active: true,
      createdAt: now(),
      updatedAt: now(),
      sessionToken: "",
      sessionExpiresAt: ""
    });

    return {
      success: true,
      message: "Pendaftaran berhasil. Silakan login."
    };
  });
}

function logout(token) {
  const user = authenticate(token);

  updateRow("USERS", user.id, {
    sessionToken: "",
    sessionExpiresAt: "",
    updatedAt: now()
  });

  return { success: true, message: "Berhasil logout." };
}

function getSettings() {
  const result = {};

  readRows("SETTINGS").forEach(function(row) {
    result[row.key] = row.value;
  });

  return result;
}

function saveSetting(key, value) {
  const existing = findById("SETTINGS", key, "key");

  if (existing) {
    updateRow("SETTINGS", key, {
      value: value,
      updatedAt: now()
    }, "key");
  } else {
    insertRow("SETTINGS", {
      key: key,
      value: value,
      updatedAt: now()
    });
  }
}

function getActiveProducts() {
  return readRows("PRODUCTS").filter(function(product) {
    return isActive(product.active);
  });
}

function getPublicData() {
  const reviews = readRows("REVIEWS").filter(function(review) {
    return isActive(review.approved);
  }).sort(function(a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return {
    success: true,
    data: {
      products: getActiveProducts(),
      paymentMethods: getActivePaymentMethods(),
      reviews: reviews,
      settings: getSettings()
    }
  };
}

function adminGetDashboard() {
  const users = readRows("USERS");
  const orders = readRows("ORDERS");
  const products = readRows("PRODUCTS");
  const payments = readRows("PAYMENTS");
  const paymentMethods = readRows("PAYMENT_METHODS");
  const reviews = readRows("REVIEWS");

  const customers = users.filter(function(user) {
    return String(user.role).toUpperCase() === "CUSTOMER";
  });

  const staff = users.filter(function(user) {
    return String(user.role).toUpperCase() === "STAFF";
  });

  const revenue = payments.filter(function(payment) {
    return String(payment.status).toUpperCase() === "PAID";
  }).reduce(function(total, payment) {
    return total + Number(payment.amount || 0);
  }, 0);

  return {
    success: true,
    data: {
      stats: {
        orders: orders.length,
        customers: customers.length,
        staff: staff.length,
        revenue: revenue,
        pending: orders.filter(function(order) {
          return String(order.status).toUpperCase() === "PENDING";
        }).length,
        active: orders.filter(function(order) {
          return ["ACCEPTED", "PROCESSING", "READY"].indexOf(String(order.status).toUpperCase()) !== -1;
        }).length
      },
      products: products,
      orders: orders,
      customers: customers.map(publicUser),
      staff: staff.map(publicUser),
      payments: payments,
      paymentMethods: paymentMethods,
      reviews: reviews,
      settings: getSettings()
    }
  };
}

function getActivePaymentMethods() {
  return readRows("PAYMENT_METHODS").filter(function(method) {
    return isActive(method.active);
  });
}

function adminSavePaymentMethod(payload) {
  requireFields(payload, ["name", "type"]);

  const id = payload.id || makeId("PMT");
  const existing = findById("PAYMENT_METHODS", id);
  const type = String(payload.type).toUpperCase();

  if (["BANK_TRANSFER", "QRIS"].indexOf(type) === -1) {
    throw new Error("Jenis metode pembayaran tidak valid.");
  }

  const data = {
    id: id,
    name: String(payload.name).trim(),
    type: type,
    accountName: String(payload.accountName || "").trim(),
    accountNumber: String(payload.accountNumber || "").trim(),
    imageUrl: String(payload.imageUrl || "").trim(),
    active: payload.active === undefined ? true : isActive(payload.active),
    createdAt: existing ? existing.createdAt : now(),
    updatedAt: now()
  };

  if (existing) {
    updateRow("PAYMENT_METHODS", id, data);
  } else {
    insertRow("PAYMENT_METHODS", data);
  }

  return { success: true, message: "Metode pembayaran berhasil disimpan.", data: data };
}

function adminSaveProduct(payload) {
  requireFields(payload, ["name", "price", "unit"]);

  const id = payload.id || payload.productId || makeId("PRD");
  const existing = findById("PRODUCTS", id);
  const price = Number(payload.price);

  if (!Number.isFinite(price) || price < 0) throw new Error("Harga produk tidak valid.");

  const data = {
    id: id,
    name: String(payload.name).trim(),
    description: String(payload.description || "").trim(),
    price: price,
    unit: String(payload.unit).trim(),
    imageUrl: String(payload.imageUrl || payload.image_url || ""),
    estimatedTime: String(payload.estimatedTime || ""),
    active: payload.active === undefined ? true : isActive(payload.active),
    createdAt: existing ? existing.createdAt : now(),
    updatedAt: now()
  };

  if (existing) {
    updateRow("PRODUCTS", id, data);
  } else {
    insertRow("PRODUCTS", data);
  }

  return { success: true, message: "Produk berhasil disimpan.", data: data };
}

function adminDeleteProduct(payload) {
  const id = payload.id || payload.productId;
  requireFields({ id: id }, ["id"]);

  const product = findById("PRODUCTS", id);
  if (!product) throw new Error("Produk tidak ditemukan.");

  updateRow("PRODUCTS", id, {
    active: false,
    updatedAt: now()
  });

  return { success: true, message: "Produk berhasil dinonaktifkan." };
}

function adminSaveStaff(payload) {
  requireFields(payload, ["name", "phone"]);

  const id = payload.id || payload.userId || makeId("USR");
  const existing = findById("USERS", id);

  if (existing && String(existing.role).toUpperCase() !== "STAFF") {
    throw new Error("Akun ini bukan akun staff operasional.");
  }

  const phone = normalizePhone(payload.phone);
  if (!/^0\d{8,14}$/.test(phone)) throw new Error("Nomor HP tidak valid.");

  const duplicate = readRows("USERS").some(function(user) {
    return String(user.id) !== String(id) && normalizePhone(user.phone) === phone;
  });

  if (duplicate) throw new Error("Nomor HP sudah digunakan.");

  const data = {
    id: id,
    name: String(payload.name).trim(),
    phone: phone,
    email: String(payload.email || "").trim(),
    role: "STAFF",
    address: String(payload.address || "").trim(),
    active: payload.active === undefined ? true : isActive(payload.active),
    updatedAt: now()
  };

  if (!existing) {
    requireFields(payload, ["password"]);

    if (String(payload.password).length < 8) {
      throw new Error("Kata sandi awal staff minimal 8 karakter.");
    }

    const salt = Utilities.getUuid();

    data.passwordSalt = salt;
    data.passwordHash = hashPassword(payload.password, salt);
    data.createdAt = now();
    data.sessionToken = "";
    data.sessionExpiresAt = "";

    insertRow("USERS", data);
  } else {
    if (payload.password) {
      if (String(payload.password).length < 8) throw new Error("Kata sandi minimal 8 karakter.");

      const salt = Utilities.getUuid();
      data.passwordSalt = salt;
      data.passwordHash = hashPassword(payload.password, salt);
      data.sessionToken = "";
      data.sessionExpiresAt = "";
    }

    if (!data.active) {
      data.sessionToken = "";
      data.sessionExpiresAt = "";
    }

    updateRow("USERS", id, data);
  }

  return { success: true, message: "Data staff berhasil disimpan." };
}

function adminDisableStaff(payload) {
  const id = payload.id || payload.userId || payload.staffId;
  requireFields({ id: id }, ["id"]);

  const staff = findById("USERS", id);

  if (!staff || String(staff.role).toUpperCase() !== "STAFF") {
    throw new Error("Staff tidak ditemukan.");
  }

  updateRow("USERS", id, {
    active: false,
    sessionToken: "",
    sessionExpiresAt: "",
    updatedAt: now()
  });

  return { success: true, message: "Akun staff berhasil dinonaktifkan." };
}

function adminUpdateOrderStatus(payload, admin) {
  return updateOrderStatus(payload, admin, NAVERA.ORDER_STATUSES);
}

function updateOrderStatus(payload, actor, allowedStatuses) {
  return withLock(function() {
    const id = payload.orderId || payload.id;
    const status = String(payload.status || "").toUpperCase();

    requireFields({ id: id, status: status }, ["id", "status"]);

    if (allowedStatuses.indexOf(status) === -1) {
      throw new Error("Akun ini tidak diizinkan mengatur status tersebut.");
    }

    const order = findById("ORDERS", id);
    if (!order) throw new Error("Pesanan tidak ditemukan.");

    const oldStatus = String(order.status).toUpperCase();
    const transitions = NAVERA.ORDER_TRANSITIONS[oldStatus] || [];

    if (transitions.indexOf(status) === -1) {
      throw new Error("Perubahan status tidak diizinkan dari " + oldStatus + " ke " + status + ".");
    }

    const timestamp = now();
    updateRow("ORDERS", id, {
      status: status,
      updatedAt: timestamp,
      completedAt: status === "COMPLETED" ? timestamp : order.completedAt
    });

    addOrderHistory(
      id,
      actor,
      "UPDATE_STATUS",
      oldStatus,
      status,
      "Status diperbarui oleh " + String(actor.role).toLowerCase() + "."
    );

    return { success: true, message: "Status pesanan berhasil diperbarui." };
  });
}

function staffGetDashboard(user) {
  const terminalStatuses = ["COMPLETED", "CANCELLED", "REJECTED"];

  return {
    success: true,
    data: {
      profile: publicUser(user),
      orders: readRows("ORDERS").filter(function(order) {
        return terminalStatuses.indexOf(String(order.status).toUpperCase()) === -1;
      })
    }
  };
}

function staffUpdateOrderStatus(payload, user) {
  return updateOrderStatus(payload, user, ["PROCESSING", "READY", "COMPLETED"]);
}

function adminVerifyPayment(payload, admin) {
  const id = payload.paymentId || payload.id;
  const status = String(payload.status || "PAID").toUpperCase();

  requireFields({ id: id }, ["id"]);

  if (["PAID", "REJECTED"].indexOf(status) === -1) {
    throw new Error("Status pembayaran tidak valid.");
  }

  const payment = findById("PAYMENTS", id);
  if (!payment) throw new Error("Pembayaran tidak ditemukan.");

  updateRow("PAYMENTS", id, {
    status: status,
    verifiedBy: admin.id,
    verifiedAt: now(),
    updatedAt: now()
  });

  const order = findById("ORDERS", payment.orderId);

  if (order) {
    updateRow("ORDERS", order.id, {
      paymentStatus: status,
      updatedAt: now()
    });
  }

  return { success: true, message: "Pembayaran berhasil diperbarui." };
}

function adminApproveReview(payload) {
  const id = payload.id || payload.reviewId;
  requireFields({ id: id }, ["id"]);

  const review = findById("REVIEWS", id);
  if (!review) throw new Error("Ulasan tidak ditemukan.");

  updateRow("REVIEWS", id, {
    approved: payload.approved === false || String(payload.approved) === "false" ? false : true,
    updatedAt: now()
  });

  return { success: true, message: "Ulasan berhasil diperbarui." };
}

function adminSaveSettings(payload) {
  const allowed = ["businessName", "tagline", "phone", "address", "hours", "description", "logoUrl"];

  allowed.forEach(function(key) {
    if (payload[key] !== undefined) saveSetting(key, String(payload[key]));
  });

  return { success: true, message: "Pengaturan berhasil disimpan." };
}

function customerGetDashboard(user) {
  const orders = findMany("ORDERS", "customerId", user.id);
  const payments = readRows("PAYMENTS");
  const reviews = findMany("REVIEWS", "customerId", user.id);
  const reviewedIds = {};

  reviews.forEach(function(review) {
    reviewedIds[String(review.orderId)] = true;
  });

  const customerOrders = orders.map(function(order) {
    const payment = payments.find(function(row) {
      return String(row.orderId) === String(order.id);
    });

    return Object.assign({}, order, {
      paymentStatus: payment ? payment.status : order.paymentStatus,
      reviewed: !!reviewedIds[String(order.id)]
    });
  });

  return {
    success: true,
    data: {
      profile: publicUser(user),
      products: getActiveProducts(),
      paymentMethods: getActivePaymentMethods(),
      orders: customerOrders,
      settings: getSettings()
    }
  };
}

function customerCreateOrder(payload, user) {
  return withLock(function() {
    requireFields(payload, ["productId", "quantity", "deliveryType", "address", "pickupSchedule", "paymentMethod"]);

    const product = findById("PRODUCTS", payload.productId);

    if (!product || !isActive(product.active)) {
      throw new Error("Layanan tidak tersedia.");
    }

    const quantity = Number(payload.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      throw new Error("Jumlah pesanan tidak valid.");
    }

    const schedule = new Date(payload.pickupSchedule);

    if (Number.isNaN(schedule.getTime()) || schedule.getTime() < Date.now() - 60000) {
      throw new Error("Jadwal penjemputan tidak valid.");
    }

    const deliveryType = String(payload.deliveryType).toUpperCase();
    const requestedPaymentMethod = String(payload.paymentMethod || "").trim();

    if (["PICKUP_DELIVERY", "DROP_OFF"].indexOf(deliveryType) === -1) {
      throw new Error("Metode layanan tidak valid.");
    }

    let paymentMethodRecord = null;
    let paymentMethodType = requestedPaymentMethod.toUpperCase();

    if (paymentMethodType !== "CASH") {
      paymentMethodRecord = findById("PAYMENT_METHODS", requestedPaymentMethod);

      if (!paymentMethodRecord || !isActive(paymentMethodRecord.active)) {
        throw new Error("Metode pembayaran tidak tersedia. Muat ulang halaman dan coba lagi.");
      }

      paymentMethodType = String(paymentMethodRecord.type).toUpperCase();

      if (["BANK_TRANSFER", "QRIS"].indexOf(paymentMethodType) === -1) {
        throw new Error("Metode pembayaran tidak valid.");
      }
    }

    const price = Number(product.price);
    const subtotal = Math.round(price * quantity);
    const id = makeId("ORD");

    const order = {
      id: id,
      customerId: user.id,
      customerName: user.name,
      customerPhone: user.phone,
      productId: product.id,
      productName: product.name,
      quantity: quantity,
      unit: product.unit,
      unitPrice: price,
      subtotal: subtotal,
      deliveryType: deliveryType,
      address: String(payload.address).trim(),
      pickupSchedule: schedule.toISOString(),
      paymentMethod: paymentMethodRecord ? paymentMethodRecord.id : "CASH",
      paymentStatus: "UNPAID",
      status: "PENDING",
      notes: String(payload.notes || "").trim(),
      total: subtotal,
      createdAt: now(),
      updatedAt: now(),
      completedAt: ""
    };

    insertRow("ORDERS", order);

    insertRow("ORDER_ITEMS", {
      id: makeId("ITM"),
      orderId: id,
      productId: product.id,
      productName: product.name,
      quantity: quantity,
      unit: product.unit,
      unitPrice: price,
      subtotal: subtotal,
      createdAt: now()
    });

    insertRow("PAYMENTS", {
      id: makeId("PAY"),
      orderId: id,
      customerId: user.id,
      method: paymentMethodType,
      amount: subtotal,
      status: "UNPAID",
      proofUrl: "",
      verifiedBy: "",
      verifiedAt: "",
      createdAt: now(),
      updatedAt: now()
    });

    addOrderHistory(id, user, "CREATE_ORDER", "", "PENDING", "Pesanan dibuat oleh pelanggan.");

    return {
      success: true,
      message: "Pesanan berhasil dibuat.",
      data: { orderId: id }
    };
  });
}

function customerSubmitPayment(payload, user) {
  return withLock(function() {
    requireFields(payload, ["orderId", "fileName", "mimeType", "base64"]);

    const order = findById("ORDERS", payload.orderId);
    if (!order || String(order.customerId) !== String(user.id)) {
      throw new Error("Pesanan tidak ditemukan.");
    }

    const payment = readRows("PAYMENTS").find(function(row) {
      return String(row.orderId) === String(order.id);
    });

    if (!payment) throw new Error("Data pembayaran pesanan tidak ditemukan.");
    if (String(payment.method).toUpperCase() === "CASH") {
      throw new Error("Pembayaran tunai tidak memerlukan bukti transfer.");
    }
    if (["PAID", "WAITING_VERIFICATION"].indexOf(String(payment.status).toUpperCase()) !== -1) {
      throw new Error("Pembayaran sudah dikirim atau sudah diverifikasi.");
    }

    const mimeType = String(payload.mimeType).toLowerCase();
    if (["image/jpeg", "image/png", "image/webp"].indexOf(mimeType) === -1) {
      throw new Error("Bukti pembayaran harus berupa JPG, PNG, atau WEBP.");
    }

    const bytes = Utilities.base64Decode(String(payload.base64));
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
      throw new Error("Ukuran bukti pembayaran harus lebih dari 0 dan maksimal 5 MB.");
    }

    const folders = DriveApp.getFoldersByName("NAVERA_LAUNDRY_FILES");
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("NAVERA_LAUNDRY_FILES");
    const blob = Utilities.newBlob(bytes, mimeType, String(payload.fileName).substring(0, 100));
    const file = folder.createFile(blob);

    updateRow("PAYMENTS", payment.id, {
      status: "WAITING_VERIFICATION",
      proofUrl: file.getUrl(),
      updatedAt: now()
    });
    updateRow("ORDERS", order.id, {
      paymentStatus: "WAITING_VERIFICATION",
      updatedAt: now()
    });

    return { success: true, message: "Bukti pembayaran berhasil dikirim dan menunggu verifikasi." };
  });
}

function customerGetOrderDetail(payload, user) {
  const id = payload.orderId || payload.id;
  requireFields({ id: id }, ["id"]);

  const order = findById("ORDERS", id);

  if (!order || String(order.customerId) !== String(user.id)) {
    throw new Error("Pesanan tidak ditemukan.");
  }

  const items = findMany("ORDER_ITEMS", "orderId", id);
  const payment = readRows("PAYMENTS").find(function(row) {
    return String(row.orderId) === String(id);
  });
  const paymentMethod = payment && order.paymentMethod !== "CASH"
    ? findById("PAYMENT_METHODS", order.paymentMethod)
    : null;

  return {
    success: true,
    data: Object.assign({}, order, {
      orderId: order.id,
      items: items,
      paymentStatus: payment ? payment.status : order.paymentStatus,
      payment: payment,
      paymentMethodDetails: paymentMethod
    })
  };
}

function customerUpdateProfile(payload, user) {
  const data = {};

  ["name", "phone", "email", "address"].forEach(function(key) {
    if (payload[key] !== undefined) data[key] = String(payload[key]).trim();
  });

  if (data.name !== undefined && data.name.length < 2) {
    throw new Error("Nama minimal 2 karakter.");
  }

  if (data.phone !== undefined) {
    data.phone = normalizePhone(data.phone);

    const duplicate = readRows("USERS").some(function(row) {
      return String(row.id) !== String(user.id) && normalizePhone(row.phone) === data.phone;
    });

    if (duplicate) throw new Error("Nomor HP sudah digunakan.");
  }

  data.updatedAt = now();
  updateRow("USERS", user.id, data);

  return { success: true, message: "Profil berhasil diperbarui." };
}

function customerSubmitReview(payload, user) {
  return withLock(function() {
    requireFields(payload, ["orderId", "rating", "comment"]);

    const order = findById("ORDERS", payload.orderId);

    if (!order || String(order.customerId) !== String(user.id)) {
      throw new Error("Pesanan tidak ditemukan.");
    }

    const payment = readRows("PAYMENTS").find(function(row) {
      return String(row.orderId) === String(order.id);
    });
    const paymentStatus = String(payment ? payment.status : order.paymentStatus || "").trim().toUpperCase();

    if (paymentStatus !== "PAID") {
      throw new Error("Ulasan baru dapat diberikan setelah pembayaran disetujui admin.");
    }

    if (readRows("REVIEWS").some(function(review) {
      return String(review.orderId) === String(order.id);
    })) {
      throw new Error("Pesanan ini sudah memiliki ulasan.");
    }

    const rating = Number(payload.rating);
    const comment = String(payload.comment).trim();

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error("Rating harus antara 1 sampai 5.");
    }

    if (!comment || comment.length > 1000) {
      throw new Error("Ulasan wajib diisi dan maksimal 1000 karakter.");
    }

    const review = {
      id: makeId("REV"),
      orderId: order.id,
      customerId: user.id,
      customerName: user.name,
      rating: rating,
      comment: comment,
      approved: false,
      createdAt: now(),
      updatedAt: now()
    };

    insertRow("REVIEWS", review);
    SpreadsheetApp.flush();

    const savedReview = findById("REVIEWS", review.id);

    if (!savedReview) {
      throw new Error("Ulasan belum tersimpan di sheet REVIEWS. Silakan coba lagi.");
    }

    return {
      success: true,
      message: "Ulasan berhasil disimpan dan menunggu moderasi.",
      data: { reviewId: review.id, persisted: true }
    };
  });
}

function addOrderHistory(orderId, actor, action, oldStatus, newStatus, description) {
  insertRow("ORDER_HISTORY", {
    id: makeId("HIS"),
    orderId: orderId,
    actorId: actor.id,
    actorRole: actor.role,
    action: action,
    oldStatus: oldStatus || "",
    newStatus: newStatus || "",
    description: description || "",
    createdAt: now()
  });
}

function adminUploadFile(payload, admin) {
  requireRole(admin, "ADMIN");
  requireFields(payload, ["fileName", "mimeType", "base64"]);

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (allowedTypes.indexOf(String(payload.mimeType).toLowerCase()) === -1) {
    throw new Error("Format file tidak didukung.");
  }

  const bytes = Utilities.base64Decode(payload.base64);

  if (bytes.length > 5 * 1024 * 1024) {
    throw new Error("Ukuran gambar maksimal 5 MB.");
  }

  const folders = DriveApp.getFoldersByName("NAVERA_LAUNDRY_FILES");
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("NAVERA_LAUNDRY_FILES");
  const blob = Utilities.newBlob(bytes, payload.mimeType, payload.fileName);
  const file = folder.createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    success: true,
    data: {
      fileId: file.getId(),
      url: file.getUrl(),
      downloadUrl: "https://drive.google.com/uc?export=view&id=" + file.getId()
    }
  };
}

function dispatch(action, payload, token) {
  if (action === "login") return login(payload);
  if (action === "register") return registerCustomer(payload);
  if (action === "getPublicData") return getPublicData();

  if (action === "getSession") {
    const user = authenticate(token);
    return { success: true, data: { user: publicUser(user) } };
  }

  if (action === "logout") return logout(token);

  const user = authenticate(token);

  const handlers = {
    adminGetDashboard: function() {
      requireRole(user, "ADMIN");
      return adminGetDashboard();
    },
    adminSaveProduct: function() {
      requireRole(user, "ADMIN");
      return adminSaveProduct(payload);
    },
    adminDeleteProduct: function() {
      requireRole(user, "ADMIN");
      return adminDeleteProduct(payload);
    },
    adminUpdateOrderStatus: function() {
      requireRole(user, "ADMIN");
      return adminUpdateOrderStatus(payload, user);
    },
    adminSaveStaff: function() {
      requireRole(user, "ADMIN");
      return adminSaveStaff(payload);
    },
    adminDisableStaff: function() {
      requireRole(user, "ADMIN");
      return adminDisableStaff(payload);
    },
    adminVerifyPayment: function() {
      requireRole(user, "ADMIN");
      return adminVerifyPayment(payload, user);
    },
    adminSavePaymentMethod: function() {
      requireRole(user, "ADMIN");
      return adminSavePaymentMethod(payload);
    },
    adminApproveReview: function() {
      requireRole(user, "ADMIN");
      return adminApproveReview(payload);
    },
    adminSaveSettings: function() {
      requireRole(user, "ADMIN");
      return adminSaveSettings(payload);
    },
    adminUploadFile: function() {
      return adminUploadFile(payload, user);
    },
    customerGetDashboard: function() {
      requireRole(user, "CUSTOMER");
      return customerGetDashboard(user);
    },
    customerCreateOrder: function() {
      requireRole(user, "CUSTOMER");
      return customerCreateOrder(payload, user);
    },
    customerSubmitPayment: function() {
      requireRole(user, "CUSTOMER");
      return customerSubmitPayment(payload, user);
    },
    customerGetOrderDetail: function() {
      requireRole(user, "CUSTOMER");
      return customerGetOrderDetail(payload, user);
    },
    customerUpdateProfile: function() {
      requireRole(user, "CUSTOMER");
      return customerUpdateProfile(payload, user);
    },
    customerSubmitReview: function() {
      requireRole(user, "CUSTOMER");
      return customerSubmitReview(payload, user);
    },
    staffGetDashboard: function() {
      requireRole(user, "STAFF");
      return staffGetDashboard(user);
    },
    staffUpdateOrderStatus: function() {
      requireRole(user, "STAFF");
      return staffUpdateOrderStatus(payload, user);
    }
  };

  if (!handlers[action]) {
    throw new Error("Aksi API tidak dikenal: " + action);
  }

  return handlers[action]();
}
