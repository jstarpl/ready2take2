import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { getSessionUser } from "../services/auth-service";
import { SESSION_COOKIE_NAME } from "../auth/constants";

export async function createContext({ req, res }: { req: Request; res: Response }) {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const user = await getSessionUser(sessionId);

  return {
    req,
    res,
    sessionId,
    user,
  };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

const enforceUser = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(enforceUser);
export const trpc = t;
export type TrpcContext = Context;
