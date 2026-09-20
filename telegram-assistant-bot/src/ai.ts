import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "./env.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
// OpenAI подключаем как запасной вариант — пока не пополнен баланс Claude API,
// бот всё равно должен отвечать. Если OPENAI_API_KEY не задан, просто не используется.
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Собираем системный промпт: кто пользователь + сжатая память о старых разговорах
function buildSystemPrompt(profileText: string, summary: string): string {
  const parts = [
    "Ты — личный ИИ-ассистент Булата внутри его Telegram-бота. Отвечай по делу, без лишней воды.",
  ];
  if (profileText.trim()) {
    parts.push(`Известные факты о пользователе (профиль):\n${profileText.trim()}`);
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
