import OpenAI from "openai";
import { env } from "./env.js";
import { taskTools, executeTaskTool } from "./tools/tasks.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export type ChatMessage = { role: "user" | "assistant"; content: string };

// Контекст, нужный агенту, чтобы выполнять инструменты (заводить/менять задачи)
// от имени конкретного воркспейса и с пометкой, какой агент это сделал.
export interface AgentContext {
  workspaceId: string;
  agentKey: string;
}

const MAX_TOOL_ROUNDS = 5;

// Инструменты описаны в формате Anthropic (name/description/input_schema).
// OpenAI ждёт формат function-calling — конвертируем один раз при старте.
const openaiTools = (taskTools as any[]).map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  },
}));

/**
 * Один "ход" разговора с агентом. Агентный цикл: если модель решает вызвать
 * инструмент (создать/изменить/прочитать задачи), мы выполняем его на своей
 * стороне и отдаём результат обратно модели, пока она не даст финальный ответ
 * (или не кончится лимит шагов).
 */
export async function askAgent(
  systemPrompt: string,
  history: ChatMessage[],
  context: AgentContext
): Promise<string> {
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages,
      tools: openaiTools,
    });

    const message = response.choices[0].message;

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return (message.content || "").trim();
    }

    messages.push({
      role: "assistant",
      content: message.content,
      tool_calls: message.tool_calls,
    });

    for (const toolCall of message.tool_calls) {
      const args = toolCall.function.arguments
        ? JSON.parse(toolCall.function.arguments)
        : {};
      const result = await executeTaskTool(
        toolCall.function.name,
        args,
        context.workspaceId,
        context.agentKey
      );
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  return "Не получилось довести ответ до конца за разумное число шагов — попробуй переформулировать запрос.";
}
