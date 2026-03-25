import { createTRPCRouter, publicProcedure } from "../trpc";
import { loginInputSchema } from "@/shared/schemas";
import { clearSessionCookie, setSessionCookie } from "../../auth/session";
import { createSessionForUser, deleteSession, validateCredentials } from "../../services/auth-service";

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
});
