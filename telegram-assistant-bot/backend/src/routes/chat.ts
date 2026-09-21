import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import { env } from "../env.js";
import { requireAuth } from "../middleware/requireAuth.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Verstak chat proxy: this is now a real site with its own backend, so the
// ChatGPT secret key lives here and is called via ordinary fetch from the
// browser - previously impossible (a Claude artifact cannot reach arbitrary
// external servers). Each chat screen (dashboard, task) sends a list of
// messages and, if needed, its own tools (create_task etc.) and gets back
// either final text or a request to call a tool. The "call tool -> run it
// -> continue conversation" loop lives in the browser (where tools actually
// touch tasks/records via /tasks and /records) - this endpoint only does
// one step of the ChatGPT conversation at a time.
export async function chatRoutes(app: FastifyInstance) {
    app.post("/chat", { preHandler: requireAuth }, async (request, reply) => {
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
