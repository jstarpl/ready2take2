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

const projectExportTrackSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
  type: z.enum(["custom", "camera"]),
  position: z.number().int().min(0),
});

const projectExportCueTrackValueSchema = z.object({
  trackId: z.string(),
  technicalIdentifier: z.string().nullable(),
});

const projectExportCueSchema = z.object({
  id: z.string(),
  cueId: z.string().trim().min(1).max(50),
  comment: z.string(),
  cueOffsetMs: z.number().int().nullable(),
  orderKey: z.string().trim().min(1),
  cueTrackValues: z.array(projectExportCueTrackValueSchema),
});

const projectExportShowSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
  status: z.enum(["draft", "live", "archived"]),
  orderKey: z.string().trim().min(1),
  currentCueId: z.string().nullable(),
  nextCueId: z.string().nullable(),
  tracks: z.array(projectExportTrackSchema),
  cues: z.array(projectExportCueSchema),
});

const projectExportProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().nullable(),
  shows: z.array(projectExportShowSchema),
});

export const projectExportPayloadSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  project: projectExportProjectSchema,
});

export const projectImportSchema = z.object({
  payload: projectExportPayloadSchema,
});
