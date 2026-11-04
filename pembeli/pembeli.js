
"use strict";

const API = window.NaveraAPI;

const state = {
    user: null,
    profile: {},
    products: [],
    paymentMethods: [],
    orders: [],
    settings: {},
    selectedOrder: null,
    selectedProduct: null,
    activePage: "dashboard",
    loading: false
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function rupiah(value) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return escapeHTML(value);

    return date.toLocaleString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function showToast(message, type = "success") {
    const container = $("#customerToastContainer");

    if (!container) {
        alert(message);
        return;
    }

    const toast = document.createElement("div");
    toast.className = `toast-item toast-${type}`;

    const icon = type === "error"
        ? "bi-exclamation-circle"
        : type === "warning"
            ? "bi-exclamation-triangle"
            : "bi-check-circle";

    toast.innerHTML = `
        <i class="bi ${icon}"></i>
        <span>${escapeHTML(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-hide");
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function setLoading(show, message = "Mohon tunggu...") {
    const overlay = $("#customerLoading");

    if (!overlay) return;

    const messageElement = $("p", overlay);
    if (messageElement) messageElement.textContent = message;
    overlay.hidden = !show;
}

function setText(selector, value) {
    const element = $(selector);

    if (element) {
        element.textContent = value ?? "";
    }
}

function setValue(selector, value) {
    const element = $(selector);

    if (element) {
        element.value = value ?? "";
    }
}

function getStatusLabel(status) {
    const labels = {
        PENDING: "Menunggu Konfirmasi",
        ACCEPTED: "Pesanan Diterima",
        REJECTED: "Pesanan Ditolak",
        PROCESSING: "Sedang Dicuci",
        READY: "Siap Diambil",
        COMPLETED: "Selesai",
        CANCELLED: "Dibatalkan"
    };

    return labels[String(status || "").toUpperCase()] || status || "Belum Ada Status";
}

function getPaymentLabel(status) {
    const labels = {
        UNPAID: "Belum Dibayar",
        WAITING_VERIFICATION: "Menunggu Verifikasi",
        PAID: "Sudah Dibayar",
        REJECTED: "Pembayaran Ditolak",
        REFUNDED: "Dana Dikembalikan"
    };

    return labels[String(status || "").toUpperCase()] || status || "-";
}

function statusClass(status) {
    return String(status || "pending").toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function getOrderId(order) {
    return order.orderId || order.order_id || order.id || "";
}

function getOrderTotal(order) {
    return Number(order.total || order.grandTotal || order.grand_total || 0);
}

function getOrderStatus(order) {
    return order.status || order.orderStatus || order.order_status || "PENDING";
}

function getProductId(product) {
    return product.productId || product.product_id || product.id || "";
}

function getProductPrice(product) {
    return Number(product.price || product.harga || 0);
}

function getProductName(product) {
    return product.name || product.nama || "Layanan Laundry";
}

function showPage(page) {
    state.activePage = page;

    $$(".customer-page[data-page]").forEach(element => {
        const active = element.dataset.page === page;
        element.classList.toggle("active", active);
        element.hidden = !active;
    });

    $$("[data-page]").forEach(element => {
        element.classList.toggle("active", element.dataset.page === page);
    });

    const titles = {
        dashboard: "Dashboard",
        products: "Layanan Laundry",
        orders: "Pesanan Saya",
        history: "Riwayat Pesanan",
        profile: "Profil Saya"
    };

    setText("#pageTitle", titles[page] || "NAVERA");

    closeMobileMenu();

    if (page === "orders" || page === "history") {
        renderOrders();
    }

    if (page === "products") {
        renderProducts();
    }

    if (page === "profile") {
        renderProfile();
    }
}

function openMobileMenu() {
    $("#customerNavigation")?.classList.add("active");
}

function closeMobileMenu() {
    $("#customerNavigation")?.classList.remove("active");
}

function renderDashboard() {
    const activeOrders = state.orders.filter(order => {
        const status = String(getOrderStatus(order)).toUpperCase();

        return !["COMPLETED", "CANCELLED", "REJECTED"].includes(status);
    });

    const completedOrders = state.orders.filter(order =>
        String(getOrderStatus(order)).toUpperCase() === "COMPLETED"
    );

    setText("#customerHeaderName", state.profile.name || state.user?.name || "Pelanggan");
    setText("#customerWelcomeName", state.profile.name || state.user?.name || "Pelanggan");
    setText("#customerStatTotal", state.orders.length);
    setText("#customerStatActive", activeOrders.length);
    setText("#customerStatCompleted", completedOrders.length);

    const container = $("#customerRecentOrders");

    if (container) {
        const recent = [...state.orders]
            .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))
            .slice(0, 5);

        if (!recent.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-bag"></i>
                    <h3>Belum Ada Pesanan</h3>
                    <p>Pesanan laundry kamu akan muncul di sini.</p>
                </div>
            `;
        } else {
            container.innerHTML = recent.map(order => `
                <div class="order-list-item">
                    <div class="order-info">
                        <strong>${escapeHTML(getOrderId(order))}</strong>
                        <span>${formatDate(order.createdAt || order.created_at)}</span>
                    </div>
                    <div class="order-info">
                        <strong>${rupiah(getOrderTotal(order))}</strong>
                        <span class="status-badge status-${statusClass(getOrderStatus(order))}">
                            ${escapeHTML(getStatusLabel(getOrderStatus(order)))}
                        </span>
                    </div>
                    <button class="btn-icon" type="button" data-view-order="${escapeHTML(getOrderId(order))}" aria-label="Detail pesanan">
                        <i class="bi bi-chevron-right"></i>
                    </button>
                </div>
            `).join("");
        }
    }

    renderDashboardProducts();
}

