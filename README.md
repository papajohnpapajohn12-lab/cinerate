# 🎬 CineRate — Ваш личный кинодневник

<img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white">
<img src="https://img.shields.io/badge/Turso-003B57?style=for-the-badge&logo=sqlite&logoColor=white">
<img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white">

**CineRate** — это уютное веб-приложение для оценки фильмов и сериалов с сохранением данных в облачную базу данных.

## ✨ Возможности

- 🔍 **Поиск фильмов** — через TMDB API
- ⭐ **Оценки 1-10** — с комментариями и заметками
- 🔖 **Смотреть позже** — список отложенных фильмов
- 📊 **Статистика** — по жанрам, годам, типам
- 📱 **Адаптивный дизайн** — работает на всех устройствах
- ☁️ **Облачное хранение** — данные не теряются

## 🚀 Быстрый старт (Локально)

```bash
# 1. Backend
cd backend
.\venv\Scripts\python.exe run.py

# 2. Frontend (в другом окне)
cd ..
python -m http.server 3000
```

Откройте: http://localhost:3000

## 🌐 Деплой

См. [DEPLOY.md](DEPLOY.md) для инструкций по развёртыванию на Vercel + Render.

## 🛠 Технологии

- **Frontend**: Vanilla JS, CSS3
- **Backend**: FastAPI (Python)
- **Database**: Turso (SQLite on edge)
- **API**: TMDB (The Movie Database)
- **Hosting**: Vercel + Render

## 📝 Переменные окружения

```env
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
SECRET_KEY=your-secret-key
TMDB_API_KEY=your-tmdb-key
```

## 📄 Лицензия

MIT License
