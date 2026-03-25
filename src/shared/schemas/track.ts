import { z } from "zod";

export const trackCreateSchema = z.object({
  showId: z.string(),
  name: z.string().trim().min(1).max(120),
});

export const trackUpdateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
});

export const trackDeleteSchema = z.object({
  id: z.string(),
});

export const trackReorderSchema = z.object({
  showId: z.string(),
  trackIds: z.array(z.string()).min(1),
});
