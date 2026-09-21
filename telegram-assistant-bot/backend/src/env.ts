import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}. Смотрите .env.example`);
  }
  return value;
}

export const env = {
  // Postgres connection string — на Railway подставляется автоматически
  // при подключении Postgres-плагина к этому сервису.
  DATABASE_URL: required("DATABASE_URL"),

  // Токен Telegram-бота — используется ТОЛЬКО для проверки подписи initData
  // (доказательство, что запрос реально пришёл из Telegram Mini App этого бота).
  // Тот же токен, что и у бота в telegram-assistant-bot/src/env.ts (BOT_TOKEN).
  BOT_TOKEN: required("BOT_TOKEN"),

  // Секрет для подписи собственных сессионных JWT бэкенда (не путать с BOT_TOKEN).
  JWT_SECRET: required("JWT_SECRET"),

  PORT: Number(process.env.PORT || 3000),

  // Через запятую — какие домены фронтенда/mini app пускать через CORS.
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Имя воркспейса, которое создаётся при первом входе владельца (если
  // воркспейса ещё нет). Дальше воркспейс переименовывается через API/UI.
  DEFAULT_WORKSPACE_NAME: process.env.DEFAULT_WORKSPACE_NAME || "Мой бизнес",

  // Telegram ID владельца — первый, кто логинится под этим ID, становится OWNER нового
  // воркспейса. Совпадает с OWNER_TELEGRAM_ID бота.
  OWNER_TELEGRAM_ID: Number(required("OWNER_TELEGRAM_ID")),

  // Ключ Anthropic API — им отвечают ИИ-агенты верстака (Claude).
  // Может быть тем же ключом, что и у бота (на Railway проброшено ссылкой на
  // переменную сервиса bot, чтобы не хранить второй копией секрета вручную).
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),

  // Модель Claude для ответов агентов. То же значение, что и в боте.
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
};
