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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

await app.register(cors, {
    origin: env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : true,
});

app.get("/health", async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(meRoutes);
await app.register(tasksRoutes);
await app.register(recordsRoutes);
await app.register(chatRoutes);

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
