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

export async function createUser(username: string, password: string, displayName?: string | null) {
  const userRepository = appDataSource.getRepository(User);
  
  // Check if user already exists
  const existing = await userRepository.findOne({ where: { username } });
  if (existing) {
    throw new Error("User already exists");
  }

  const user = userRepository.create({
    username,
    displayName: displayName || null,
    passwordHash: await argon2.hash(password),
  });

  return userRepository.save(user);
}

export async function deleteUser(userId: string) {
  const userRepository = appDataSource.getRepository(User);
  const sessionRepository = appDataSource.getRepository(Session);

  // Delete all sessions for this user first
  await sessionRepository.delete({ userId });

  // Delete the user
  await userRepository.delete({ id: userId });
}

export async function changePassword(user: User, currentPassword: string, newPassword: string) {
  // Verify current password
  const isValid = await argon2.verify(user.passwordHash, currentPassword);
  if (!isValid) {
    throw new Error("Current password is incorrect");
  }

  const userRepository = appDataSource.getRepository(User);
  user.passwordHash = await argon2.hash(newPassword);
  return userRepository.save(user);
}

export async function getAllUsers() {
  const userRepository = appDataSource.getRepository(User);
  return userRepository.find({ order: { createdAt: "ASC" } });
}
