import type { Response } from "express";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "./constants";

export function setSessionCookie(response: Response, sessionId: string) {
  response.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });
}
