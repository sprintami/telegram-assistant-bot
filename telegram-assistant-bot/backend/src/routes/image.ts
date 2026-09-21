import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import { env } from "../env.js";
import { requireAuth } from "../middleware/requireAuth.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const VALID_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;
type ImageSize = (typeof VALID_SIZES)[number];

// Генерация изображений для навыка «нарисуй» у ИИ-агента Верстака — тот же
// принцип, что и /chat: секретный ключ OpenAI живёт только на бэкенде,
// фронтенд просит "нарисуй X" и получает готовую картинку как base64, которую
// tool generate_image (см. workspaceTools в public/index.html) тут же
// прикрепляет к задаче файлом — открывается тем же просмотрщиком, что и
// обычные файлы (openFileViewer уже умеет показывать картинки).
export async function imageRoutes(app: FastifyInstance) {
  app.post("/image", { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { prompt?: string; size?: string };
    const prompt = (body?.prompt || "").trim();
    if (!prompt) {
      return reply.code(400).send({ error: "prompt required" });
    }
    const size: ImageSize = VALID_SIZES.includes(body?.size as ImageSize)
      ? (body!.size as ImageSize)
      : "1024x1024";

    try {
      const result = await openai.images.generate({
        model: "gpt-image-1",
        prompt: prompt.slice(0, 4000),
        size,
        n: 1,
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) {
        return reply.code(502).send({ error: "no image returned" });
      }
      return { b64 };
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: "upstream_error" });
    }
  });
}
