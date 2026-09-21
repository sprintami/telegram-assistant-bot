import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import { env } from "../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Простой прокси-чат для самого Верстака (артефакт Claude со своей базой).
// Артефакт не может держать свой секретный ключ ChatGPT — он живёт только
// здесь. Каждый экран чата в Верстаке (дашборд, задача, агенты) шлёт сюда
// список сообщений (и, если нужно, свои инструменты — create_task и т.п.)
// и получает обратно либо финальный текст, либо запрос вызвать инструмент.
// Сам цикл "вызвал инструмент → выполнил → продолжил разговор" живёт в
// браузере (там же, где инструменты реально трогают базу артефакта) —
// этот эндпоинт делает только один шаг диалога с ChatGPT за раз.
export async function chatRoutes(app: FastifyInstance) {
  app.post("/chat", async (request, reply) => {
    const secret = request.headers["x-verstak-secret"];
    if (!env.VERSTAK_CHAT_SECRET || secret !== env.VERSTAK_CHAT_SECRET) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const body = request.body as {
      messages?: any[];
      tools?: any[];
    };
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (!messages.length) {
      return reply.code(400).send({ error: "messages required" });
    }
    const tools = Array.isArray(body?.tools) && body.tools.length ? body.tools : undefined;

    try {
      const response = await openai.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages,
        tools,
      });
      const message = response.choices[0]?.message;
      if (message?.tool_calls && message.tool_calls.length) {
        return {
          tool_calls: message.tool_calls.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          })),
        };
      }
      return { text: message?.content || "" };
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: "upstream_error" });
    }
  });
}
