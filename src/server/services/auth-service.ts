import argon2 from "argon2";
import { appDataSource } from "../db/data-source";
import { Session } from "../db/entities/Session";
import { User } from "../db/entities/User";
import { SESSION_TTL_MS } from "../auth/constants";

export async function ensureSeedUser() {
  const userRepository = appDataSource.getRepository(User);
  const existing = await userRepository.findOne({ where: { username: "admin" } });
  if (existing) {
    return existing;
  }

  const seededUser = userRepository.create({
    username: "admin",
    displayName: "Production Admin",
    passwordHash: await argon2.hash("admin123!"),
  });

  return userRepository.save(seededUser);
}

export async function createSessionForUser(user: User) {
  const sessionRepository = appDataSource.getRepository(Session);
  const session = sessionRepository.create({
    user,
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  return sessionRepository.save(session);
}

export async function getSessionUser(sessionId: string | undefined) {
  if (!sessionId) {
    return null;
  }

  const sessionRepository = appDataSource.getRepository(Session);
  const session = await sessionRepository.findOne({
    where: { id: sessionId },
    relations: { user: true },
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) {
      await sessionRepository.delete({ id: session.id });
    }

    return null;
  }

  return session.user;
}

export async function validateCredentials(username: string, password: string) {
  const userRepository = appDataSource.getRepository(User);
  const user = await userRepository.findOne({ where: { username } });

  if (!user) {
    return null;
  }

  const isValid = await argon2.verify(user.passwordHash, password);
  return isValid ? user : null;
}

export async function deleteSession(sessionId: string | undefined) {
  if (!sessionId) {
    return;
  }

  await appDataSource.getRepository(Session).delete({ id: sessionId });
}
