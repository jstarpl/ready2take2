import { z } from "zod";

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
});

export const projectUpdateSchema = projectCreateSchema.extend({
  id: z.string(),
});

export const projectIdSchema = z.object({
  projectId: z.string(),
});
