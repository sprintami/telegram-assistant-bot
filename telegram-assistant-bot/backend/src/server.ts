import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { agentsRoutes } from "./routes/agents.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : true,
});

app.get("/health", async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(meRoutes);
await app.register(agentsRoutes);

app.listen({ port: env.PORT, host: "0.0.0.0" }).then(() => {
  console.log(`Верстак-бэкенд запущен на порту ${env.PORT}`);
});
