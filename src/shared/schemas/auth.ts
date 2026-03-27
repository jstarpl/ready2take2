import { z } from "zod";

const passwordSchema =  z.string().min(6).max(255)

export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: passwordSchema,
});

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  forcePasswordChange: z.boolean(),
});

export const createUserInputSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: passwordSchema,
  displayName: z.string().trim().max(255).nullable().optional(),
});

export const changePasswordInputSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});

export const changeDefaultPasswordInputSchema = z.object({
  newPassword: passwordSchema,
});

export const deleteUserInputSchema = z.object({
  userId: z.string(),
});
