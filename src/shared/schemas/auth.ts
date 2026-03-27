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

export const createUserInputSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(6).max(255),
  displayName: z.string().trim().max(255).nullable().optional(),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(6).max(255),
  newPassword: z.string().min(6).max(255),
});

export const deleteUserInputSchema = z.object({
  userId: z.string(),
});
