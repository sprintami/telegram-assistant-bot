import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";
import { taskTools, executeTaskTool } from "./tools/tasks.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export type ChatMessage = { role: "user" | "assistant"; content: string };

// Контекст, нужный агенту, чтобы выполнять инструменты (заводить/менять задачи)
// от имени конкретного воркспейса и с пометкой, какой агент это сделал.
export interface AgentContext {
  workspaceId: string;
  agentKey: string;
}

const MAX_TOOL_ROUNDS = 5;

/**
 * Один "ход" разговора с агентом. В отличие от простого запроса к Claude —
 * это цикл (agentic loop): если Claude решает вызвать инструмент (создать/
 * изменить/прочитать задачи), мы выполняем его на нашей стороне и отдаём
 * результат обратно Claude, пока он не сформулирует финальный текстовый
 * ответ (или не кончится лимит попыток — защита от зацикливания).
 */
export async function askAgent(
  systemPrompt: string,
  history: ChatMessage[],
  context: AgentContext
): Promise<string> {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools: taskTools as Anthropic.Tool[],
    });

    if (response.stop_reason !== "tool_use") {
      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const result = await executeTaskTool(
        block.name,
        block.input,
        context.workspaceId,
        context.agentKey
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "Не получилось довести ответ до конца за разумное число шагов — попробуй переформулировать запрос.";
}
