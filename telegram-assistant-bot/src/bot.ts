import { Bot, InlineKeyboard } from "grammy";
import { env } from "./env.js";
import {
  getOrCreateProfile,
  replaceProfile,
  appendToProfile,
  saveMessage,
  getRecentMessages,
  getSummary,
} from "./db.js";
import { askClaude, transcribeVoice } from "./ai.js";
import { maintainMemory } from "./memory.js";

const bot = new Bot(env.BOT_TOKEN);

// --- Бот только для владельца: посторонним не отвечаем ---
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== env.OWNER_TELEGRAM_ID) {
    return; // молча игнорируем чужих
  }
  await next();
});

// Настоящая кнопка Mini App: открывает Верстак поверх чата, без выхода в браузер.
const verstakKeyboard = new InlineKeyboard().webApp("🛠 Открыть верстак", env.VERSTAK_WEBAPP_URL);

bot.command("start", async (ctx) => {
  getOrCreateProfile(ctx.from!.id);
  await ctx.reply(
    "Привет, Булат. Это твой личный ассистент на Claude.\n\n" +
      "— Пиши сюда как в обычный чат — отвечает Claude, с учётом твоего профиля и истории разговоров.\n" +
      "— /profile — посмотреть, что бот о тебе знает.\n" +
      "— /setprofile <текст> — переписать профиль целиком.\n" +
      "— /remember <факт> — быстро добавить факт в память (например: /remember у METALIZM новый цех на Седова 24).\n" +
      "— Кнопка «Открыть верстак» — открывает верстак (там роли-агенты: Дизайнер, Финансист, Юрист, Маркетолог).",
    { reply_markup: verstakKeyboard }
  );
});

bot.command("profile", async (ctx) => {
  const profile = getOrCreateProfile(ctx.from!.id);
  await ctx.reply(
    profile.profile_text.trim()
      ? `Текущий профиль:\n\n${profile.profile_text}\n\n` +
          "Чтобы переписать его целиком, пришли: /setprofile <новый текст>"
      : "Профиль пока пуст. Заполни его командой:\n/setprofile <текст о себе: бизнесы, стиль общения, договорённости>"
  );
});

bot.command("setprofile", async (ctx) => {
  const text = ctx.match?.toString().trim();
  if (!text) {
    await ctx.reply("Использование: /setprofile <текст профиля целиком>");
    return;
  }
  replaceProfile(ctx.from!.id, text);
  await ctx.reply("Профиль обновлён.");
});

bot.command("remember", async (ctx) => {
  const text = ctx.match?.toString().trim();
  if (!text) {
    await ctx.reply("Использование: /remember <короткий факт для запоминания>");
    return;
  }
  appendToProfile(ctx.from!.id, `- ${text}`);
  await ctx.reply("Запомнил.");
});

// --- Общая логика ответа: и обычный текст, и текст, распознанный из голосового,
// проходят через один и тот же путь (профиль + память + Claude/ChatGPT). ---
async function respondToUserText(ctx: any, telegramId: number, userText: string) {
  const profile = getOrCreateProfile(telegramId);

  saveMessage(telegramId, "user", userText);
  await ctx.replyWithChatAction("typing");

  const history = getRecentMessages(telegramId);
  const summary = getSummary(telegramId);

  let answer: string;
  try {
    answer = await askClaude(
      profile.profile_text,
      summary,
      history.map((m) => ({ role: m.role, content: m.content }))
    );
  } catch (err) {
    console.error("Claude API error:", err);
    const message = err instanceof Error ? err.message : String(err);
    const hint = message.includes("credit balance")
      ? "На аккаунте Claude API закончился баланс — пополните на console.anthropic.com → Plans & Billing."
      : "Проверьте логи на Railway для деталей.";
    await ctx.reply(`⚠️ Не смог получить ответ от Claude.\n${hint}`);
    return;
  }

  saveMessage(telegramId, "assistant", answer);
  await ctx.reply(answer, { reply_markup: verstakKeyboard });

  // сжатие памяти — не блокирует ответ пользователю
  maintainMemory(telegramId).catch((err) => console.error("maintainMemory failed:", err));
}

// --- Обычные текстовые сообщения — уходят Claude ---
bot.on("message:text", async (ctx) => {
  await respondToUserText(ctx, ctx.from.id, ctx.message.text);
});

// --- Голосовые сообщения — сначала распознаём через Whisper, дальше как обычный текст ---
bot.on("message:voice", async (ctx) => {
  const telegramId = ctx.from.id;
  await ctx.replyWithChatAction("typing");

  let transcript: string;
  try {
    const file = await ctx.getFile();
    if (!file.file_path) throw new Error("Telegram не вернул путь к файлу голосового");
    const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Не удалось скачать голосовое (HTTP ${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    transcript = await transcribeVoice(buffer, "voice.ogg");
  } catch (err) {
    console.error("Ошибка распознавания голосового:", err);
    const message = err instanceof Error ? err.message : String(err);
    const hint = message.includes("OPENAI_API_KEY")
      ? "Для распознавания голоса нужен OPENAI_API_KEY на Railway — сейчас он не задан."
      : "Проверьте логи на Railway для деталей.";
    await ctx.reply(`⚠️ Не смог распознать голосовое.\n${hint}`);
    return;
  }

  if (!transcript) {
    await ctx.reply("⚠️ Не расслышал — в голосовом не нашлось речи. Попробуйте ещё раз или напишите текстом.");
    return;
  }

  await ctx.reply(`🎙 Распознал: «${transcript}»`);
  await respondToUserText(ctx, telegramId, transcript);
});

bot.catch((err) => {
  console.error("Ошибка бота:", err);
});

bot.start();
console.log("Бот запущен.");
