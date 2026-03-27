import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { loginInputSchema, createUserInputSchema, changePasswordInputSchema, deleteUserInputSchema } from "@/shared/schemas";
import { clearSessionCookie, setSessionCookie } from "../../auth/session";
import { createSessionForUser, deleteSession, validateCredentials, createUser, deleteUser, changePassword, getAllUsers } from "../../services/auth-service";

export const authRouter = createTRPCRouter({
  login: publicProcedure.input(loginInputSchema).mutation(async ({ ctx, input }) => {
    const user = await validateCredentials(input.username, input.password);
    if (!user) {
      throw new Error("Invalid username or password.");
    }

    const session = await createSessionForUser(user);
    setSessionCookie(ctx.res, session.id);

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    };
  }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    await deleteSession(ctx.sessionId);
    clearSessionCookie(ctx.res);
    return { ok: true };
  }),
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) {
      return null;
    }

    return {
      id: ctx.user.id,
      username: ctx.user.username,
      displayName: ctx.user.displayName,
    };
  }),
  listUsers: protectedProcedure.query(async () => {
    const users = await getAllUsers();
    return users.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt,
    }));
  }),
  createUser: protectedProcedure.input(createUserInputSchema).mutation(async ({ input }) => {
    const user = await createUser(input.username, input.password, input.displayName);
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    };
  }),
  deleteUser: protectedProcedure.input(deleteUserInputSchema).mutation(async ({ ctx, input }) => {
    // Prevent deleting the current user
    if (input.userId === ctx.user?.id) {
      throw new Error("Cannot delete your own user");
    }

    await deleteUser(input.userId);
    return { ok: true };
  }),
  changePassword: protectedProcedure.input(changePasswordInputSchema).mutation(async ({ ctx, input }) => {
    if (!ctx.user) {
      throw new Error("Not authenticated");
    }

    await changePassword(ctx.user, input.currentPassword, input.newPassword);
    return { ok: true };
  }),
});
