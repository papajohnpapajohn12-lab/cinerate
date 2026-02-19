// Main Application
class App {
    constructor() {
        this.ratings = [];
        this.currentMovie = null;
        this.currentRating = 0;
        this.TMDB_POSTER = 'https://image.tmdb.org/t/p/w500';
    }

    init() {
        this.setupEventListeners();
        this.loadRatings();
        this.loadHomeData();
        this.restorePageState();
    }

    savePageState() {
        const activePage = document.querySelector('.page.active')?.id || 'home-page';
        localStorage.setItem('cinerate_page', activePage.replace('-page', ''));
    }

    restorePageState() {
        const savedPage = localStorage.getItem('cinerate_page');
        if (savedPage && savedPage !== 'home') {
            this.switchPage(savedPage);
        }
    }

    setupEventListeners() {
        // Logo click
        document.getElementById('logo-btn').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchPage('home');
        });

        // Confirm dialog
        document.getElementById('confirm-cancel').addEventListener('click', () => this.hideConfirm());
        document.getElementById('confirm-ok').addEventListener('click', () => this.confirmOk());
        document.getElementById('confirm-overlay').addEventListener('click', (e) => {
            if (e.target.classList.contains('confirm-overlay')) this.hideConfirm();
        });

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchPage(btn.dataset.page);
            });
        });

        // Search with debounce (live search)
        const searchInput = document.getElementById('search-input');
        const searchBtn = document.getElementById('search-btn');
        let searchTimeout;

        searchBtn.addEventListener('click', () => this.search());
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(searchTimeout);
                this.search();
            }
        });
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length === 0) {
                // Clear results if empty
                document.getElementById('search-results').innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-search"></i>
                        <h3>Начните поиск</h3>
                        <p>Введите название фильма или сериала</p>
                    </div>
                `;
            } else if (query.length >= 2) {
                // Search after 2 chars with 300ms delay
                searchTimeout = setTimeout(() => this.search(), 300);
            }
        });

        // Modal
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
        document.querySelector('.modal-overlay').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) this.closeModal();
        });

        // Rating slider
        this.setupSlider();

        // Save rating
        document.getElementById('modal-save').addEventListener('click', () => this.saveRating());

        // Watchlist button
        document.getElementById('modal-watchlist').addEventListener('click', () => this.toggleWatchlist());

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filterRatings(btn.dataset.filter);
            });
        });

        // Profile modal
        document.getElementById('profile-btn').addEventListener('click', () => this.openProfileModal());
        document.getElementById('profile-modal-close').addEventListener('click', () => this.closeProfileModal());
        document.getElementById('profile-modal-cancel').addEventListener('click', () => this.closeProfileModal());
        document.getElementById('save-profile-btn').addEventListener('click', () => this.saveProfile());
        document.getElementById('profile-modal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) this.closeProfileModal();
        });
    }

    openProfileModal() {
        const name = authManager.user?.display_name || authManager.user?.username || '';
        document.getElementById('profile-display-name').value = name;
        document.getElementById('profile-modal-avatar').textContent = name.substring(0, 2).toUpperCase();
        document.getElementById('profile-modal').classList.add('active');
    }

    closeProfileModal() {
        document.getElementById('profile-modal').classList.remove('active');
    }

    async saveProfile() {
        const displayName = document.getElementById('profile-display-name').value.trim();
        if (!displayName) {
            this.showToast('Введите имя', 'error');
            return;
        }
        try {
            await api.updateProfile(displayName);
            this.showToast('Имя сохранено!', 'success');
            this.closeProfileModal();
            // Update in auth
            if (authManager.user) {
                authManager.user.display_name = displayName;
            }
        } catch (e) {
            this.showToast('Ошибка сохранения', 'error');
        }
    }

    async loadProfile() {
        try {
            const user = await api.getMe();
            document.getElementById('profile-display-name').value = user.display_name || user.username;
        } catch (e) {
            console.error('Failed to load profile:', e);
        }
    }

    switchPage(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        document.getElementById(`${page}-page`).classList.add('active');
        document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

        if (page === 'ratings') this.renderRatings();
        if (page === 'stats') this.renderStats();
        if (page === 'watchlist') this.renderWatchlist();
        
        // Cleanup stats extra sections when leaving stats page
        if (page !== 'stats') {
            const statsExtra = document.getElementById('stats-extra');
            if (statsExtra) statsExtra.innerHTML = '';
        }
        
        this.savePageState();
        window.scrollTo(0, 0);
    }

    // Home Page
    async loadHomeData() {
        try {
            const popular = await api.getPopular();
            this.renderMovieGrid('popular-movies', popular.results.slice(0, 10));
            
            const shuffled = [...popular.results].sort(() => 0.5 - Math.random());
            this.renderMovieGrid('top-rated-movies', shuffled.slice(0, 10));
        } catch (e) {
            console.error('Failed to load home data:', e);
        }
    }

    // Search
    async search() {
        const query = document.getElementById('search-input').value.trim();
        if (!query) return;

        const container = document.getElementById('search-results');
        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Поиск...</p>
            </div>
        `;

        try {
            const data = await api.searchMovies(query);
            this.renderSearchResults(data.results);
        } catch (e) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Ошибка поиска</h3>
                    <p>${e.message}</p>
                </div>
            `;
        }
    }

    renderSearchResults(movies) {
        const container = document.getElementById('search-results');
        
        if (!movies.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>Ничего не найдено</h3>
                    <p>Попробуйте другой запрос</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `<div class="movies-grid">${movies.map(m => this.createMovieCard(m)).join('')}</div>`;
    }

    renderMovieGrid(elementId, movies) {
        const container = document.getElementById(elementId);
        if (!movies.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-film"></i>
                    <p>Нет данных</p>
                </div>
            `;
            return;
        }
        container.innerHTML = movies.map(m => this.createMovieCard(m)).join('');
    }

    createMovieCard(movie) {
        const rated = this.ratings.find(r => r.tmdb_id === movie.id);
        const year = movie.release_date ? movie.release_date.split('-')[0] : '?';
        const mediaType = movie.media_type || 'movie';
        const typeLabel = mediaType === 'tv' ? 'Сериал' : 'Фильм';
        const posterUrl = movie.poster_path ? `${this.TMDB_POSTER}${movie.poster_path}` : null;
        
        return `
            <div class="movie-card" onclick="app.openModal(${movie.id}, '${mediaType}')">
                <div class="movie-poster">
                    ${posterUrl 
                        ? `<img src="${posterUrl}" alt="${movie.title}" loading="lazy">`
                        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-hover);"><i class="fas fa-film" style="font-size:3rem;color:var(--text-muted);"></i></div>`
                    }
                    <div class="movie-rating">
                        <i class="fas fa-star"></i>
                        ${movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}
                    </div>
                    ${rated ? `<div class="movie-user-rating">${rated.user_rating} ★</div>` : ''}
                </div>
                <div class="movie-info">
                    <div class="movie-title">${movie.title || 'Без названия'}</div>
                    <div class="movie-meta">
                        <span>${year}</span>
                        <span class="movie-type ${mediaType}">${typeLabel}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Ratings
    async loadRatings() {
        try {
            this.ratings = await api.getRatings();
        } catch (e) {
            console.error('Failed to load ratings:', e);
        }
    }

    renderRatings() {
        this.loadRatings().then(() => this.filterRatings('all'));
    }

    filterRatings(filter) {
        const container = document.getElementById('ratings-list');
        let filtered = [...this.ratings];

        if (filter === 'movies') filtered = filtered.filter(r => r.media_type === 'movie' || !r.media_type);
        else if (filter === 'tv') filtered = filtered.filter(r => r.media_type === 'tv');
        else if (filter === '10') filtered = filtered.filter(r => r.user_rating === 10);
        else if (filter === 'high') filtered = filtered.filter(r => r.user_rating >= 8 && r.user_rating <= 9);
        else if (filter === 'low') filtered = filtered.filter(r => r.user_rating <= 7);

        if (!filtered.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-star"></i>
                    <h3>Пока нет оценок</h3>
                    <p>Найдите фильм и поставьте ему оценку</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(r => {
            const mediaType = r.media_type || 'movie';
            const typeLabel = mediaType === 'tv' ? 'Сериал' : 'Фильм';
            const comment = r.comment ? `<div class="movie-comment"><i class="fas fa-sticky-note"></i> ${this.escapeHtml(r.comment)}</div>` : '';
            return `
            <div class="movie-card rated">
                <div class="movie-poster" onclick="app.openModal(${r.tmdb_id}, '${mediaType}')">
                    ${r.poster_path 
                        ? `<img src="${this.TMDB_POSTER}${r.poster_path}" alt="${r.title}">`
                        : '<div class="empty-state"><i class="fas fa-film"></i></div>'
                    }
                    <div class="movie-user-rating">${r.user_rating} ★</div>
                </div>
                <div class="movie-info">
                    <div class="movie-title">${r.title}</div>
                    <div class="movie-meta">
                        <span>${r.year || '?'}</span>
                        <span class="movie-type ${mediaType}">${typeLabel}</span>
                    </div>
                    ${comment}
                    <div class="movie-actions">
                        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); app.openModal(${r.tmdb_id}, '${mediaType}')">
                            Изменить
                        </button>
                        <button class="btn btn-danger btn-sm btn-icon-only" onclick="event.stopPropagation(); app.deleteRating(${r.tmdb_id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `}).join('');
    }

    async deleteRating(tmdbId) {
        this.showConfirm('Удалить оценку?', async () => {
            try {
                await api.deleteRating(tmdbId);
                await this.loadRatings();
                this.renderRatings();
                this.showToast('Оценка удалена', 'success');
            } catch (e) {
                this.showToast('Ошибка удаления', 'error');
            }
        });
    }

    // Custom Confirm Dialog
    showConfirm(message, onConfirm) {
        this.confirmCallback = onConfirm;
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-overlay').classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    hideConfirm() {
        document.getElementById('confirm-overlay').classList.remove('active');
        document.body.style.overflow = '';
        this.confirmCallback = null;
    }

    confirmOk() {
        if (this.confirmCallback) {
            this.confirmCallback();
        }
        this.hideConfirm();
    }

    // Stats
    async renderStats() {
        this.loadProfile();
        try {
            const stats = await api.getStats();
            
            document.getElementById('stat-total').textContent = stats.total;
            document.getElementById('stat-avg').textContent = stats.average.toFixed(1);
            document.getElementById('stat-max').textContent = stats.max;
            document.getElementById('stat-min').textContent = stats.min;

            // Chart
            const max = Math.max(...Object.values(stats.distribution), 1);
            const chart = document.getElementById('rating-chart');
            chart.innerHTML = Object.entries(stats.distribution).map(([rating, count]) => {
                const height = count === 0 ? 4 : Math.max((count / max) * 160, 20);
                const zeroClass = count === 0 ? 'zero' : '';
                return `
                    <div class="chart-bar">
                        <div class="chart-bar-fill ${zeroClass}" style="height: ${height}px">
                            ${count > 0 ? `<span class="chart-bar-value">${count}</span>` : ''}
                        </div>
                        <span class="chart-bar-label">${rating}</span>
                    </div>
                `;
            }).join('');

            // Top movies
            const topList = document.getElementById('top-movies-list');
            const sorted = [...this.ratings].sort((a, b) => b.user_rating - a.user_rating).slice(0, 10);
            topList.innerHTML = sorted.length
                ? sorted.map((m, i) => `
                    <div class="top-movie-item">
                        <div class="top-movie-rank">${i + 1}</div>
                        <div class="top-movie-info">
                            <div class="top-movie-title">${m.title}</div>
                            <div class="top-movie-year">${m.year || '?'}</div>
                        </div>
                        <div class="top-movie-rating">
                            <i class="fas fa-star"></i> ${m.user_rating}
                        </div>
                    </div>
                `).join('')
                : '<p style="color: var(--text-secondary); text-align: center;">Нет данных</p>';

            // Get stats extra section
            const statsExtra = document.getElementById('stats-extra');
            if (!statsExtra) return;
            
            let extraHTML = '';
            
            // Check if any data exists
            const hasAnyData = stats.total > 0 || (stats.by_year && stats.by_year.length > 0) || (stats.genres && stats.genres.length > 0);
            
            if (!hasAnyData) {
                extraHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">Недостаточно данных для статистики</p>';
                statsExtra.innerHTML = extraHTML;
                return;
            }
            
            // By type stats
            if (stats.by_type) {
                extraHTML += `
                    <div class="top-movies-section">
                        <h2><i class="fas fa-chart-pie"></i> Фильмы vs Сериалы</h2>
                        <div class="type-stats">
                            <div class="type-stat">
                                <div class="type-icon movie"><i class="fas fa-film"></i></div>
                                <div class="type-info">
                                    <span class="type-value">${stats.by_type.movie}</span>
                                    <span class="type-label">Фильмов</span>
                                </div>
                            </div>
                            <div class="type-stat">
                                <div class="type-icon tv"><i class="fas fa-tv"></i></div>
                                <div class="type-info">
                                    <span class="type-value">${stats.by_type.tv}</span>
                                    <span class="type-label">Сериалов</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            // By Year
            if (stats.by_year && stats.by_year.length > 0) {
                const maxYearCount = Math.max(...stats.by_year.map(y => y.count));
                extraHTML += `
                    <div class="top-movies-section">
                        <h2><i class="fas fa-calendar-alt"></i> По годам</h2>
                        <div class="years-chart">
                            ${stats.by_year.map(y => `
                                <div class="year-bar-item">
                                    <span class="year-label">${y.year}</span>
                                    <div class="year-bar-track">
                                        <div class="year-bar-fill" style="width: ${(y.count / maxYearCount) * 100}%"></div>
                                    </div>
                                    <span class="year-count">${y.count}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            // Favorite genres
            if (stats.genres && stats.genres.length > 0) {
                extraHTML += `
                    <div class="top-movies-section">
                        <h2><i class="fas fa-tags"></i> По жанрам</h2>
                        <div class="genres-list">
                            ${stats.genres.map((g, i) => `
                                <div class="genre-item" style="--genre-rank: ${i}">
                                    <span class="genre-name">${this.capitalize(g.name)}</span>
                                    <span class="genre-count">${g.count}</span>
                                    <div class="genre-bar">
                                        <div class="genre-fill" style="width: ${(g.count / stats.genres[0].count) * 100}%"></div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            // Export button
            extraHTML += `
                <div class="top-movies-section">
                    <h2><i class="fas fa-download"></i> Экспорт данных</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">Скачайте все свои оценки в формате JSON</p>
                    <button class="btn btn-primary" onclick="app.exportData()">
                        <i class="fas fa-file-download"></i> Скачать JSON
                    </button>
                </div>
            `;
            
            statsExtra.innerHTML = extraHTML;
        } catch (e) {
            console.error('Stats error:', e);
            const statsExtra = document.getElementById('stats-extra');
            if (statsExtra) {
                statsExtra.innerHTML = `<p style="color: var(--danger); text-align: center;">Ошибка загрузки статистики</p>`;
            }
        }
    }

    // Modal
    async openModal(movieId, mediaType = 'movie') {
        try {
            this.currentMovie = await api.getMovie(movieId, mediaType);
            this.currentMovie.media_type = mediaType;
            const m = this.currentMovie;
            const rated = this.ratings.find(r => r.tmdb_id === movieId);

            document.getElementById('modal-title').textContent = m.title;
            document.getElementById('modal-year').textContent = m.release_date ? m.release_date.split('-')[0] : '?';
            document.getElementById('modal-genres').textContent = m.genres?.map(g => g.name).join(', ') || 'Нет жанров';
            document.getElementById('modal-tmdb-rating').textContent = m.vote_average?.toFixed(1) || '0.0';
            // Setup overview with "more" button
            const overviewEl = document.getElementById('modal-overview');
            const moreBtn = document.getElementById('overview-more');
            const overviewText = m.overview || 'Нет описания';
            
            overviewEl.textContent = overviewText;
            overviewEl.classList.remove('expanded');
            
            // Check if text is truncated (more than 4 lines)
            // Rough estimate: ~45 chars per line * 4 lines = 180 chars
            if (overviewText.length > 180) {
                moreBtn.style.display = 'inline-flex';
                moreBtn.querySelector('span').textContent = 'Ещё';
                moreBtn.querySelector('i').className = 'fas fa-chevron-down';
            } else {
                moreBtn.style.display = 'none';
            }
            
            moreBtn.onclick = () => {
                const isExpanded = overviewEl.classList.contains('expanded');
                if (isExpanded) {
                    overviewEl.classList.remove('expanded');
                    moreBtn.querySelector('span').textContent = 'Ещё';
                    moreBtn.querySelector('i').className = 'fas fa-chevron-down';
                    // Scroll back to overview
                    overviewEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    overviewEl.classList.add('expanded');
                    moreBtn.querySelector('span').textContent = 'Свернуть';
                    moreBtn.querySelector('i').className = 'fas fa-chevron-up';
                }
            };
            
            const posterEl = document.getElementById('modal-poster');
            posterEl.innerHTML = m.poster_path 
                ? `<img src="${this.TMDB_POSTER}${m.poster_path}" alt="${m.title}">`
                : '<div class="empty-state"><i class="fas fa-film"></i></div>';

            const mediaBadge = document.getElementById('modal-media-type');
            if (mediaType === 'tv') {
                mediaBadge.textContent = 'Сериал';
                mediaBadge.classList.add('tv');
            } else {
                mediaBadge.textContent = 'Фильм';
                mediaBadge.classList.remove('tv');
            }

            this.currentRating = rated ? rated.user_rating : 0;
            this.currentComment = rated ? (rated.comment || '') : '';
            this.updateRatingUI(this.currentRating);
            
            // Load existing comment
            const commentInput = document.getElementById('rating-comment-input');
            if (commentInput) {
                commentInput.value = this.currentComment;
            }
            
            // Check watchlist status
            await this.checkWatchlistStatus();

            document.querySelector('.modal-overlay').classList.add('active');
            document.body.style.overflow = 'hidden';
        } catch (e) {
            this.showToast('Ошибка загрузки', 'error');
        }
    }

    closeModal() {
        document.querySelector('.modal-overlay').classList.remove('active');
        document.body.style.overflow = '';
        this.currentMovie = null;
        this.currentRating = 0;
        this.currentComment = '';
        
        // Reset overview
        const overviewEl = document.getElementById('modal-overview');
        const moreBtn = document.getElementById('overview-more');
        if (overviewEl) overviewEl.classList.remove('expanded');
        if (moreBtn) {
            moreBtn.style.display = 'none';
            moreBtn.querySelector('span').textContent = 'Ещё';
            moreBtn.querySelector('i').className = 'fas fa-chevron-down';
        }
        
        // Reset comment input
        const commentInput = document.getElementById('rating-comment-input');
        if (commentInput) commentInput.value = '';
        
        // Reset watchlist button
        const watchlistBtn = document.getElementById('modal-watchlist');
        if (watchlistBtn) {
            watchlistBtn.classList.remove('active');
            watchlistBtn.innerHTML = '<i class="far fa-bookmark"></i>';
        }
    }

    async toggleWatchlist() {
        if (!this.currentMovie) return;
        
        const btn = document.getElementById('modal-watchlist');
        const m = this.currentMovie;
        
        try {
            // Check if already in watchlist
            const check = await api.checkWatchlist(m.id);
            
            if (check.in_watchlist) {
                // Remove from watchlist
                await api.removeFromWatchlist(m.id);
                btn.classList.remove('active');
                btn.innerHTML = '<i class="far fa-bookmark"></i>';
                this.showToast('Удалено из списка', 'success');
            } else {
                // Add to watchlist
                await api.addToWatchlist({
                    tmdb_id: m.id,
                    title: m.title,
                    year: m.release_date ? parseInt(m.release_date.split('-')[0]) : null,
                    poster_path: m.poster_path,
                    tmdb_rating: m.vote_average,
                    genres: m.genres?.map(g => g.name).join(', '),
                    overview: m.overview,
                    media_type: m.media_type || 'movie'
                });
                btn.classList.add('active');
                btn.innerHTML = '<i class="fas fa-bookmark"></i>';
                this.showToast('Добавлено в список «Смотреть позже»', 'success');
            }
            
            // Refresh watchlist if on that page
            const activePage = document.querySelector('.page.active')?.id;
            if (activePage === 'watchlist-page') this.renderWatchlist();
        } catch (e) {
            this.showToast('Ошибка', 'error');
        }
    }

    async checkWatchlistStatus() {
        if (!this.currentMovie) return;
        
        try {
            const check = await api.checkWatchlist(this.currentMovie.id);
            const btn = document.getElementById('modal-watchlist');
            
            if (check.in_watchlist) {
                btn.classList.add('active');
                btn.innerHTML = '<i class="fas fa-bookmark"></i>';
            } else {
                btn.classList.remove('active');
                btn.innerHTML = '<i class="far fa-bookmark"></i>';
            }
        } catch (e) {
            console.error('Check watchlist error:', e);
        }
    }

    async renderWatchlist() {
        try {
            const data = await api.getWatchlist();
            const container = document.getElementById('watchlist-grid');
            
            if (!data.items || data.items.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-bookmark"></i>
                        <h3>Список пуст</h3>
                        <p>Добавляйте фильмы, которые хотите посмотреть позже</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = data.items.map(item => this.createWatchlistCard(item)).join('');
        } catch (e) {
            console.error('Render watchlist error:', e);
        }
    }

    createWatchlistCard(item) {
        const year = item.year || '?';
        const mediaType = item.media_type || 'movie';
        const typeLabel = mediaType === 'tv' ? 'Сериал' : 'Фильм';
        const posterUrl = item.poster_path ? `${this.TMDB_POSTER}${item.poster_path}` : null;
        
        return `
            <div class="movie-card watchlist-card">
                <div class="movie-poster" onclick="app.openModal(${item.tmdb_id}, '${mediaType}')">
                    ${posterUrl 
                        ? `<img src="${posterUrl}" alt="${item.title}" loading="lazy">`
                        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-hover);"><i class="fas fa-film" style="font-size:3rem;color:var(--text-muted);"></i></div>`
                    }
                    <div class="movie-rating">
                        <i class="fas fa-star"></i>
                        ${item.tmdb_rating ? item.tmdb_rating.toFixed(1) : 'N/A'}
                    </div>
                </div>
                <div class="movie-info">
                    <div class="movie-title">${item.title || 'Без названия'}</div>
                    <div class="movie-meta">
                        <span>${year}</span>
                        <span class="movie-type ${mediaType}">${typeLabel}</span>
                    </div>
                    <div class="movie-actions">
                        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); app.openModal(${item.tmdb_id}, '${mediaType}')">
                            Оценить
                        </button>
                        <button class="btn btn-danger btn-sm btn-icon-only" onclick="event.stopPropagation(); app.removeFromWatchlist(${item.tmdb_id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async removeFromWatchlist(tmdbId) {
        this.showConfirm('Удалить из списка?', async () => {
            try {
                await api.removeFromWatchlist(tmdbId);
                this.renderWatchlist();
                this.showToast('Удалено из списка', 'success');
            } catch (e) {
                this.showToast('Ошибка удаления', 'error');
            }
        });
    }

    // Capitalize first letter
    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Rating descriptions
    getRatingText(rating) {
        const texts = {
            0: 'Оцените фильм',
            1: 'Ужасно',
            2: 'Плохо',
            3: 'Слабо',
            4: 'Так себе',
            5: 'Нормально',
            6: 'Хорошо',
            7: 'Отлично',
            8: 'Великолепно',
            9: 'Шедевр',
            10: 'Легенда!'
        };
        return texts[rating] || texts[0];
    }

    setupSlider() {
        const bar = document.getElementById('slider-bar');
        const fill = document.getElementById('slider-fill');
        const knob = document.getElementById('slider-knob');
        
        if (!bar) return;
        
        let isDragging = false;
        
        const updateFromX = (clientX) => {
            const rect = bar.getBoundingClientRect();
            const x = clientX - rect.left;
            const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
            const rating = Math.round((pct / 100) * 9) + 1;
            this.setRating(rating);
        };
        
        bar.addEventListener('mousedown', (e) => {
            isDragging = true;
            updateFromX(e.clientX);
        });
        
        bar.addEventListener('touchstart', (e) => {
            isDragging = true;
            updateFromX(e.touches[0].clientX);
        }, { passive: true });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                updateFromX(e.clientX);
            }
        });
        
        document.addEventListener('touchmove', (e) => {
            if (isDragging) {
                updateFromX(e.touches[0].clientX);
            }
        }, { passive: true });
        
        document.addEventListener('mouseup', () => isDragging = false);
        document.addEventListener('touchend', () => isDragging = false);
    }

    setRating(rating) {
        this.currentRating = rating;
        this.updateRatingUI(rating);
    }

    updateRatingUI(rating) {
        const valueEl = document.getElementById('rating-value');
        const textEl = document.getElementById('rating-text');
        const fill = document.getElementById('slider-fill');
        const knob = document.getElementById('slider-knob');
        const ring = document.getElementById('ring-progress');
        
        // Show 1 as default instead of dash
        const displayValue = rating > 0 ? rating : 1;
        
        // Update number and text
        if (valueEl) valueEl.textContent = displayValue;
        if (textEl) textEl.textContent = this.getRatingText(rating);
        
        // Update slider (start from 1, minimum is 1)
        const pct = ((displayValue - 1) / 9) * 100;
        if (fill) fill.style.width = pct + '%';
        if (knob) knob.style.left = pct + '%';
        
        // Update ring progress (circumference is ~339.292)
        if (ring) {
            const circumference = 339.292;
            const offset = circumference - (circumference * pct / 100);
            ring.style.strokeDashoffset = offset;
        }
    }

    highlightStars(rating) {
        this.updateRatingUI(rating);
    }

    async saveRating() {
        if (!this.currentMovie || !this.currentRating) {
            this.showToast('Выберите оценку', 'error');
            return;
        }

        const m = this.currentMovie;
        const savedRating = this.currentRating; // Save rating before closing modal
        const commentInput = document.getElementById('rating-comment-input');
        const comment = commentInput ? commentInput.value.trim() : '';
        
        try {
            await api.saveRating({
                tmdb_id: m.id,
                title: m.title,
                year: m.release_date ? parseInt(m.release_date.split('-')[0]) : null,
                poster_path: m.poster_path,
                tmdb_rating: m.vote_average,
                user_rating: savedRating,
                comment: comment,
                genres: m.genres?.map(g => g.name).join(', '),
                overview: m.overview,
                media_type: m.media_type || 'movie'
            });

            await this.loadRatings();
            this.closeModal();
            this.showToast(`Оценка ${savedRating}/10 сохранена!`, 'success');

            const activePage = document.querySelector('.page.active').id;
            if (activePage === 'ratings-page') this.renderRatings();
            if (activePage === 'home-page') this.loadHomeData();
        } catch (e) {
            this.showToast('Ошибка сохранения', 'error');
        }
    }

    // Export data
    async exportData() {
        try {
            const data = await api.request('/ratings/export');
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cinerate-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showToast('Данные экспортированы!', 'success');
        } catch (e) {
            this.showToast('Ошибка экспорта', 'error');
        }
    }

    // Toast
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
        toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

const app = new App();
window.app = app;
