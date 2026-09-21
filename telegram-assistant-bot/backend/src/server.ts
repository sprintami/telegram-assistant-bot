import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { tasksRoutes } from "./routes/tasks.js";
import { recordsRoutes } from "./routes/records.js";
import { chatRoutes } from "./routes/chat.js";
import { imageRoutes } from "./routes/image.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Дефолтный лимит тела запроса у Fastify — 1 МБ, а сгенерированная картинка,
// прикреплённая к задаче как base64 внутри extra.attachments (см. /tasks
// PATCH), легко его превышает. Поднимаем лимит для всего сервиса — приложение
// однопользовательское, так что риска перегрузки нет.
const app = Fastify({ logger: true, bodyLimit: 12 * 1024 * 1024 });

await app.register(cors, {
    origin: env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : true,
});

app.get("/health", async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(meRoutes);
await app.register(tasksRoutes);
await app.register(recordsRoutes);
await app.register(chatRoutes);
await app.register(imageRoutes);

// Frontend (public/index.html - the same Verstak, now a real site instead
// of a Claude artifact) is served by this same service: one Railway
// service for both backend and frontend, same origin, no CORS needed.
await app.register(fastifyStatic, {
    root: path.join(__dirname, "..", "public"),
    index: ["index.html"],
});

app.listen({ port: env.PORT, host: "0.0.0.0" }).then(() => {
    console.log(`Verstak backend listening on port ${env.PORT}`);
});