function renderDashboardProducts() {
    const container = $("#customerFeaturedProducts");

    if (!container) return;

    const products = state.products.filter(product => product.active !== false && product.isActive !== false).slice(0, 4);

    if (!products.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-basket"></i>
                <p>Belum ada layanan yang tersedia.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = products.map(product => productCard(product)).join("");
}

function productCard(product) {
    const id = getProductId(product);
    const image = product.imageUrl || product.image_url || product.image || "";
    const name = getProductName(product);
    const description = product.description || product.deskripsi || "Layanan perawatan pakaian NAVERA.";
    const unit = product.unit || product.satuan || "kg";

    return `
        <article class="product-card">
            <div class="product-image">
                ${image
                    ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(name)}" loading="lazy">`
                    : `<div class="product-placeholder"><i class="bi bi-basket"></i></div>`
                }
            </div>
            <div class="product-content">
                <h3>${escapeHTML(name)}</h3>
                <p>${escapeHTML(description)}</p>
                <div class="product-price">${rupiah(getProductPrice(product))}<span> / ${escapeHTML(unit)}</span></div>
                <button class="btn-primary btn-order-product" type="button" data-order-product="${escapeHTML(id)}">
                    Pesan Sekarang
                </button>
            </div>
        </article>
    `;
}

function renderProducts() {
    const container = $("#customerProductsGrid");

    if (!container) return;

    const products = state.products.filter(product => product.active !== false && product.isActive !== false);

    if (!products.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-basket"></i>
                <h3>Belum Ada Layanan</h3>
                <p>Layanan laundry akan ditampilkan setelah tersedia.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = products.map(product => productCard(product)).join("");
}

function renderOrders() {
    const container = $("#customerOrdersList");
    const historyContainer = $("#customerHistoryList");

    const sorted = [...state.orders].sort((a, b) => {
        return new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0);
    });

    if (container) {
        const searchTerm = ($("#customerOrderSearch")?.value || "").trim().toLowerCase();
        const statusFilter = ($("#customerOrderFilter")?.value || "").toUpperCase();
        const active = sorted.filter(order =>
            !["COMPLETED", "CANCELLED", "REJECTED"].includes(String(getOrderStatus(order)).toUpperCase())
        ).filter(order => {
            const matchesSearch = !searchTerm || String(getOrderId(order)).toLowerCase().includes(searchTerm);
            const matchesStatus = !statusFilter || String(getOrderStatus(order)).toUpperCase() === statusFilter;
            return matchesSearch && matchesStatus;
        });

        container.innerHTML = active.length
            ? active.map(order => orderCard(order)).join("")
            : searchTerm || statusFilter
                ? `<div class="empty-state"><i class="bi bi-search"></i><h3>Pesanan Tidak Ditemukan</h3><p>Coba ubah kata pencarian atau filter status.</p></div>`
                : emptyOrders();
    }

    if (historyContainer) {
        const history = sorted;

        historyContainer.innerHTML = history.length
            ? history.map(order => orderCard(order)).join("")
            : emptyOrders();
    }
}

function emptyOrders() {
    return `
        <div class="empty-state">
            <i class="bi bi-receipt"></i>
            <h3>Belum Ada Pesanan</h3>
            <p>Pesanan kamu akan muncul di halaman ini.</p>
        </div>
    `;
}

function orderCard(order) {
    const id = getOrderId(order);
    const status = getOrderStatus(order);
    const paymentStatus = order.paymentStatus || order.payment_status || "UNPAID";
    const paymentMethod = String(order.paymentMethod || order.payment_method || "");
    const canSubmitProof = paymentMethod !== "CASH"
        && ["UNPAID", "REJECTED"].includes(String(paymentStatus).toUpperCase());

    return `
        <article class="order-card">
            <div class="order-card-header">
                <div>
                    <span class="order-number">Nomor Pesanan</span>
                    <strong>${escapeHTML(id)}</strong>
                </div>
                <span class="status-badge status-${statusClass(status)}">
                    ${escapeHTML(getStatusLabel(status))}
                </span>
            </div>
            <div class="order-card-body">
                <p><i class="bi bi-calendar3"></i> ${formatDate(order.createdAt || order.created_at)}</p>
                <p><i class="bi bi-truck"></i> ${escapeHTML(order.deliveryType || order.delivery_type || "Antar Jemput")}</p>
                <p><i class="bi bi-credit-card"></i> ${escapeHTML(getPaymentLabel(paymentStatus))}</p>
                <strong class="order-total">${rupiah(getOrderTotal(order))}</strong>
            </div>
            <div class="order-card-actions">
                <button type="button" class="btn-outline" data-view-order="${escapeHTML(id)}">
                    Detail Pesanan
                </button>
                ${String(paymentStatus).toUpperCase() === "PAID" && !order.reviewed
                    ? `<button type="button" class="btn-outline" data-review-order="${escapeHTML(id)}">Beri Ulasan</button>`
                    : ""
                }
                ${canSubmitProof
                    ? `<button type="button" class="btn-outline" data-pay-order="${escapeHTML(id)}">Bayar / Kirim Bukti</button>`
                    : ""
                }
            </div>
        </article>
    `;
}

function renderProfile() {
    const profile = state.profile || {};

    setValue("#customerProfileName", profile.name || state.user?.name || "");
    setValue("#customerProfileUsername", profile.username || state.user?.username || "");
    setValue("#customerProfilePhone", profile.phone || state.user?.phone || "");
    setValue("#customerProfileAddress", profile.address || "");
    const emailInput = $("input[name='email']", $("#customerProfileForm"));
    if (emailInput) emailInput.value = profile.email || state.user?.email || "";
}

function openModal(title, content) {
    const modal = $("#customerOrderModal");

    if (!modal) {
        showToast("Komponen modal belum tersedia.", "error");
        return;
    }

    setText("#customerModalTitle", title);

    const body = $("#customerModalBody");

    if (body) {
        body.innerHTML = content;
    }

    modal.hidden = false;
    modal.classList.add("active");
    modal.classList.add("show");
    document.body.classList.add("modal-open");
}

function closeModal() {
    const modal = $("#customerOrderModal");
    modal?.classList.remove("active", "show");
    if (modal) modal.hidden = true;
    document.body.classList.remove("modal-open");
    state.selectedOrder = null;
    state.selectedProduct = null;
}

async function openOrderForm(productId) {
    const product = state.products.find(item => String(getProductId(item)) === String(productId));

    if (!product) {
        showToast("Layanan tidak ditemukan.", "error");
        return;
    }

    try {
        const result = await API.request("customerGetDashboard");

        if (!result?.success) {
            throw new Error(result?.message || "Gagal memuat metode pembayaran.");
        }

        const data = result.data || result;
        const paymentMethods = data.paymentMethods || data.payment_methods;

        if (Array.isArray(paymentMethods)) {
            state.paymentMethods = paymentMethods.filter(method =>
                method.active !== false && String(method.active).toLowerCase() !== "false"
            );
        }
    } catch (error) {
        showToast(error.message || "Metode pembayaran belum dapat dimuat. Coba lagi.", "error");
        return;
    }

    state.selectedProduct = product;

    const productName = getProductName(product);
    const price = getProductPrice(product);
    const unit = product.unit || product.satuan || "kg";
    const paymentOptions = [
        `<option value="CASH">Tunai</option>`,
        ...state.paymentMethods.map(method =>
            `<option value="${escapeHTML(method.id)}">${escapeHTML(method.name)} (${escapeHTML(method.type === "QRIS" ? "QRIS" : "Transfer Bank")})</option>`
        )
    ].join("");

    openModal("Buat Pesanan", `
        <form id="orderForm" class="customer-form">
            <div class="form-group">
                <label>Jenis Layanan</label>
                <input type="text" value="${escapeHTML(productName)}" readonly>
                <input type="hidden" name="productId" value="${escapeHTML(getProductId(product))}">
            </div>
            <div class="form-group">
                <label>Jumlah / Berat (${escapeHTML(unit)})</label>
                <input type="number" name="quantity" min="1" step="0.1" value="1" required>
                <small>Harga satuan: ${rupiah(price)}</small>
            </div>
            <div class="form-group">
                <label>Metode Layanan</label>
                <select name="deliveryType" required>
                    <option value="PICKUP_DELIVERY">Jemput dan Antar</option>
                    <option value="DROP_OFF">Antar Sendiri</option>
                </select>
            </div>
            <div class="form-group">
                <label>Alamat Penjemputan / Pengantaran</label>
                <textarea name="address" rows="3" required>${escapeHTML(state.profile.address || "")}</textarea>
            </div>
            <div class="form-group">
                <label>Jadwal Penjemputan</label>
                <input type="datetime-local" name="pickupSchedule" required>
            </div>
            <div class="form-group">
                <label>Metode Pembayaran</label>
                <select name="paymentMethod" required>
                    ${paymentOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Catatan Tambahan</label>
                <textarea name="notes" rows="2" placeholder="Contoh: pakaian putih dipisah"></textarea>
            </div>
            <div class="order-estimate">
                <span>Estimasi biaya awal</span>
                <strong id="orderEstimate">${rupiah(price)}</strong>
            </div>
            <button class="btn-primary btn-block" type="submit">Kirim Pesanan</button>
        </form>
    `);

    const form = $("#orderForm");

    form?.addEventListener("input", () => {
        const quantity = Math.max(0, Number(form.elements.quantity.value) || 0);
        setText("#orderEstimate", rupiah(price * quantity));
    });

    form?.addEventListener("submit", submitOrder);
}

async function submitOrder(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
        productId: String(formData.get("productId") || ""),
        quantity: Number(formData.get("quantity")),
        deliveryType: String(formData.get("deliveryType") || ""),
        address: String(formData.get("address") || "").trim(),
        pickupSchedule: String(formData.get("pickupSchedule") || ""),
        paymentMethod: String(formData.get("paymentMethod") || ""),
        notes: String(formData.get("notes") || "").trim()
    };

    if (!payload.productId || payload.quantity <= 0 || !payload.address || !payload.pickupSchedule) {
        showToast("Lengkapi data pesanan terlebih dahulu.", "warning");
        return;
    }

    try {
        setLoading(true, "Mengirim pesanan...");

        const result = await API.request("customerCreateOrder", payload);

        if (!result?.success) {
            throw new Error(result?.message || "Pesanan gagal dibuat.");
        }

        closeModal();
        showToast(result.message || "Pesanan berhasil dibuat.");
        await loadData();
        showPage("orders");
    } catch (error) {
        showToast(error.message || "Terjadi kesalahan saat membuat pesanan.", "error");
    } finally {
        setLoading(false);
    }
}

async function submitPaymentProof(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const file = form.elements.proof.files[0];
    if (!file) {
        showToast("Pilih file bukti pembayaran terlebih dahulu.", "warning");
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast("Ukuran bukti pembayaran maksimal 5 MB.", "warning");
        return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        showToast("Bukti pembayaran harus berupa JPG, PNG, atau WEBP.", "warning");
        return;
    }

    try {
        setLoading(true, "Mengirim bukti pembayaran...");
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
            reader.onerror = () => reject(new Error("File bukti pembayaran gagal dibaca."));
            reader.readAsDataURL(file);
        });

        const result = await API.request("customerSubmitPayment", {
            orderId: String(new FormData(form).get("orderId") || ""),
            fileName: file.name,
            mimeType: file.type,
            base64: base64
        });

        if (!result?.success) {
            throw new Error(result?.message || "Bukti pembayaran gagal dikirim.");
        }

        closeModal();
        showToast(result.message || "Bukti pembayaran berhasil dikirim.");
        await loadData();
    } catch (error) {
        showToast(error.message || "Gagal mengirim bukti pembayaran.", "error");
    } finally {
        setLoading(false);
    }
}

async function openOrderDetail(orderId) {
    try {
        setLoading(true, "Memuat detail pesanan...");

        const result = await API.request("customerGetOrderDetail", { orderId });

        if (!result?.success || !result.data) {
            throw new Error(result?.message || "Detail pesanan tidak ditemukan.");
        }

        const order = result.data;
        state.selectedOrder = order;

        const items = Array.isArray(order.items) ? order.items : [];
        const payment = order.payment || {};
        const paymentStatus = String(payment.status || order.paymentStatus || "").toUpperCase();
        const paymentMethod = order.paymentMethodDetails || state.paymentMethods.find(method =>
            String(method.id) === String(order.paymentMethod || "")
        );
        const paymentMethodName = order.paymentMethod === "CASH"
            ? "Tunai"
            : paymentMethod
                ? `${paymentMethod.name}${paymentMethod.accountNumber ? ` · ${paymentMethod.accountNumber}` : ""}${paymentMethod.accountName ? ` · ${paymentMethod.accountName}` : ""}`
                : order.paymentMethod || "-";
        const canSubmitProof = order.paymentMethod !== "CASH"
            && ["UNPAID", "REJECTED"].includes(paymentStatus);
        const paymentProofForm = canSubmitProof ? `
            <h4>Pembayaran</h4>
            ${paymentMethod?.imageUrl
                ? `<img class="payment-method-image" src="${escapeHTML(paymentMethod.imageUrl)}" alt="${escapeHTML(paymentMethod.name)}">`
                : ""
            }
            <p>Silakan transfer sesuai total pesanan ke metode di atas, lalu unggah bukti pembayaran.</p>
            <form id="customerPaymentForm" class="customer-form">
                <input type="hidden" name="orderId" value="${escapeHTML(getOrderId(order))}">
                <div class="form-group">
                    <label for="paymentProofFile">Bukti pembayaran (JPG, PNG, atau WEBP; maks. 5 MB)</label>
                    <input id="paymentProofFile" name="proof" type="file" accept="image/jpeg,image/png,image/webp" required>
                </div>
                <button class="btn-primary btn-block" type="submit">Kirim Bukti Pembayaran</button>
            </form>
        ` : paymentStatus === "WAITING_VERIFICATION"
            ? `<h4>Pembayaran</h4><p>Bukti pembayaran sudah dikirim dan sedang menunggu verifikasi admin.</p>`
            : paymentStatus === "PAID"
                ? `<h4>Pembayaran</h4><p>Pembayaran sudah diverifikasi.</p>`
                : paymentMethodName === "Tunai"
                    ? `<h4>Pembayaran</h4><p>Pembayaran tunai dilakukan saat pesanan diserahkan.</p>`
                    : "";

        openModal("Detail Pesanan", `
            <div class="order-detail">
                <div class="detail-row">
                    <span>Nomor Pesanan</span>
                    <strong>${escapeHTML(getOrderId(order))}</strong>
                </div>
                <div class="detail-row">
                    <span>Status</span>
                    <strong>${escapeHTML(getStatusLabel(getOrderStatus(order)))}</strong>
                </div>
                <div class="detail-row">
                    <span>Tanggal Pesanan</span>
                    <strong>${formatDate(order.createdAt || order.created_at)}</strong>
                </div>
                <div class="detail-row">
                    <span>Alamat</span>
                    <strong>${escapeHTML(order.address || "-")}</strong>
                </div>
                <div class="detail-row">
                    <span>Metode Pembayaran</span>
                    <strong>${escapeHTML(paymentMethodName)}</strong>
                </div>
                <div class="detail-row">
                    <span>Status Pembayaran</span>
                    <strong>${escapeHTML(getPaymentLabel(paymentStatus))}</strong>
                </div>
                <h4>Rincian Layanan</h4>
                ${items.length
                    ? items.map(item => `
                        <div class="detail-row">
                            <span>${escapeHTML(item.productName || item.product_name || "Layanan")} × ${escapeHTML(item.quantity || 1)}</span>
                            <strong>${rupiah(item.subtotal || item.total || 0)}</strong>
                        </div>
                    `).join("")
                    : `<p>Rincian layanan belum tersedia.</p>`
                }
                <div class="detail-total">
                    <span>Total Pesanan</span>
                    <strong>${rupiah(getOrderTotal(order))}</strong>
                </div>
                ${paymentProofForm}
            </div>
        `);

        $("#customerPaymentForm")?.addEventListener("submit", submitPaymentProof);
    } catch (error) {
        showToast(error.message || "Gagal memuat detail pesanan.", "error");
    } finally {
        setLoading(false);
    }
}

function openReviewForm(orderId) {
    openModal("Beri Ulasan", `
        <form id="reviewForm" class="customer-form">
            <input type="hidden" name="orderId" value="${escapeHTML(orderId)}">
            <div class="form-group">
                <label>Rating Layanan</label>
                <select name="rating" required>
                    <option value="5">★★★★★ - Sangat Puas</option>
                    <option value="4">★★★★ - Puas</option>
                    <option value="3">★★★ - Cukup</option>
                    <option value="2">★★ - Kurang Puas</option>
                    <option value="1">★ - Tidak Puas</option>
                </select>
            </div>
            <div class="form-group">
                <label>Ulasan</label>
                <textarea name="comment" rows="4" maxlength="1000" placeholder="Ceritakan pengalaman kamu menggunakan layanan NAVERA..." required></textarea>
            </div>
            <button class="btn-primary btn-block" type="submit">Kirim Ulasan</button>
        </form>
    `);

    $("#reviewForm")?.addEventListener("submit", submitReview);
}

async function submitReview(event) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    const payload = {
        orderId: String(data.get("orderId") || ""),
        rating: Number(data.get("rating")),
        comment: String(data.get("comment") || "").trim()
    };

    if (!payload.orderId || payload.rating < 1 || payload.rating > 5 || !payload.comment) {
        showToast("Lengkapi ulasan terlebih dahulu.", "warning");
        return;
    }

    try {
        setLoading(true, "Mengirim ulasan...");

        const result = await API.request("customerSubmitReview", payload);

        if (!result?.success) {
            throw new Error(result?.message || "Ulasan gagal dikirim.");
        }

        if (result.data?.persisted !== true || !result.data.reviewId) {
            throw new Error("Server belum mengonfirmasi ulasan tersimpan. Perbarui deployment Web App Apps Script ke versi terbaru.");
        }

        closeModal();
        showToast(result.message || "Ulasan berhasil disimpan.");
        await loadData();
        showPage("history");
    } catch (error) {
        showToast(error.message || "Gagal mengirim ulasan.", "error");
    } finally {
        setLoading(false);
    }
}

async function saveProfile(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
        name: String(formData.get("name") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        address: String(formData.get("address") || "").trim(),
        email: String(formData.get("email") || "").trim()
    };

    if (!payload.name || !payload.phone || !payload.address) {
        showToast("Nama, nomor telepon, dan alamat wajib diisi.", "warning");
        return;
    }

    try {
        setLoading(true, "Menyimpan profil...");

        const result = await API.request("customerUpdateProfile", payload);

        if (!result?.success) {
            throw new Error(result?.message || "Profil gagal diperbarui.");
        }

        state.profile = { ...state.profile, ...payload };

        showToast(result.message || "Profil berhasil diperbarui.");
        renderDashboard();
    } catch (error) {
        showToast(error.message || "Gagal memperbarui profil.", "error");
    } finally {
        setLoading(false);
    }
}

async function loadData() {
    if (!API || typeof API.request !== "function") {
        showToast("API NAVERA belum tersedia. Periksa shared/api.js.", "error");
        return;
    }

    try {
        setLoading(true, "Memuat dashboard...");

        const result = await API.request("customerGetDashboard");

        if (!result?.success) {
            throw new Error(result?.message || "Gagal memuat data dashboard.");
        }

        const data = result.data || {};

        state.profile = data.profile || {};
        state.products = Array.isArray(data.products) ? data.products : [];
        state.paymentMethods = Array.isArray(data.paymentMethods) ? data.paymentMethods : [];
        state.orders = Array.isArray(data.orders) ? data.orders : [];
        state.settings = data.settings || {};

        renderDashboard();
        renderProducts();
        renderOrders();
        renderProfile();
    } catch (error) {
        showToast(error.message || "Gagal memuat dashboard.", "error");
    } finally {
        setLoading(false);
    }
}

async function logout() {
    const confirmed = confirm("Apakah kamu yakin ingin keluar dari akun NAVERA?");

    if (!confirmed) return;

    try {
        if (typeof API.logout === "function") {
            await API.logout();
        } else {
            await API.request("logout");
        }
    } catch (error) {
        console.warn("Logout:", error.message);
    }

    window.location.href = "../auth/login.html";
}

function bindEvents() {
    $("#customerMenuToggle")?.addEventListener("click", openMobileMenu);

    $$("[data-close-customer-modal]").forEach(button => button.addEventListener("click", closeModal));

    $("#customerLogoutButton")?.addEventListener("click", logout);

    $("#customerProfileForm")?.addEventListener("submit", saveProfile);
    $("#customerOrderSearch")?.addEventListener("input", renderOrders);
    $("#customerOrderFilter")?.addEventListener("change", renderOrders);

    document.addEventListener("click", event => {
        const productButton = event.target.closest("[data-order-product]");

        if (productButton) {
            openOrderForm(productButton.dataset.orderProduct);
            return;
        }

        const detailButton = event.target.closest("[data-view-order]");

        if (detailButton) {
            openOrderDetail(detailButton.dataset.viewOrder);
            return;
        }

        const paymentButton = event.target.closest("[data-pay-order]");

        if (paymentButton) {
            openOrderDetail(paymentButton.dataset.payOrder);
            return;
        }

        const reviewButton = event.target.closest("[data-review-order]");

        if (reviewButton) {
            openReviewForm(reviewButton.dataset.reviewOrder);
            return;
        }

        const openPageButton = event.target.closest("[data-open-page]");
        if (openPageButton) {
            showPage(openPageButton.dataset.openPage);
            return;
        }

        const pageLink = event.target.closest("[data-page]");

        if (pageLink) {
            event.preventDefault();
            showPage(pageLink.dataset.page);
        }
    });

}

async function initialize() {
    if (!API || typeof API.getSession !== "function") {
        window.location.href = "../auth/login.html";
        return;
    }

    try {
        const session = await API.request("getSession");

        const user = session?.data?.user;

        if (!user) {
            window.location.href = "../auth/login.html";
            return;
        }

        const role = String(user.role || "").toUpperCase();

        if (role !== "CUSTOMER") {
            const destinations = {
                ADMIN: "../admin/admin.html",
                STAFF: "../staff/staff.html"
            };

            window.location.href = destinations[role] || "../auth/login.html";
            return;
        }

        state.user = user;
        $("#customerLoginScreen").hidden = true;
        $("#customerApp").hidden = false;
        bindEvents();
        await loadData();

        window.NaveraCustomer = {
            reload: loadData,
            showPage,
            logout,
            openOrderDetail,
            openOrderForm,
            getState: () => state
        };
    } catch (error) {
        console.error(error);
        window.location.href = "../auth/login.html";
    }
}

document.addEventListener("DOMContentLoaded", initialize);
