import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Отправляет историю переписки с одним из агентов верстака в Claude и
 * возвращает текст ответа. Отдельная функция (а не прямо в routes/agents.ts),
 * чтобы потом легко было добавить инструменты/tools для реальных действий агентов.
 */
export async function askAgent(systemPrompt: string, history: AgentChatMessage[]): Promise<string> {
  const response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });

  const block = response.content[0];
  return block?.type === "text" ? block.text : "(пустой ответ)";
}
