import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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

export async function askClaude(
  profileText: string,
  summary: string,
  history: ChatTurn[]
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: buildSystemPrompt(profileText, summary),
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "(пустой ответ)";
}

// Сжимаем старые сообщения в короткое резюме
export async function summarize(previousSummary: string, turnsToCompress: ChatTurn[]): Promise<string> {
  const transcript = turnsToCompress
    .map((t) => `${t.role === "user" ? "Булат" : "Ассистент"}: ${t.content}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    system:
      "Обнови краткое резюме разговора с пользователем Булатом. Сохраняй только факты, договорённости и решения, которые важны для будущих диалогов. Пиши по-русски, компактно, без вводных фраз.",
    messages: [
      {
        role: "user",
        content: `Текущее резюме:\n${previousSummary || "(пусто)"}\n\nНовые сообщения для добавления:\n${transcript}\n\nВерни обновлённое резюме целиком.`,
      },
    ],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : previousSummary;
}
