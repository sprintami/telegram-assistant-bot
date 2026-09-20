import { PrismaClient } from "@prisma/client";

// Один общий клиент на процесс (стандартная практика для serverless/long-running Node).
export const prisma = new PrismaClient();
