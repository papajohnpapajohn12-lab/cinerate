# 🚀 Деплой CineRate на Vercel

## Быстрая инструкция

### 1. Создайте репозиторий на GitHub
1. Зайдите на github.com
2. Нажмите "+" → "New repository"
3. Название: `cinerate`
4. Сделайте его Public или Private
5. **НЕ** инициализируйте README (оставьте пустым)

### 2. Залейте код
В папке проекта выполните:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ВАШ_НИК/cinerate.git
git push -u origin main
```

### 3. Деплой на Vercel
1. Перейдите на vercel.com
2. Залогиньтесь через GitHub
3. "Add New Project"
4. Выберите репозиторий `cinerate`
5. Framework Preset: **Other**
6. Добавьте Environment Variables:
   ```
   TURSO_DATABASE_URL=libsql://ваша-бд.turso.io
   TURSO_AUTH_TOKEN=ваш-токен
   SECRET_KEY=любая-случайная-строка-32-символа
   TMDB_API_KEY=ваш-ключ-tmdb
   ```
7. Нажмите "Deploy"

Готово! 🎉

## Получение ключей

### Turso (база данных)
```bash
# Установите Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Логин
turso auth login

# Создайте базу
turso db create cinerate-db

# Получите URL
turso db show cinerate-db --url

# Создайте токен
turso db tokens create cinerate-db
```

### TMDB API
1. Зайдите на themoviedb.org
2. Settings → API
3. Создайте API ключ

## После деплоя

Ваш сайт будет доступен по адресу:
`https://cinerate-xxx.vercel.app`

Все данные сохраняются в облаке и доступны с любого устройства! 📱💻
