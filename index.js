
(() => {
    'use strict';

    const CONFIG = {
        apiAction: 'getPublicData',
        loginUrl: 'auth/login.html',
        registerUrl: 'auth/register.html',
        maxReviews: 6
    };

    const elements = {
        mobileMenuToggle: document.getElementById('mobileMenuToggle'),
        mainNavigation: document.getElementById('mainNavigation'),
        backToTop: document.getElementById('backToTop'),
        currentYear: document.getElementById('currentYear'),
        productsGrid: document.getElementById('productsGrid'),
        productStatus: document.getElementById('productStatus'),
        emptyProducts: document.getElementById('emptyProducts'),
        reviewsGrid: document.getElementById('reviewsGrid'),
        emptyReviews: document.getElementById('emptyReviews'),
        averageRating: document.getElementById('averageRating'),
        averageStars: document.getElementById('averageStars'),
        totalReviews: document.getElementById('totalReviews'),
        footerContact: document.getElementById('footerContact'),
        toastContainer: document.getElementById('toastContainer')
    };

    const formatCurrency = value => {
        const number = Number(value || 0);

        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0
        }).format(number);
    };

    const escapeHTML = value => {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[character]);
    };

    const getValue = (object, keys, fallback = '') => {
        for (const key of keys) {
            const value = object?.[key];

            if (value !== undefined && value !== null && value !== '') {
                return value;
            }
        }

        return fallback;
    };

    const getApiUrl = () => {
        const config = window.NAVERA_CONFIG || window.APP_CONFIG || window.CONFIG || {};

        return (
            config.API_URL ||
            config.apiUrl ||
            window.API_URL ||
            ''
        );
    };

    const showToast = (message, type = 'info') => {
        if (!elements.toastContainer) return;

        const icon = type === 'success'
            ? 'bi-check-circle-fill'
            : type === 'error'
                ? 'bi-exclamation-circle-fill'
                : 'bi-info-circle-fill';

        const toast = document.createElement('div');
        toast.className = `toast-item ${type}`;
        toast.innerHTML = `
            <i class="bi ${icon}"></i>
            <span>${escapeHTML(message)}</span>
        `;

        elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(15px)';

            setTimeout(() => toast.remove(), 300);
        }, 3500);
    };

    const apiRequest = async (action, payload = {}) => {
        const apiUrl = getApiUrl();

        if (!apiUrl) {
            throw new Error('Alamat API belum dikonfigurasi.');
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({
                action,
                ...payload
            })
        });

        if (!response.ok) {
            throw new Error(`Server memberikan respons ${response.status}.`);
        }

        const result = await response.json();

        if (result.success === false || result.status === 'error') {
            throw new Error(result.message || 'Permintaan tidak berhasil.');
        }

        return result.data ?? result.result ?? result;
    };

    const getPublicData = async () => {
        if (window.NaveraAPI && typeof window.NaveraAPI.getPublicData === 'function') {
            return await window.NaveraAPI.getPublicData();
        }

        return await apiRequest(CONFIG.apiAction, {
            include: ['products', 'reviews', 'settings']
        });
    };

    const closeMobileMenu = () => {
        elements.mainNavigation?.classList.remove('active');
        elements.mobileMenuToggle?.setAttribute('aria-expanded', 'false');
        elements.mobileMenuToggle?.setAttribute('aria-label', 'Buka menu navigasi');

        const icon = elements.mobileMenuToggle?.querySelector('i');
        if (icon) icon.className = 'bi bi-list';

        document.body.classList.remove('menu-open');
    };

    const toggleMobileMenu = () => {
        if (!elements.mainNavigation || !elements.mobileMenuToggle) return;

        const isOpen = elements.mainNavigation.classList.toggle('active');

        elements.mobileMenuToggle.setAttribute('aria-expanded', String(isOpen));
        elements.mobileMenuToggle.setAttribute(
            'aria-label',
            isOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'
        );

        const icon = elements.mobileMenuToggle.querySelector('i');
        if (icon) icon.className = isOpen ? 'bi bi-x-lg' : 'bi bi-list';

        document.body.classList.toggle('menu-open', isOpen);
    };

    const setupNavigation = () => {
        elements.mobileMenuToggle?.addEventListener('click', toggleMobileMenu);

        elements.mainNavigation?.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', closeMobileMenu);
        });

        document.addEventListener('click', event => {
            if (
                !elements.mainNavigation?.classList.contains('active') ||
                elements.mainNavigation.contains(event.target) ||
                elements.mobileMenuToggle?.contains(event.target)
            ) {
                return;
            }

            closeMobileMenu();
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                closeMobileMenu();
            }
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 850) {
                closeMobileMenu();
            }
        });

        window.addEventListener('scroll', () => {
            elements.backToTop?.classList.toggle('show', window.scrollY > 350);
        }, { passive: true });

        elements.backToTop?.addEventListener('click', event => {
            event.preventDefault();

            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    };

    const setupActiveNavigation = () => {
        const sections = document.querySelectorAll('main section[id]');
        const navigationLinks = document.querySelectorAll('.main-navigation .nav-link');

        if (!('IntersectionObserver' in window)) return;

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;

                navigationLinks.forEach(link => {
                    const target = link.getAttribute('href');
                    link.classList.toggle('active', target === `#${entry.target.id}`);
                });
            });
        }, {
            rootMargin: '-25% 0px -65% 0px'
        });

        sections.forEach(section => observer.observe(section));
    };

    const setupFooter = () => {
        if (elements.currentYear) {
            elements.currentYear.textContent = new Date().getFullYear();
        }
    };

    const normalizeProducts = data => {
        if (Array.isArray(data)) return data;

        if (Array.isArray(data?.products)) return data.products;
        if (Array.isArray(data?.PRODUCTS)) return data.PRODUCTS;

        return [];
    };

    const normalizeReviews = data => {
        if (Array.isArray(data)) return data;

        if (Array.isArray(data?.reviews)) return data.reviews;
        if (Array.isArray(data?.REVIEWS)) return data.REVIEWS;

        return [];
    };

    const normalizeSettings = value => {
        if (Array.isArray(value)) {
            return value.reduce((settings, row) => {
                const key = getValue(row, ['key', 'name']);
                if (key) settings[key] = getValue(row, ['value'], '');
                return settings;
            }, {});
        }

        if (value && typeof value === 'object') return value;
        return {};
    };

    const unwrapApiData = response => {
        let data = response;

        while (data && typeof data === 'object' && !Array.isArray(data)) {
            if (data.data && typeof data.data === 'object') {
                data = data.data;
                continue;
            }

            if (data.result && typeof data.result === 'object') {
                data = data.result;
                continue;
            }

            break;
        }

        return data || {};
    };

    const renderProducts = products => {
        if (!elements.productsGrid) return;

        const activeProducts = products.filter(product => {
            const status = String(
                getValue(product, ['status', 'active', 'isActive', 'is_active'], 'ACTIVE')
            ).toUpperCase();

            return !['INACTIVE', 'NONAKTIF', 'FALSE', '0', 'OFF'].includes(status);
        });

        elements.productsGrid.innerHTML = '';

        if (elements.productStatus) {
            elements.productStatus.innerHTML = `
                <i class="bi bi-check-circle-fill"></i>
                ${activeProducts.length} layanan tersedia
            `;
        }

        if (!activeProducts.length) {
            elements.emptyProducts?.removeAttribute('hidden');
            return;
        }

        elements.emptyProducts?.setAttribute('hidden', '');

        activeProducts.forEach(product => {
            const name = getValue(product, ['name', 'nama', 'productName', 'product_name'], 'Layanan NAVERA');
            const description = getValue(product, ['description', 'deskripsi'], 'Layanan perawatan pakaian NAVERA.');
            const price = getValue(product, ['price', 'harga'], 0);
            const unit = getValue(product, ['unit', 'satuan'], 'layanan');
            const estimate = getValue(product, ['estimatedTime', 'estimated_time', 'estimasi', 'duration'], 'Menyesuaikan layanan');
            const image = getValue(product, ['imageUrl', 'image_url', 'photo', 'foto', 'image'], '');
            const safeImage = isSafeImageUrl(image) ? escapeHTML(image) : '';

            const card = document.createElement('article');
            card.className = 'product-card';

            card.innerHTML = `
                <div class="product-image">
                    ${
                        safeImage
                            ? `<img src="${safeImage}" alt="${escapeHTML(name)}" loading="lazy">`
                            : `<div class="product-image-placeholder"><i class="bi bi-basket2"></i></div>`
                    }
                </div>
                <div class="product-content">
                    <h3>${escapeHTML(name)}</h3>
                    <p class="product-description">${escapeHTML(description)}</p>
                    <div class="product-price">
                        ${formatCurrency(price)}
                        <span class="product-unit">/ ${escapeHTML(unit)}</span>
                    </div>
                    <div class="product-estimate">
                        <i class="bi bi-clock"></i>
                        Estimasi: ${escapeHTML(estimate)}
                    </div>
                    <a href="${CONFIG.loginUrl}" class="btn btn-primary">
                        Pesan Sekarang
                        <i class="bi bi-arrow-right"></i>
                    </a>
                </div>
            `;

            elements.productsGrid.appendChild(card);
        });
    };

    const isSafeImageUrl = value => {
        if (!value) return false;

        try {
            const url = new URL(value, window.location.href);

            return ['http:', 'https:'].includes(url.protocol);
        } catch {
            return false;
        }
    };

    const formatDate = value => {
        if (!value) return 'Pelanggan NAVERA';

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return 'Pelanggan NAVERA';
        }

        return new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }).format(date);
    };

    const renderStars = rating => {
        const score = Math.max(0, Math.min(5, Number(rating) || 0));

        return Array.from({ length: 5 }, (_, index) => {
            const filled = index < Math.round(score);

            return `<i class="bi ${filled ? 'bi-star-fill' : 'bi-star'}"></i>`;
        }).join('');
    };

    const renderReviews = reviews => {
        if (!elements.reviewsGrid) return;

        const approvedReviews = reviews.filter(review => {
            const status = String(
                getValue(review, ['status', 'reviewStatus', 'review_status'], 'APPROVED')
            ).toUpperCase();

            return ['APPROVED', 'PUBLISHED', 'ACTIVE', 'VALID', 'DISETUJUI'].includes(status);
        });

        const sortedReviews = [...approvedReviews].sort((a, b) => {
            const dateA = new Date(getValue(a, ['createdAt', 'created_at', 'tanggal'], 0)).getTime() || 0;
            const dateB = new Date(getValue(b, ['createdAt', 'created_at', 'tanggal'], 0)).getTime() || 0;

            return dateB - dateA;
        });

        const latestReviews = sortedReviews.slice(0, CONFIG.maxReviews);

        const ratings = approvedReviews
            .map(review => Number(getValue(review, ['rating', 'stars', 'bintang'], 0)))
            .filter(rating => rating >= 1 && rating <= 5);

        const average = ratings.length
            ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
            : 0;

        if (elements.averageRating) {
            elements.averageRating.textContent = ratings.length ? average.toFixed(1) : '—';
        }

        if (elements.averageStars) {
            elements.averageStars.innerHTML = renderStars(average);
        }

        if (elements.totalReviews) {
            elements.totalReviews.textContent = `${ratings.length} ulasan pelanggan`;
        }

        elements.reviewsGrid.innerHTML = '';

        if (!latestReviews.length) {
            elements.emptyReviews?.removeAttribute('hidden');
            return;
        }

        elements.emptyReviews?.setAttribute('hidden', '');

        latestReviews.forEach(review => {
            const name = getValue(review, ['customerName', 'customer_name', 'name', 'nama'], 'Pelanggan NAVERA');
            const comment = getValue(review, ['comment', 'komentar', 'ulasan', 'review'], 'Terima kasih telah menggunakan layanan NAVERA.');
            const rating = getValue(review, ['rating', 'stars', 'bintang'], 5);
            const date = getValue(review, ['createdAt', 'created_at', 'tanggal'], '');

            const card = document.createElement('article');
            card.className = 'review-card';

            card.innerHTML = `
                <div class="review-card-header">
                    <div class="review-avatar">${escapeHTML(name.charAt(0).toUpperCase())}</div>
                    <div class="review-person">
                        <strong>${escapeHTML(name)}</strong>
                        <small>${escapeHTML(formatDate(date))}</small>
                    </div>
                </div>
                <div class="review-stars">${renderStars(rating)}</div>
                <p>${escapeHTML(comment)}</p>
            `;

            elements.reviewsGrid.appendChild(card);
        });
    };

    const renderSettings = settings => {
        if (!elements.footerContact || !settings) return;

        const address = getValue(settings, ['address', 'alamat', 'companyAddress', 'businessAddress'], '');
        const phone = getValue(settings, ['phone', 'telephone', 'telepon', 'whatsapp', 'contactPhone'], '');
        const email = getValue(settings, ['email', 'contactEmail'], '');

        const contactItems = [];

        if (address) {
            contactItems.push(`
                <p>
                    <i class="bi bi-geo-alt"></i>
                    <span>${escapeHTML(address)}</span>
                </p>
            `);
        }

        if (phone) {
            const phoneNumber = String(phone).replace(/[^\d+]/g, '');
            const whatsappNumber = phoneNumber.replace(/^\+/, '').replace(/^0/, '62');
            contactItems.push(`
                <p>
                    <i class="bi bi-telephone"></i>
                    <a href="https://wa.me/${escapeHTML(whatsappNumber)}" target="_blank" rel="noopener">${escapeHTML(phone)}</a>
                </p>
            `);
        }

        if (email) {
            contactItems.push(`
                <p>
                    <i class="bi bi-envelope"></i>
                    <span>${escapeHTML(email)}</span>
                </p>
            `);
        }

        if (contactItems.length) {
            elements.footerContact.innerHTML = contactItems.join('');
        } else {
            elements.footerContact.innerHTML = `
                <p><i class="bi bi-geo-alt"></i><span>Informasi alamat belum diatur.</span></p>
                <p><i class="bi bi-telephone"></i><span>Informasi kontak belum diatur.</span></p>
            `;
        }
    };

    const loadPublicContent = async () => {
        try {
            const response = await getPublicData();
            const data = unwrapApiData(response);

            const products = normalizeProducts(data.products ?? data);
            const reviews = normalizeReviews(data.reviews ?? data);
            const settings = normalizeSettings(data.settings ?? data.SETTINGS ?? {});

            renderProducts(products);
            renderReviews(reviews);
            renderSettings(settings);

        } catch (error) {
            console.error('NAVERA public data:', error);

            if (elements.productStatus) {
                elements.productStatus.innerHTML = `
                    <i class="bi bi-exclamation-circle"></i>
                    Data layanan belum dapat dimuat
                `;
            }

            if (elements.productsGrid) {
                elements.productsGrid.innerHTML = '';
            }

            elements.emptyProducts?.removeAttribute('hidden');

            if (elements.reviewsGrid) {
                elements.reviewsGrid.innerHTML = '';
            }

            elements.emptyReviews?.removeAttribute('hidden');
        }
    };

    const initialize = () => {
        setupNavigation();
        setupActiveNavigation();
        setupFooter();
        loadPublicContent();

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) loadPublicContent();
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    window.NAVERA_PUBLIC = {
        reload: loadPublicContent,
        showToast
    };
})();
