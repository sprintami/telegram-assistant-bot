import Anthropic from "@anthropic-ai/sdk";
import OpenAI, { toFile } from "openai";
import { env } from "./env.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
// OpenAI подключаем как запасной вариант — пока не пополнен баланс Claude API,
// бот всё равно должен отвечать. Если OPENAI_API_KEY не задан, просто не используется.
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Базовый бизнес-контекст владельца — вшит всегда, независимо от того, заполнил ли
// Булат /setprofile. Без этого блока бот отвечал как чистый лист ("нет информации о
// компании Метализм", "нет доступа к интернету") — а должен вести себя как полноценный
// бизнес-ассистент, знающий, чем владелец занимается, с первой же реплики.
const BUSINESS_CONTEXT = `Контекст бизнесов Булата (предприниматель из Казани):
— METALIZM: печать фото на алюминии (ультра-глянец), гидроабразивная резка. B2C — портреты по фото на металле. B2B — коммерческая недвижимость, дропшиппинг, контрактное производство, аутсорс для типографий. У METALIZM есть свой Telegram-бот с ИИ-продажами («Лида»).
— Принт Бар (Print Bar): выездная мобильная печать — 5 форматов за 15 минут на месте; цель — развитие во франшизу.
— Спринтами (Sprintami): типография и производство широкого профиля — отдельное направление, близкое к Принт Бару, но не то же самое.
— ARE Space / ARE Group: цифровая экосистема для управления коммерческой недвижимостью под брендом METALIZM.
— Юридически всё оформлено через ИП Степанов Денис Николаевич.
— Булат называет себя «коммерческим коннектором с харизмой» — продаёт не товар, а более сильную версию будущего клиента.
Это твои базовые знания по умолчанию, используй их сразу и уверенно. Если реального доступа к интернету у тебя нет — не извиняйся за это и не изображай беспомощность: отвечай по существу на основе контекста и здравого бизнес-смысла, а если каких-то конкретных цифр или свежих данных не хватает — прямо скажи, каких именно, и предложи, откуда их взять, вместо общего "у меня нет информации".`;

// Собираем системный промпт: базовый бизнес-контекст + профиль пользователя + сжатая память
function buildSystemPrompt(profileText: string, summary: string): string {
  const parts = [
    "Ты — личный бизнес-ассистент Булата внутри его Telegram-бота: полноценный помощник по его делам, а не универсальный чат-бот общего назначения. Отвечай по делу, без лишней воды, уверенно и конкретно.",
    BUSINESS_CONTEXT,
  ];
  if (profileText.trim()) {
    parts.push(`Дополнительные известные факты о пользователе (профиль):\n${profileText.trim()}`);
  }
  if (summary.trim()) {
    parts.push(`Резюме предыдущих разговоров:\n${summary.trim()}`);
  }
  return parts.join("\n\n");
}

async function askOpenAI(system: string, history: ChatTurn[], maxTokens: number): Promise<string> {
  if (!openai) {
    throw new Error("OPENAI_API_KEY не задан — запасной вариант недоступен");
  }
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: maxTokens,
    messages: [{ role: "system", content: system }, ...history],
  });
  return response.choices[0]?.message?.content?.trim() || "(пустой ответ)";
}

export async function askClaude(
  profileText: string,
  summary: string,
  history: ChatTurn[]
): Promise<string> {
  const system = buildSystemPrompt(profileText, summary);
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });
    const block = response.content[0];
    return block.type === "text" ? block.text : "(пустой ответ)";
  } catch (err) {
    if (!openai) throw err;
    // Claude недоступен (например, закончился баланс на Anthropic API) —
    // временно отвечаем через ChatGPT, чтобы бот не молчал.
    console.error("Claude недоступен, переключаюсь на ChatGPT:", err);
    return askOpenAI(system, history, 1024);
  }
}

// Распознаём голосовое сообщение через Whisper (OpenAI) — у Anthropic нет своего STT,
// поэтому для этой функции всегда нужен OPENAI_API_KEY, даже если чат отвечает через Claude.
export async function transcribeVoice(audioBuffer: Buffer, filename = "voice.ogg"): Promise<string> {
  if (!openai) {
    throw new Error("OPENAI_API_KEY не задан — распознавание голоса недоступно");
  }
  const file = await toFile(audioBuffer, filename);
  const result = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language: "ru",
  });
  return (result.text || "").trim();
}

// Сжимаем старые сообщения в короткое резюме
export async function summarize(previousSummary: string, turnsToCompress: ChatTurn[]): Promise<string> {
  const transcript = turnsToCompress
    .map((t) => `${t.role === "user" ? "Булат" : "Ассистент"}: ${t.content}`)
    .join("\n");

  const system =
    "Обнови краткое резюме разговора с пользователем Булатом. Сохраняй только факты, договорённости и решения, которые важны для будущих диалогов. Пиши по-русски, компактно, без вводных фраз.";
  const userMessage = `Текущее резюме:\n${previousSummary || "(пусто)"}\n\nНовые сообщения для добавления:\n${transcript}\n\nВерни обновлённое резюме целиком.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      system,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = response.content[0];
    return block.type === "text" ? block.text : previousSummary;
  } catch (err) {
    if (!openai) return previousSummary;
    try {
      console.error("Claude недоступен для summarize, переключаюсь на ChatGPT:", err);
      return await askOpenAI(system, [{ role: "user", content: userMessage }], 512);
    } catch (err2) {
      console.error("ChatGPT тоже не сработал для summarize:", err2);
      return previousSummary;
    }
  }
}
