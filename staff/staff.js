(() => {
  "use strict";

  const API = window.NaveraAPI;
  const Utils = window.NaveraUtils;
  let orders = [];

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);

  const statusLabels = {
    PENDING: "Menunggu Admin",
    ACCEPTED: "Diterima",
    PROCESSING: "Sedang Dicuci",
    READY: "Siap Diambil",
    COMPLETED: "Selesai",
    REJECTED: "Ditolak",
    CANCELLED: "Dibatalkan"
  };

  function showToast(message, type = "success") {
    const container = $("#staffToastContainer");
    const toast = document.createElement("div");
    toast.className = `navera-toast navera-toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function setLoading(show) {
    const overlay = $("#staffLoading");
    if (overlay) overlay.hidden = !show;
  }

  function closeSidebar() {
    $("#staffSidebar").classList.remove("open");
    $("#staffSidebarOverlay").classList.remove("show");
  }

  function renderOrders() {
    const table = $("#staffOrdersTable");
    const search = ($("#staffOrderSearch")?.value || "").trim().toLowerCase();
    const filtered = orders.filter(order => {
      const searchable = `${order.id || ""} ${order.customerName || ""} ${order.productName || ""}`.toLowerCase();
      return searchable.includes(search);
    });

    table.innerHTML = filtered.length ? filtered.map(order => {
      const status = String(order.status || "").toUpperCase();
      const action = {
        ACCEPTED: ["PROCESSING", "Mulai Proses"],
        PROCESSING: ["READY", "Siap Diambil"],
        READY: ["COMPLETED", "Selesaikan"]
      }[status];

      return `
        <tr>
          <td>${escapeHTML(order.id)}</td>
          <td>${escapeHTML(order.customerName || "-")}<small class="staff-order-phone">${escapeHTML(order.customerPhone || "")}</small></td>
          <td>${escapeHTML(order.productName || "-")}<small>${escapeHTML(order.quantity || "")} ${escapeHTML(order.unit || "")}</small></td>
          <td>${escapeHTML(order.pickupSchedule || "-")}</td>
          <td><span class="status-badge">${escapeHTML(statusLabels[status] || status)}</span></td>
          <td>${action
            ? `<div class="staff-order-actions"><button type="button" data-order-id="${escapeHTML(order.id)}" data-next-status="${action[0]}">${action[1]}</button></div>`
            : `<span class="staff-order-waiting">Menunggu tindakan Admin</span>`
          }</td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="6"><div class="staff-empty">Tidak ada pesanan aktif.</div></td></tr>`;
  }

  function renderStats() {
    const active = orders.filter(order => !["COMPLETED", "CANCELLED", "REJECTED"].includes(String(order.status).toUpperCase()));
    $("#staffStatActive").textContent = String(active.length);
    $("#staffStatProcessing").textContent = String(active.filter(order => order.status === "PROCESSING").length);
    $("#staffStatReady").textContent = String(active.filter(order => order.status === "READY").length);
  }

  async function loadDashboard() {
    setLoading(true);
    try {
      const response = await API.request("staffGetDashboard");
      if (!response?.success) throw new Error(response?.message || "Gagal memuat pesanan.");
      orders = Array.isArray(response.data?.orders) ? response.data.orders : [];
      renderStats();
      renderOrders();
    } catch (error) {
      showToast(error.message || "Gagal memuat pesanan.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function updateOrderStatus(orderId, status) {
    const order = orders.find(item => String(item.id) === String(orderId));
    if (!order) return;

    const confirmation = `Ubah status pesanan ${orderId} menjadi ${statusLabels[status]}?`;
    if (!window.confirm(confirmation)) return;

    setLoading(true);
    try {
      const response = await API.request("staffUpdateOrderStatus", { orderId, status });
      if (!response?.success) throw new Error(response?.message || "Status pesanan gagal diperbarui.");
      showToast(response.message || "Status pesanan berhasil diperbarui.");
      await loadDashboard();
    } catch (error) {
      showToast(error.message || "Status pesanan gagal diperbarui.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function initialize() {
    const storedUser = Utils.getUser();
    if (!storedUser) {
      window.location.href = "../auth/login.html";
      return;
    }

    try {
      const session = await API.request("getSession");
      const user = session?.data?.user;
      if (!user || String(user.role).toUpperCase() !== "STAFF") {
        window.location.href = "../auth/login.html";
        return;
      }

      $("#staffLoginScreen").hidden = true;
      $("#staffApp").hidden = false;
      $("#staffName").textContent = user.name || "Staff";
      $("#staffTopName").textContent = user.name || "Staff";
      $("#staffAvatar").textContent = (user.name || "S").charAt(0).toUpperCase();
      $("#staffTopAvatar").textContent = (user.name || "S").charAt(0).toUpperCase();
      $("#staffCurrentDate").textContent = new Intl.DateTimeFormat("id-ID", {
        dateStyle: "full",
        timeZone: "Asia/Makassar"
      }).format(new Date());
      $("#staffRefreshButton").addEventListener("click", loadDashboard);
      $("#staffOrderSearch").addEventListener("input", renderOrders);
      $("#staffLogoutButton").addEventListener("click", () => Utils.logout());
      $("#staffMenuToggle").addEventListener("click", () => {
        $("#staffSidebar").classList.toggle("open");
        $("#staffSidebarOverlay").classList.toggle("show");
      });
      $("#staffSidebarOverlay").addEventListener("click", closeSidebar);
      document.addEventListener("click", event => {
        const button = event.target.closest("[data-next-status]");
        if (button) updateOrderStatus(button.dataset.orderId, button.dataset.nextStatus);
      });
      await loadDashboard();
    } catch (error) {
      showToast(error.message || "Sesi staff tidak valid.", "error");
      window.setTimeout(() => {
        window.location.href = "../auth/login.html";
      }, 1200);
    }
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
