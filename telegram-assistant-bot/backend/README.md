# Верстак — бэкенд (P0: фундамент)

Отдельный сервис внутри репозитория `telegram-assistant-bot`. Не трогает и не
зависит от кода бота (`../src`) — только использует тот же `BOT_TOKEN` и
`OWNER_TELEGRAM_ID`, чтобы проверять, что запрос действительно пришёл из
Telegram Mini App этого бота.

## Что уже есть (P0)

- Postgres + Prisma: модели `Workspace` и `User`.
- Авторизация через Telegram Mini App `initData` (`POST /auth/telegram`) —
  проверяется криптографическая подпись, доказывающая, что запрос пришёл из
  настоящего Telegram, а не просто скопированная ссылка.
- Первый вход владельца (`OWNER_TELEGRAM_ID`) автоматически создаёт воркспейс
  и делает его `OWNER`. Остальным пока нужно, чтобы их явно завели в системе —
  открытой саморегистрации в P0 нет (это следующий шаг: приглашения).
- Сессионный JWT (`POST /auth/telegram` возвращает `token`, дальше он идёт в
  заголовке `Authorization: Bearer <token>`).
- `GET /me` — проверка сессии, возвращает пользователя и его воркспейс.

## Чего специально нет в P0

Спецом не делалось сейчас (следующие шаги согласно плану):
- Задачи/продажи/производство/документы — модели данных бизнеса.
- Реальное AI-действие (`create_task` и т.п.) через контролируемый слой tools.
- Приглашение коллег в воркспейс.
- Учёт использования ИИ (токены/стоимость).
- OpenAI-интеграция.

## Локальный запуск

```bash
cd backend
cp .env.example .env   # заполнить DATABASE_URL, BOT_TOKEN, OWNER_TELEGRAM_ID, JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run dev
```

## Деплой на Railway

Разворачивается как отдельный сервис в том же Railway-проекте, что и бот:

1. Новый сервис → источник: тот же GitHub-репозиторий `telegram-assistant-bot`.
2. Root Directory сервиса: `telegram-assistant-bot/backend`.
3. Подключить Postgres-плагин к этому сервису — `DATABASE_URL` подставится
   автоматически.
4. Переменные окружения: `BOT_TOKEN`, `OWNER_TELEGRAM_ID`, `JWT_SECRET`,
   `ALLOWED_ORIGINS` (домен будущего фронтенда/Mini App).
5. Build command: `npm run build` (выполняет `prisma generate` + `tsc`).
6. Перед первым стартом (или в Railway "Deploy Command"): `npm run prisma:migrate`
   — накатывает миграции на прод-базу.
7. Start command: `npm start`.

## Проверка

```bash
curl https://<домен-бэкенда>/health
# {"ok":true}
```

Логин из настоящего Mini App проверяется через `window.Telegram.WebApp.initData`
на фронтенде — это следующий шаг (когда фронтенд Верстака переедет с Claude
Artifact на собственный React-фронт, который сможет ходить в этот бэкенд).
