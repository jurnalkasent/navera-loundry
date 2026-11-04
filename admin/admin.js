(() => {
  "use strict";

  const API = window.NaveraAPI;
  const CONFIG = window.NAVERA_CONFIG || {};

  const state = {
    user: null,
    page: "dashboard",
    products: [],
    orders: [],
    users: [],
    staff: [],
    payments: [],
    paymentMethods: [],
    reviews: [],
    settings: {},
    selectedOrder: null,
    loading: false
  };

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);

  const formatRupiah = value => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);

  const formatDate = value => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
  };

  const statusLabel = status => ({
    PENDING: "Menunggu",
    ACCEPTED: "Diterima",
    REJECTED: "Ditolak",
    PROCESSING: "Sedang Dicuci",
    READY: "Siap Diambil",
    COMPLETED: "Selesai",
    CANCELLED: "Dibatalkan",
    UNPAID: "Belum Dibayar",
    WAITING_VERIFICATION: "Menunggu Verifikasi",
    PAID: "Lunas",
    REFUNDED: "Dikembalikan"
  })[String(status || "").toUpperCase()] || status || "-";

  const statusClass = status => {
    const value = String(status || "").toUpperCase();

    if (["COMPLETED", "PAID", "ACCEPTED"].includes(value)) return "success";
    if (["PENDING", "WAITING_VERIFICATION", "PROCESSING"].includes(value)) return "warning";
    if (["REJECTED", "CANCELLED", "UNPAID"].includes(value)) return "danger";

    return "";
  };

  function toast(message, type = "success") {
    const container = $("#adminToastContainer");

    if (!container) {
      alert(message);
      return;
    }

    const item = document.createElement("div");
    item.className = `navera-toast navera-toast-${type}`;
    item.textContent = message;
    container.appendChild(item);

    setTimeout(() => item.remove(), 3500);
  }

  function loading(show, message = "Memproses data...") {
    let overlay = $("#loadingOverlay");

    if (!overlay && show) {
      overlay = document.createElement("div");
      overlay.id = "loadingOverlay";
      overlay.className = "loading-overlay";
      overlay.innerHTML = `
        <div class="loading-spinner"></div>
        <span id="loadingMessage"></span>
      `;
      document.body.appendChild(overlay);
    }

    if (!overlay) return;

    overlay.hidden = !show;

    const label = $("#loadingMessage", overlay);
    if (label) label.textContent = message;
  }

  function getSessionUser() {
    if (!API || typeof API.getSession !== "function") return null;
    return API.getSession();
  }

  function logout() {
    if (window.NaveraUtils) {
      window.NaveraUtils.logout();
      return;
    }

    window.location.href = "../auth/login.html";
  }

  async function request(action, payload = {}) {
    if (!API || typeof API.request !== "function") {
      throw new Error("API NAVERA belum tersedia. Periksa shared/api.js.");
    }

    return API.request(action, payload);
  }

  function getData(response) {
    if (!response) return [];
    if (Array.isArray(response)) return response;

    if (response.data !== undefined) {
      return response.data;
    }

    return response;
  }

  async function loadData() {
    loading(true, "Mengambil data operasional...");

    try {
      const response = await request("adminGetDashboard");

      if (!response || response.success === false) {
        throw new Error(response?.message || "Gagal mengambil data dashboard.");
      }

      const data = response.data || response;

      state.products = data.products || [];
      state.orders = data.orders || [];
      state.users = data.customers || [];
      state.staff = data.staff || [];
      state.payments = data.payments || [];
      state.paymentMethods = data.paymentMethods || [];
      state.reviews = data.reviews || [];
      state.settings = data.settings || {};

      renderDashboard();
      renderProducts();
      renderOrders();
      renderCustomers();
      renderStaff();
      renderPayments();
      renderPaymentMethods();
      renderReviews();
      renderSettings();
    } catch (error) {
      console.error(error);
      toast(error.message || "Gagal memuat data.", "error");
    } finally {
      loading(false);
    }
  }

  function renderDashboard() {
    const completed = state.orders.filter(order => order.status === "COMPLETED");
    const pending = state.orders.filter(order => order.status === "PENDING");
    const active = state.orders.filter(order => ![
      "COMPLETED",
      "CANCELLED",
      "REJECTED"
    ].includes(order.status));

    const revenue = completed.reduce((sum, order) => sum + Number(order.total || 0), 0);

    setText("#adminStatOrders", state.orders.length);
    setText("#adminStatCustomers", state.users.length);
    setText("#adminStatRevenue", formatRupiah(revenue));
    setText("#adminStatActiveOrders", active.length);
    setText("#adminWaitingOrders", pending.length);
    setText("#adminWaitingPayments", state.payments.filter(payment =>
      String(payment.status).toUpperCase() === "WAITING_VERIFICATION"
    ).length);
    setText("#adminActiveStaff", state.staff.filter(user => user.active !== false).length);
    setText("#adminActiveProducts", state.products.filter(product => product.active !== false).length);
    setText("#pendingOrderBadge", pending.length);

    const latest = [...state.orders]
      .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))
      .slice(0, 7);

    const table = $("#adminRecentOrders");

    if (table) {
      table.innerHTML = latest.length
        ? latest.map(order => `
          <tr>
            <td>${escapeHTML(order.orderCode || order.orderId || order.id || "-")}</td>
            <td>${escapeHTML(order.customerName || order.customer_name || "-")}</td>
            <td>${formatRupiah(order.total)}</td>
            <td><span class="status-badge ${statusClass(order.status)}">${escapeHTML(statusLabel(order.status))}</span></td>
          </tr>
        `).join("")
        : `<tr><td colspan="4">Belum ada pesanan.</td></tr>`;
    }
  }

  function renderProducts() {
    const container = $("#adminProductsGrid");
    if (!container) return;

    container.innerHTML = state.products.map(product => `
      <article class="product-card">
        ${product.imageUrl ? `<img src="${escapeHTML(product.imageUrl)}" alt="${escapeHTML(product.name)}">` : ""}
        <h3>${escapeHTML(product.name)}</h3>
        <p>${escapeHTML(product.description || "Layanan laundry NAVERA.")}</p>
        <strong>${formatRupiah(product.price)} / ${escapeHTML(product.unit || "-")}</strong>
        <p>${product.active === false ? "Nonaktif" : "Aktif"} · ${escapeHTML(product.estimatedTime || "Estimasi belum diatur")}</p>
        <div class="card-actions">
          <button class="table-action" data-edit-product="${escapeHTML(product.id)}">Edit</button>
          <button class="table-action delete-button" data-delete-product="${escapeHTML(product.id)}">Hapus</button>
        </div>
      </article>
    `).join("") || `<div class="staff-empty">Belum ada produk.</div>`;
  }

  function renderOrders() {
    const container = $("#adminOrdersTable");
    if (!container) return;

    container.innerHTML = state.orders.map(order => `
      <tr data-status="${escapeHTML(String(order.status || "").toUpperCase())}">
        <td>${escapeHTML(order.orderCode || order.id || "-")}</td>
        <td>${escapeHTML(order.customerName || "-")}</td>
        <td>${formatDate(order.createdAt || order.created_at)}</td>
        <td>${formatRupiah(order.total)}</td>
        <td><span class="status-badge ${statusClass(order.status)}">${escapeHTML(statusLabel(order.status))}</span></td>
        <td>
          <button class="table-action" data-view-order="${escapeHTML(order.id)}">Detail</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="6">Belum ada pesanan.</td></tr>`;
  }

  function renderCustomers() {
    const container = $("#adminCustomersTable");
    if (!container) return;

    container.innerHTML = state.users.map(user => `
      <tr>
        <td>${escapeHTML(user.name || user.username || "-")}</td>
        <td>${escapeHTML(user.phone || "-")}</td>
        <td>${escapeHTML(user.address || "-")}</td>
        <td>${user.active === false ? "Nonaktif" : "Aktif"}</td>
        <td>
          <span>${escapeHTML(user.email || "-")}</span>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="5">Belum ada pelanggan.</td></tr>`;
  }

  function renderStaff() {
    const container = $("#adminStaffTable");
    if (!container) return;

    container.innerHTML = state.staff.map(staff => `
      <tr>
        <td>${escapeHTML(staff.name || staff.username || "-")}</td>
        <td>${escapeHTML(staff.phone || "-")}</td>
        <td>${escapeHTML(staff.address || "-")}</td>
        <td>${staff.active === false ? "Nonaktif" : "Aktif"}</td>
        <td>
          <button class="table-action" data-edit-staff="${escapeHTML(staff.id)}">Edit</button>
          <button class="table-action delete-button" data-delete-staff="${escapeHTML(staff.id)}">Nonaktifkan</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="5">Belum ada staff operasional.</td></tr>`;
  }

  function renderPayments() {
    const container = $("#adminPaymentsTable");
    if (!container) return;

    container.innerHTML = state.payments.map(payment => `
      <tr>
        <td>${escapeHTML(payment.orderCode || payment.orderId || "-")}</td>
        <td>${escapeHTML(paymentMethodLabel(payment))}</td>
        <td>${formatRupiah(payment.amount)}</td>
        <td><span class="status-badge ${statusClass(payment.status)}">${escapeHTML(statusLabel(payment.status))}</span></td>
        <td>
          ${String(payment.status).toUpperCase() === "WAITING_VERIFICATION"
            ? `<a class="table-action" href="${escapeHTML(payment.proofUrl || "#")}" ${payment.proofUrl ? 'target="_blank" rel="noopener"' : ""}>Lihat Bukti</a><button class="table-action" data-verify-payment="${escapeHTML(payment.id)}" data-payment-status="PAID">Verifikasi</button><button class="table-action delete-button" data-verify-payment="${escapeHTML(payment.id)}" data-payment-status="REJECTED">Tolak</button>`
            : String(payment.status).toUpperCase() === "UNPAID" && String(payment.method).toUpperCase() === "CASH"
              ? `<button class="table-action" data-verify-payment="${escapeHTML(payment.id)}" data-payment-status="PAID">Tandai Dibayar</button>`
              : "-"}
        </td>
      </tr>
    `).join("") || `<tr><td colspan="5">Belum ada pembayaran.</td></tr>`;

    setText("#paymentWaitingCount", state.payments.filter(payment =>
      String(payment.status).toUpperCase() === "WAITING_VERIFICATION"
    ).length);
    setText("#paymentSuccessCount", state.payments.filter(payment =>
      String(payment.status).toUpperCase() === "PAID"
    ).length);
  }

  function paymentMethodLabel(payment) {
    const order = state.orders.find(item => String(item.id) === String(payment.orderId));
    const method = state.paymentMethods.find(item =>
      String(item.id) === String(order?.paymentMethod || "")
    );

    return method ? method.name : payment.method || "-";
  }

  function renderPaymentMethods() {
    const container = $("#adminPaymentMethods");
    if (!container) return;

    container.innerHTML = state.paymentMethods.map(method => `
      <article class="payment-method-card">
        <div>
          <strong>${escapeHTML(method.name || method.type)}</strong>
          <span>${escapeHTML(statusLabel(method.type))}</span>
          ${method.accountNumber ? `<p>${escapeHTML(method.accountNumber)}${method.accountName ? ` · ${escapeHTML(method.accountName)}` : ""}</p>` : ""}
          <small>${method.active === false ? "Nonaktif" : "Aktif"}</small>
        </div>
        <div>
          <button type="button" class="table-action" data-edit-payment-method="${escapeHTML(method.id)}">Edit</button>
          <button type="button" class="table-action" data-toggle-payment-method="${escapeHTML(method.id)}" data-active="${method.active === false ? "true" : "false"}">${method.active === false ? "Aktifkan" : "Nonaktifkan"}</button>
        </div>
      </article>
    `).join("") || `<div class="staff-empty">Belum ada metode transfer atau QRIS. Pelanggan tetap dapat memilih pembayaran tunai.</div>`;
  }

  function renderReviews() {
    const container = $("#adminReviewsList");
    if (!container) return;

    container.innerHTML = state.reviews.map(review => `
      <article class="review-card">
        <h3>${escapeHTML(review.customerName || "Pelanggan")} · ${"★".repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}</h3>
        <p>${escapeHTML(review.comment || "-")}</p>
        <p>${review.approved === false ? "Menunggu moderasi" : "Ditampilkan"}</p>
          ${review.approved === false
            ? `<button class="table-action" data-approve-review="${escapeHTML(review.id)}">Setujui</button>`
            : "-"}
      </article>
    `).join("") || `<div class="staff-empty">Belum ada ulasan.</div>`;
  }

  function renderSettings() {
    const fields = {
      "#settingBusinessName": state.settings.businessName,
      "#settingPhone": state.settings.phone,
      "#settingAddress": state.settings.address,
      "#settingHours": state.settings.hours,
      "#settingTagline": state.settings.tagline
    };

    Object.entries(fields).forEach(([selector, value]) => {
      const element = $(selector);
      if (element && value !== undefined) element.value = value;
    });
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function openModal(title, content) {
    const modal = $("#adminModal");
    if (!modal) {
      toast("Elemen modal belum tersedia di admin.html.", "error");
      return;
    }

    const heading = $("#adminModalTitle");
    const body = $("#adminModalBody");

    if (heading) heading.textContent = title;
    if (body) body.innerHTML = content;

    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const modal = $("#adminModal");
    if (modal) modal.hidden = true;
    document.body.style.overflow = "";
  }

  function productForm(product = {}) {
    openModal(product.id ? "Edit Produk" : "Tambah Produk", `
      <form id="productForm" class="customer-form">
        <label>Nama Layanan
          <input name="name" required value="${escapeHTML(product.name || "")}">
        </label>
        <label>Harga
          <input name="price" type="number" min="0" required value="${escapeHTML(product.price || "")}">
        </label>
        <label>Satuan
          <input name="unit" required placeholder="kg, pcs, pasang" value="${escapeHTML(product.unit || "")}">
        </label>
        <label>Estimasi Pengerjaan
          <input name="estimatedTime" placeholder="Contoh: 2 hari" value="${escapeHTML(product.estimatedTime || "")}">
        </label>
        <label>Deskripsi
          <textarea name="description" rows="3">${escapeHTML(product.description || "")}</textarea>
        </label>
        <label>URL Gambar
          <input name="imageUrl" type="url" value="${escapeHTML(product.imageUrl || "")}">
        </label>
        <label>Status
          <select name="active">
            <option value="true" ${product.active !== false ? "selected" : ""}>Aktif</option>
            <option value="false" ${product.active === false ? "selected" : ""}>Nonaktif</option>
          </select>
        </label>
        <button class="primary-button" type="submit">Simpan Produk</button>
      </form>
    `);

    $("#productForm")?.addEventListener("submit", async event => {
      event.preventDefault();

      const form = new FormData(event.currentTarget);
      const data = Object.fromEntries(form.entries());

      data.id = product.id || "";
      data.price = Number(data.price);
      data.active = data.active === "true";

      await saveRecord("adminSaveProduct", data, "Produk berhasil disimpan.");
    });
  }

  function staffForm(staff = {}) {
    openModal(staff.id ? "Edit Staff" : "Tambah Staff", `
      <form id="staffForm" class="customer-form">
        <label>Nama Staff
          <input name="name" required value="${escapeHTML(staff.name || "")}">
        </label>
        <label>Nomor HP
          <input name="phone" required value="${escapeHTML(staff.phone || "")}">
        </label>
        <label>Alamat
          <textarea name="address" rows="2">${escapeHTML(staff.address || "")}</textarea>
        </label>
        <label>Password ${staff.id ? "(kosongkan jika tidak diganti)" : ""}
          <input name="password" type="password" ${staff.id ? "" : "required"} minlength="8">
        </label>
        <label>Status
          <select name="active">
            <option value="true" ${staff.active !== false ? "selected" : ""}>Aktif</option>
            <option value="false" ${staff.active === false ? "selected" : ""}>Nonaktif</option>
          </select>
        </label>
        <button class="primary-button" type="submit">Simpan Staff</button>
      </form>
    `);

    $("#staffForm")?.addEventListener("submit", async event => {
      event.preventDefault();

      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      data.id = staff.id || "";
      data.active = data.active === "true";

      await saveRecord("adminSaveStaff", data, "Data staff berhasil disimpan.");
    });
  }

  function paymentMethodForm(method = {}) {
    openModal(method.id ? "Edit Metode Pembayaran" : "Tambah Metode Pembayaran", `
      <form id="paymentMethodForm" class="customer-form">
        <label>Nama Metode
          <input name="name" required maxlength="80" placeholder="Contoh: BCA NAVERA" value="${escapeHTML(method.name || "")}">
        </label>
        <label>Jenis
          <select name="type" required>
            <option value="BANK_TRANSFER" ${method.type !== "QRIS" ? "selected" : ""}>Transfer Bank</option>
            <option value="QRIS" ${method.type === "QRIS" ? "selected" : ""}>QRIS</option>
          </select>
        </label>
        <label>Nama Pemilik Rekening
          <input name="accountName" maxlength="100" value="${escapeHTML(method.accountName || "")}">
        </label>
        <label>Nomor Rekening
          <input name="accountNumber" maxlength="50" value="${escapeHTML(method.accountNumber || "")}">
        </label>
        <label>URL Gambar QR (opsional)
          <input name="imageUrl" type="url" value="${escapeHTML(method.imageUrl || "")}">
        </label>
        <label>Status
          <select name="active">
            <option value="true" ${method.active === false ? "" : "selected"}>Aktif</option>
            <option value="false" ${method.active === false ? "selected" : ""}>Nonaktif</option>
          </select>
        </label>
        <button class="primary-button" type="submit">Simpan Metode Pembayaran</button>
      </form>
    `);

    $("#paymentMethodForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      data.id = method.id || "";
      data.active = data.active === "true";
      await saveRecord("adminSavePaymentMethod", data, "Metode pembayaran berhasil disimpan.");
    });
  }

  function orderDetails(order) {
    if (!order) return;

    state.selectedOrder = order;

    openModal("Detail Pesanan", `
      <div class="summary-list">
        <div><span>Kode Pesanan</span><strong>${escapeHTML(order.orderCode || order.id)}</strong></div>
        <div><span>Pelanggan</span><strong>${escapeHTML(order.customerName || "-")}</strong></div>
        <div><span>Nomor HP</span><strong>${escapeHTML(order.customerPhone || "-")}</strong></div>
        <div><span>Alamat</span><strong>${escapeHTML(order.address || "-")}</strong></div>
        <div><span>Total</span><strong>${formatRupiah(order.total)}</strong></div>
        <div><span>Status</span><strong>${escapeHTML(statusLabel(order.status))}</strong></div>
      </div>
      ${({
        PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
        ACCEPTED: ["PROCESSING", "CANCELLED"],
        PROCESSING: ["READY"],
        READY: ["COMPLETED"]
      }[String(order.status || "").toUpperCase()] || []).length ? `<form id="orderStatusForm" class="customer-form" style="margin-top:20px">
        <label>Perbarui Status
          <select name="status">
            ${( {
              PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
              ACCEPTED: ["PROCESSING", "CANCELLED"],
              PROCESSING: ["READY"],
              READY: ["COMPLETED"]
            }[String(order.status || "").toUpperCase()] || []
            ).map(status => `
              <option value="${status}" ${order.status === status ? "selected" : ""}>${statusLabel(status)}</option>
            `).join("")}
          </select>
        </label>
        <button class="primary-button" type="submit">Simpan Status</button>
      </form>` : ""}
    `);

    $("#orderStatusForm")?.addEventListener("submit", async event => {
      event.preventDefault();

      const status = new FormData(event.currentTarget).get("status");

      await saveRecord("adminUpdateOrderStatus", {
        orderId: order.id,
        status
      }, "Status pesanan berhasil diperbarui.");
    });
  }

  async function saveRecord(action, data, successMessage) {
    loading(true);

    try {
      const response = await request(action, data);

      if (!response || response.success === false) {
        throw new Error(response?.message || "Gagal menyimpan data.");
      }

      closeModal();
      toast(successMessage);
      await loadData();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      loading(false);
    }
  }

  async function confirmAction(message, action, payload, successMessage) {
    if (!confirm(message)) return;

    await saveRecord(action, payload, successMessage);
  }

  function showPage(page) {
    state.page = page;

    $$(".admin-page").forEach(element => {
      const active = element.dataset.page === page;
      element.classList.toggle("active", active);
      element.hidden = !active;
    });

    $$(".sidebar-link[data-page]").forEach(element => {
      element.classList.toggle("active", element.dataset.page === page);
    });

    const titles = {
      dashboard: "Dashboard",
      orders: "Pesanan",
      products: "Produk & Layanan",
      customers: "Pembeli",
      staff: "Staff Operasional",
      payments: "Pembayaran",
      reviews: "Ulasan",
      settings: "Pengaturan"
    };
    setText("#adminPageTitle", titles[page] || "NAVERA");

    if (window.innerWidth <= 800) closeSidebar();
  }

  function openSidebar() {
    $("#adminSidebar")?.classList.add("open");
    $("#sidebarOverlay")?.classList.add("show");
  }

  function closeSidebar() {
    $("#adminSidebar")?.classList.remove("open");
    $("#sidebarOverlay")?.classList.remove("show");
  }

  function bindEvents() {
    $("#adminMenuToggle")?.addEventListener("click", openSidebar);
    $("#adminSidebarOverlay")?.addEventListener("click", closeSidebar);

    $("#adminLogoutButton")?.addEventListener("click", logout);
    $$("[data-close-modal]").forEach(button => button.addEventListener("click", closeModal));
    $("#refreshOrdersButton")?.addEventListener("click", loadData);
    $$("[data-open-page]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.openPage)));

    $$(".sidebar-link[data-page]").forEach(link => {
      link.addEventListener("click", () => showPage(link.dataset.page));
    });

    $("#addProductButton")?.addEventListener("click", () => productForm());
    $("#addStaffButton")?.addEventListener("click", () => staffForm());
    $("#addPaymentMethodButton")?.addEventListener("click", () => paymentMethodForm());

    document.addEventListener("click", event => {
      const editProduct = event.target.closest("[data-edit-product]");
      const deleteProduct = event.target.closest("[data-delete-product]");
      const viewOrder = event.target.closest("[data-view-order]");
      const editStaff = event.target.closest("[data-edit-staff]");
      const deleteStaff = event.target.closest("[data-delete-staff]");
      const verifyPayment = event.target.closest("[data-verify-payment]");
      const editPaymentMethod = event.target.closest("[data-edit-payment-method]");
      const togglePaymentMethod = event.target.closest("[data-toggle-payment-method]");
      const approveReview = event.target.closest("[data-approve-review]");

      if (editProduct) {
        const product = state.products.find(item => String(item.id) === editProduct.dataset.editProduct);
        if (product) productForm(product);
      }

      if (deleteProduct) {
        confirmAction(
          "Apakah Anda yakin ingin menghapus produk ini?",
          "adminDeleteProduct",
          { id: deleteProduct.dataset.deleteProduct },
          "Produk berhasil dihapus."
        );
      }

      if (viewOrder) {
        const order = state.orders.find(item => String(item.id) === viewOrder.dataset.viewOrder);
        orderDetails(order);
      }

      if (editStaff) {
        const staff = state.staff.find(item => String(item.id) === editStaff.dataset.editStaff);
        if (staff) staffForm(staff);
      }

      if (deleteStaff) {
        confirmAction(
          "Nonaktifkan akun staff ini?",
          "adminDisableStaff",
          { id: deleteStaff.dataset.deleteStaff },
          "Akun staff berhasil dinonaktifkan."
        );
      }

      if (verifyPayment) {
        confirmAction(
          verifyPayment.dataset.paymentStatus === "REJECTED"
            ? "Tolak bukti pembayaran ini?"
            : "Konfirmasi pembayaran ini sudah benar?",
          "adminVerifyPayment",
          {
            paymentId: verifyPayment.dataset.verifyPayment,
            status: verifyPayment.dataset.paymentStatus || "PAID"
          },
          verifyPayment.dataset.paymentStatus === "REJECTED"
            ? "Pembayaran ditolak."
            : "Pembayaran berhasil diverifikasi."
        );
      }

      if (editPaymentMethod) {
        const method = state.paymentMethods.find(item =>
          String(item.id) === editPaymentMethod.dataset.editPaymentMethod
        );
        if (method) paymentMethodForm(method);
      }

      if (togglePaymentMethod) {
        const method = state.paymentMethods.find(item =>
          String(item.id) === togglePaymentMethod.dataset.togglePaymentMethod
        );
        if (method) {
          confirmAction(
            method.active === false ? "Aktifkan metode pembayaran ini?" : "Nonaktifkan metode pembayaran ini?",
            "adminSavePaymentMethod",
            { ...method, active: togglePaymentMethod.dataset.active === "true" },
            "Status metode pembayaran diperbarui."
          );
        }
      }

      if (approveReview) {
        confirmAction(
          "Tampilkan ulasan ini kepada publik?",
          "adminApproveReview",
          { reviewId: approveReview.dataset.approveReview },
          "Ulasan berhasil disetujui."
        );
      }
    });

    $("#adminSettingsForm")?.addEventListener("submit", async event => {
      event.preventDefault();

      const data = Object.fromEntries(new FormData(event.currentTarget).entries());

      await saveRecord("adminSaveSettings", data, "Pengaturan berhasil disimpan.");
    });

    const filterOrders = () => {
      const keyword = ($("#orderSearch")?.value || "").toLowerCase();
      const status = $("#orderStatusFilter")?.value || "";
      $$("#adminOrdersTable tr").forEach(row => {
        const matchesKeyword = row.textContent.toLowerCase().includes(keyword);
        const matchesStatus = !status || row.dataset.status === status;
        row.hidden = !(matchesKeyword && matchesStatus);
      });
    };
    $("#orderSearch")?.addEventListener("input", filterOrders);
    $("#orderStatusFilter")?.addEventListener("change", filterOrders);

    $("#customerSearch")?.addEventListener("input", event => {
      const keyword = event.target.value.toLowerCase();
      $$("#adminCustomersTable tr").forEach(row => {
        row.hidden = !row.textContent.toLowerCase().includes(keyword);
      });
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeModal();
        closeSidebar();
      }
    });
  }

  async function init() {
    const user = getSessionUser();

    if (!user) {
      window.location.href = "../auth/login.html";
      return;
    }

    if (String(user.role || "").toUpperCase() !== "ADMIN") {
      toast("Akses ditolak. Halaman ini khusus Admin.", "error");
      logout();
      return;
    }

    state.user = user;

    $("#adminLoginScreen").hidden = true;
    $("#adminApp").hidden = false;
    setText("#adminName", user.name || user.username || "Administrator");
    setText("#adminAvatar", (user.name || user.username || "A").charAt(0).toUpperCase());
    setText("#adminTopName", user.name || user.username || "Admin");
    setText("#adminTopAvatar", (user.name || user.username || "A").charAt(0).toUpperCase());
    $("#adminCurrentDate").textContent = new Intl.DateTimeFormat("id-ID", {
      dateStyle: "full",
      timeZone: "Asia/Makassar"
    }).format(new Date());

    bindEvents();
    showPage("dashboard");
    await loadData();
  }

  window.NaveraAdmin = {
    reload: loadData,
    showPage,
    logout,
    toast,
    openModal,
    closeModal,
    getState: () => state
  };

  document.addEventListener("DOMContentLoaded", init);
})();