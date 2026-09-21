# Верстак — тестовый фронтенд (P0)

Минимальная проверка цепочки Telegram Mini App → бэкенд:

1. Кнопка в боте открывает эту страницу как Telegram Mini App.
2. Страница читает `Telegram.WebApp.initData` и отправляет его на бэкенд
   (`POST /auth/telegram`).
3. Бэкенд проверяет подпись, находит/создаёт пользователя, возвращает
   сессионный JWT.
4. Страница запрашивает `GET /me` и показывает: имя, username, роль,
   воркспейс.

Это НЕ финальный интерфейс Верстака — только проверка, что авторизация и
бэкенд работают end-to-end и их можно открыть как настоящий сайт.

## Стек

React + TypeScript + Vite, деплой на Vercel (как sprintami-frontend).

## Локальный запуск

```bash
npm install
cp .env.example .env.local   # укажи VITE_API_URL
npm run dev
```

Полноценно протестировать можно только внутри Telegram (нужен `initData`),
но экран "эта страница открывается только изнутри Telegram" покажется и в
обычном браузере — это ожидаемо.

## Деплой на Vercel

1. Новый проект на Vercel, импорт из GitHub-репозитория
   `sprintami/telegram-assistant-bot`.
2. Root Directory: `telegram-assistant-bot/frontend`.
3. Framework preset: Vite (определится автоматически).
4. Environment Variable: `VITE_API_URL` = адрес бэкенда на Railway.
5. После деплоя — обновить кнопку "Открыть Верстак" в боте на новый URL.
