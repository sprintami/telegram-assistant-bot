import { createHmac } from "node:crypto";
import { env } from "./env.js";

export interface TelegramWebAppUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface VerifiedInitData {
  user: TelegramWebAppUser;
  authDate: number;
}

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60; // сутки — стандартная рекомендация Telegram

/**
 * Проверяет initData, которую Telegram Mini App передаёт при открытии
 * (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 *
 * Это единственный способ доказать бэкенду "я действительно открыт из
 * Telegram-бота этого юзера", а не просто ссылка, скопированная в браузер.
 * Без этой проверки любой мог бы прислать произвольный telegram_id.
 */
export function verifyTelegramInitData(initData: string): VerifiedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("initData без hash — не похоже на настоящий Telegram Mini App запрос");
  }
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(env.BOT_TOKEN).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) {
    throw new Error("Подпись initData не совпадает — запрос не от Telegram");
  }

  const authDate = Number(params.get("auth_date") || 0);
  const ageSeconds = Date.now() / 1000 - authDate;
  if (!authDate || ageSeconds > MAX_INIT_DATA_AGE_SECONDS) {
    throw new Error("initData устарела, откройте Верстак заново из бота");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new Error("initData без данных пользователя");
  }

  const user = JSON.parse(userRaw) as TelegramWebAppUser;
  return { user, authDate };
}
