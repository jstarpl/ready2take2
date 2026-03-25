import { z } from "zod";

export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(6).max(255),
});

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
});
