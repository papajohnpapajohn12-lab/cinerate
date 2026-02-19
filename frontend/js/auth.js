// Auth Manager
class AuthManager {
    constructor() {
        this.user = null;
        this.init();
    }

    init() {
        // Check token
        if (api.token) {
            this.loadUser();
        } else {
            this.showAuth();
        }

        // Event listeners
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        document.getElementById('register-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.register();
        });

        document.getElementById('show-register').addEventListener('click', () => {
            this.showForm('register');
        });

        document.getElementById('show-login').addEventListener('click', () => {
            this.showForm('login');
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });
    }

    showAuth() {
        document.getElementById('auth-page').style.display = 'flex';
        document.getElementById('app-container').classList.remove('show');
        this.showForm('login');
    }

    showApp() {
        document.getElementById('auth-page').style.display = 'none';
        document.getElementById('app-container').classList.add('show');
        
        // Update profile button with user initials if it exists
        const profileBtn = document.getElementById('profile-btn');
        if (profileBtn && this.user) {
            const initials = (this.user.display_name || this.user.username).substring(0, 2).toUpperCase();
            profileBtn.innerHTML = `<div class="user-avatar" style="width: 36px; height: 36px; background: var(--gradient-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; color: white;">${initials}</div>`;
            profileBtn.title = this.user.display_name || this.user.username;
        }

        window.app.init();
    }

    showForm(type) {
        document.getElementById('login-form').style.display = type === 'login' ? 'block' : 'none';
        document.getElementById('register-form').style.display = type === 'register' ? 'block' : 'none';
        
        // Clear errors
        document.getElementById('login-error').classList.remove('show');
        document.getElementById('register-error').classList.remove('show');
    }

    async loadUser() {
        try {
            this.user = await api.getMe();
            this.showApp();
        } catch (e) {
            this.logout();
        }
    }

    async login() {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            const res = await api.login(username, password);
            api.token = res.access_token;
            localStorage.setItem('token', res.access_token);
            this.user = res.user;
            this.showApp();
            window.app.showToast('Добро пожаловать! 👋', 'success');
        } catch (e) {
            this.showError('login', e.message);
        }
    }

    async register() {
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const displayName = document.getElementById('reg-display-name').value;

        if (password.length < 4) {
            this.showError('register', 'Пароль минимум 4 символа');
            return;
        }

        try {
            const res = await api.register(username, password, displayName || username);
            api.token = res.access_token;
            localStorage.setItem('token', res.access_token);
            this.user = res.user;
            this.showApp();
            window.app.showToast('Аккаунт создан! 🎉', 'success');
        } catch (e) {
            this.showError('register', e.message);
        }
    }

    logout() {
        api.token = null;
        localStorage.removeItem('token');
        this.user = null;
        this.showAuth();
    }

    showError(form, msg) {
        const el = document.getElementById(`${form}-error`);
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 5000);
    }
}

const authManager = new AuthManager();
