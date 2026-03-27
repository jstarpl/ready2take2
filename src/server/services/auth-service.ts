import argon2 from "argon2";
import { appDataSource } from "../db/data-source";
import { Session } from "../db/entities/Session";
import { User } from "../db/entities/User";
import { SESSION_TTL_MS } from "../auth/constants";

export async function ensureSeedUser() {
  const userRepository = appDataSource.getRepository(User);
  const existing = await userRepository.findOne({ where: { username: "admin" } });
  if (existing) {
    let shouldSave = false;
    if (!existing.active) {
      existing.active = true;
      shouldSave = true;
    }

    const shouldForcePasswordChange = await argon2.verify(existing.passwordHash, "admin123!");
    if (existing.forcePasswordChange !== shouldForcePasswordChange) {
      existing.forcePasswordChange = shouldForcePasswordChange;
      shouldSave = true;
    }

    if (shouldSave) {
      return userRepository.save(existing);
    }

    return existing;
  }

  const seededUser = userRepository.create({
    username: "admin",
    displayName: "Production Admin",
    passwordHash: await argon2.hash("admin123!"),
    active: true,
    forcePasswordChange: true,
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

  if (!session || session.expiresAt.getTime() < Date.now() || !session.user.active) {
    if (session) {
      await sessionRepository.delete({ id: session.id });
    }

    return null;
  }

  return session.user;
}

export async function validateCredentials(username: string, password: string) {
  const userRepository = appDataSource.getRepository(User);
  const user = await userRepository.findOne({ where: { username, active: true } });

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

export async function deleteExpiredSessions(referenceTime = new Date()) {
  const deleteResult = await appDataSource
    .getRepository(Session)
    .createQueryBuilder()
    .delete()
    .from(Session)
    .where("expiresAt <= :referenceTime", { referenceTime })
    .execute();

  return deleteResult.affected ?? 0;
}

export async function createUser(username: string, password: string, displayName?: string | null) {
  const userRepository = appDataSource.getRepository(User);

  // Check if user already exists
  const existing = await userRepository.findOne({ where: { username, active: true } });
  if (existing) {
    throw new Error("User already exists");
  }

  const user = userRepository.create({
    username,
    displayName: displayName || null,
    passwordHash: await argon2.hash(password),
    active: true,
    forcePasswordChange: false,
  });

  return userRepository.save(user);
}

export async function deleteUser(userId: string) {
  const userRepository = appDataSource.getRepository(User);
  const sessionRepository = appDataSource.getRepository(Session);

  // Delete all sessions for this user first
  await sessionRepository.delete({ userId });

  await userRepository.update({ id: userId }, { active: false });
}

export async function changePassword(user: User, currentPassword: string, newPassword: string) {
  // Verify current password
  const isValid = await argon2.verify(user.passwordHash, currentPassword);
  if (!isValid) {
    throw new Error("Current password is incorrect");
  }

  const userRepository = appDataSource.getRepository(User);
  user.passwordHash = await argon2.hash(newPassword);
  user.forcePasswordChange = false;
  return userRepository.save(user);
}

export async function changeDefaultPassword(user: User, newPassword: string) {
  if (user.username !== "admin") {
    throw new Error("Only the default admin account can use this password change flow");
  }

  const isUsingDefaultPassword = await argon2.verify(user.passwordHash, "admin123!");
  if (!isUsingDefaultPassword) {
    throw new Error("Default password has already been changed");
  }

  const userRepository = appDataSource.getRepository(User);
  user.passwordHash = await argon2.hash(newPassword);
  user.forcePasswordChange = false;
  return userRepository.save(user);
}

export async function getAllUsers() {
  const userRepository = appDataSource.getRepository(User);
  return userRepository.find({ where: { active: true }, order: { createdAt: "ASC" } });
}
