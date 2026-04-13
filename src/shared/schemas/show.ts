import { z } from "zod";

export const showCreateSchema = z.object({
  projectId: z.string(),
  name: z.string().trim().min(1).max(120),
});

export const showUpdateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
  status: z.enum(["draft", "live", "archived"]),
});

export const showIdSchema = z.object({
  showId: z.string(),
});

export const nullSchema = z.object({}).nullish();

export const showCuePointerSchema = z.object({
  showId: z.string(),
  cueId: z.string().nullable(),
});

export const showReorderSchema = z.object({
  projectId: z.string(),
  showIds: z.array(z.string()).min(1),
});
