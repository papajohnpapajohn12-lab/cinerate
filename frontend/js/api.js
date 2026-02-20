// API Client
// Same domain for Fly.io deployment
const API_URL = '/api';

class API {
    constructor() {
        this.token = localStorage.getItem('token');
    }

    async request(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(`${API_URL}${url}`, {
                ...options,
                headers
            });

            if (!response.ok) {
                let errorMsg = `Error ${response.status}`;
                try {
                    const error = await response.json();
                    errorMsg = error.detail || error.message || `Error ${response.status}`;
                } catch (e) {
                    errorMsg = `Server error ${response.status}`;
                }
                throw new Error(errorMsg);
            }

            return response.json();
        } catch (e) {
            if (e.message.includes('Failed to fetch')) {
                throw new Error('Cannot connect to server. Is the backend running?');
            }
            throw e;
        }
    }

    // Auth
    login(username, password) {
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    }

    register(username, password, display_name) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, display_name })
        });
    }

    getMe() {
        return this.request('/auth/me');
    }

    updateProfile(displayName) {
        return this.request('/auth/update_profile', {
            method: 'POST',
            body: JSON.stringify({ display_name: displayName })
        });
    }

    // Movies
    searchMovies(query) {
        return this.request(`/movies/search?query=${encodeURIComponent(query)}`);
    }

    getPopular() {
        return this.request('/movies/popular');
    }

    getTopRated() {
        return this.request('/movies/top_rated');
    }

    getMovie(id, mediaType = 'movie') {
        return this.request(`/movies/${id}?media_type=${mediaType}`);
    }

    // Ratings
    getRatings() {
        return this.request('/ratings');
    }

    saveRating(data) {
        return this.request('/ratings', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    deleteRating(tmdbId) {
        return this.request(`/ratings/${tmdbId}`, {
            method: 'DELETE'
        });
    }

    getStats() {
        return this.request('/ratings/stats');
    }

    // Watchlist
    getWatchlist() {
        return this.request('/watchlist');
    }

    addToWatchlist(data) {
        return this.request('/watchlist', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    removeFromWatchlist(tmdbId) {
        return this.request(`/watchlist/${tmdbId}`, {
            method: 'DELETE'
        });
    }

    checkWatchlist(tmdbId) {
        return this.request(`/watchlist/check/${tmdbId}`);
    }
}

const api = new API();
