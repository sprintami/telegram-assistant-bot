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
import { askClaude } from "./ai.js";
import { maintainMemory } from "./memory.js";

const bot = new Bot(env.BOT_TOKEN);

// --- Бот только для владельца: посторонним не отвечаем ---
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== env.OWNER_TELEGRAM_ID) {
    return; // молча игнорируем чужих
  }
  await next();
});

// Обычная кнопка-ссылка (не Mini App): открывает Верстак в браузере/встроенном
// браузере Telegram. Надёжнее для старта, чем нативная встройка Mini App —
// та требует, чтобы сама страница разрешала показ внутри Telegram, а верстак
// пока живёт на claude.ai и это не гарантировано.
const verstakKeyboard = new InlineKeyboard().url("🛠 Открыть верстак", env.VERSTAK_WEBAPP_URL);

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

// --- Обычные текстовые сообщения — уходят Claude ---
bot.on("message:text", async (ctx) => {
  const telegramId = ctx.from.id;
  const profile = getOrCreateProfile(telegramId);
  const userText = ctx.message.text;

  saveMessage(telegramId, "user", userText);
  await ctx.replyWithChatAction("typing");

  const history = getRecentMessages(telegramId);
  const summary = getSummary(telegramId);

  const answer = await askClaude(
    profile.profile_text,
    summary,
    history.map((m) => ({ role: m.role, content: m.content }))
  );

  saveMessage(telegramId, "assistant", answer);
  await ctx.reply(answer, { reply_markup: verstakKeyboard });

  // сжатие памяти — не блокирует ответ пользователю
  maintainMemory(telegramId).catch((err) => console.error("maintainMemory failed:", err));
});

bot.catch((err) => {
  console.error("Ошибка бота:", err);
});

bot.start();
console.log("Бот запущен.");
