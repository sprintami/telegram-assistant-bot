import { prisma } from "../prisma.js";

// Инструменты (tool use), которыми ИИ-агенты верстака управляют задачами
// прямо во время разговора. Схемы ниже отдаются Claude в поле `tools`,
// а executeTaskTool выполняет реальный запрос к базе, когда Claude решает
// вызвать один из них.

export const taskTools = [
  {
    name: "create_task",
    description:
      "Создать новую задачу верстака. Используй, когда пользователь просит " +
      "напомнить, поставить задачу, завести дело и т.п.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Короткое название задачи" },
        description: { type: "string", description: "Подробности (необязательно)" },
        project: {
          type: "string",
          enum: ["METALIZM", "PRINTBAR", "SPRINTAMI", "OTHER"],
          description: "К какому бизнесу относится задача",
        },
        lever: {
          type: "string",
          enum: ["SALES", "OPS", "SCALE"],
          description: "Рычаг роста: продажи / операционка / масштаб",
        },
        dueDate: {
          type: "string",
          description: "Срок в формате ISO-даты (YYYY-MM-DD), если назван",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Изменить статус или чек-лист существующей задачи. Сначала используй " +
      "list_tasks, чтобы найти id нужной задачи.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id задачи" },
        status: {
          type: "string",
          enum: ["NEW", "IN_PROGRESS", "DONE"],
        },
        checklistItemToToggle: {
          type: "string",
          description: "Текст пункта чек-листа, который нужно отметить выполненным",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_tasks",
    description: "Получить список задач воркспейса, опционально с фильтром.",
    input_schema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          enum: ["METALIZM", "PRINTBAR", "SPRINTAMI", "OTHER"],
        },
        status: {
          type: "string",
          enum: ["NEW", "IN_PROGRESS", "DONE"],
        },
      },
    },
  },
];

export async function executeTaskTool(
  toolName: string,
  input: any,
  workspaceId: string,
  agentKey: string
): Promise<unknown> {
  if (toolName === "create_task") {
    const task = await prisma.task.create({
      data: {
        workspaceId,
        title: String(input.title ?? "").trim() || "Без названия",
        description: input.description,
        project: input.project ?? "OTHER",
        lever: input.lever,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        createdByAgentKey: agentKey,
      },
    });
    return { ok: true, task };
  }

  if (toolName === "update_task") {
    const existing = await prisma.task.findFirst({
      where: { id: input.id, workspaceId },
    });
    if (!existing) {
      return { ok: false, error: "task not found" };
    }

    let checklist = existing.checklist as { text: string; done: boolean }[] | null;
    if (input.checklistItemToToggle && Array.isArray(checklist)) {
      checklist = checklist.map((item) =>
        item.text === input.checklistItemToToggle ? { ...item, done: !item.done } : item
      );
    }

    const task = await prisma.task.update({
      where: { id: input.id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(checklist ? { checklist } : {}),
      },
    });
    return { ok: true, task };
  }

  if (toolName === "list_tasks") {
    const tasks = await prisma.task.findMany({
      where: {
        workspaceId,
        ...(input.project ? { project: input.project } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 30,
    });
    return { ok: true, tasks };
  }

  return { ok: false, error: `unknown tool: ${toolName}` };
}
