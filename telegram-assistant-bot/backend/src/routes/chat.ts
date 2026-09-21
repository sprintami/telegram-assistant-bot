import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import { env } from "../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Простой прокси-чат для самого Верстака (артефакт Claude со своей базой).
// Артефакт не может держать свой секретный ключ ChatGPT — он живёт только
// здесь. Каждый экран чата в Верстаке (дашборд, задача, агенты) шлёт сюда
// список сообщений и получает обратно ответ ChatGPT.
export async function chatRoutes(app: FastifyInstance) {
  app.post("/chat", async (request, reply) => {
    const secret = request.headers["x-verstak-secret"];
    if (!env.VERSTAK_CHAT_SECRET || secret !== env.VERSTAK_CHAT_SECRET) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const body = request.body as {
      messages?: { role: string; content: string }[];
    };
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (!messages.length) {
      return reply.code(400).send({ error: "messages required" });
    }

    try {
      const response = await openai.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: messages.map((m) => ({
          role:
            m.role === "assistant"
              ? "assistant"
              : m.role === "system"
              ? "system"
              : "user",
          content: m.content,
        })),
      });
      const text = response.choices[0]?.message?.content || "";
      return { text };
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: "upstream_error" });
    }
  });
}
