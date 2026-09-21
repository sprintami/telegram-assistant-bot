import "dotenv/config";

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
          throw new Error(`Missing environment variable ${name}. See .env.example`);
    }
    return value;
}

export const env = {
    // Postgres connection string - auto-set by Railway when Postgres is
    // attached to this service.
    DATABASE_URL: required("DATABASE_URL"),

    // Telegram bot token - used ONLY to verify the initData signature (proof
    // that a request really came from this bot's Telegram Mini App). Same
    // token as BOT_TOKEN in telegram-assistant-bot/src/env.ts.
    BOT_TOKEN: required("BOT_TOKEN"),

    // Secret for signing the backend's own session JWTs (not the same as BOT_TOKEN).
    JWT_SECRET: required("JWT_SECRET"),

    PORT: Number(process.env.PORT || 3000),

    // Comma-separated list of frontend/mini app origins allowed through CORS.
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),

    // Workspace name created on the owner's first login (if none exists yet).
    DEFAULT_WORKSPACE_NAME: process.env.DEFAULT_WORKSPACE_NAME || "My business",

    // Telegram ID of the owner - the first person to log in with this ID
    // becomes OWNER of the new workspace. Matches the bot's OWNER_TELEGRAM_ID.
    OWNER_TELEGRAM_ID: Number(required("OWNER_TELEGRAM_ID")),

    // OpenAI API key - powers the single verstak assistant (ChatGPT).
    // Same key as the bot's personal assistant (wired on Railway as a
    // reference to the bot service's variable, so the secret isn't duplicated).
    OPENAI_API_KEY: required("OPENAI_API_KEY"),

    // OpenAI model for assistant replies.
    OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o",
};
