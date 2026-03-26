import { z } from "zod";

export const cueCreateSchema = z.object({
  showId: z.string(),
  cueId: z.string().trim().max(50).optional(),
  comment: z.string().trim().max(1000),
  cueOffsetMs: z.number().int().min(0).nullable(),
});

export const cueImportCsvSchema = z.object({
  showId: z.string(),
  csvContent: z.string().min(1).max(2_000_000),
});

export const cueUpdateSchema = z.object({
  id: z.string(),
  comment: z.string().trim().max(1000),
  cueOffsetMs: z.number().int().min(0).nullable(),
});

export const cueDeleteSchema = z.object({
  id: z.string(),
});

export const cueReorderSchema = z.object({
  showId: z.string(),
  cueIds: z.array(z.string()).min(1),
});

export const cueResetIdsSchema = z.object({
  showId: z.string(),
});

export const cueTrackValueUpdateSchema = z.object({
  cueId: z.string(),
  trackId: z.string(),
  technicalIdentifier: z.string().trim().max(120).nullable(),
});
