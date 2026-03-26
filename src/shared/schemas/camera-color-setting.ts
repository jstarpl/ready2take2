import { z } from "zod";

export const cameraColorSettingUpsertSchema = z.object({
  identifier: z.string().trim().min(1).max(80),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color (#rrggbb)"),
});

export const cameraColorSettingDeleteSchema = z.object({
  id: z.string(),
});
