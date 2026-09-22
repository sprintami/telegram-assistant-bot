import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}. Смотрите .env.example`);
  }
  return value;
}

export const env = {
  BOT_TOKEN: required("BOT_TOKEN"),
  OWNER_TELEGRAM_ID: Number(required("OWNER_TELEGRAM_ID")),
  ANTHROPIC_API_KEY: required("ANTHROPIC_API_KEY"),
  // Запасной ИИ-провайдер: используется, если Claude недоступен (например,
  // закончился баланс на Anthropic API). Необязателен — если не задан,
  // бот просто не переключается и показывает обычную ошибку.
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  VERSTAK_WEBAPP_URL: required("VERSTAK_WEBAPP_URL"),
  // Путь к файлу базы SQLite. На Railway указываем путь внутри примонтированного volume,
  // чтобы данные не терялись при каждом передеплое.
  DB_PATH: process.env.DB_PATH || "./data/bot.db",

  // Публичный URL бэкенда верстака (backend/src/server.ts) — нужен, чтобы
  // личный бот мог читать реальные данные верстака через /internal/context
  // (см. src/ai.ts, инструмент get_verstak_data).
  BACKEND_BASE_URL: required("BACKEND_BASE_URL"),
  // Тот же секрет, что и INTERNAL_API_KEY у бэкенда — общий пароль для
  // server-to-server запросов бота к /internal/*.
  INTERNAL_API_KEY: required("INTERNAL_API_KEY"),
};
