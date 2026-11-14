
import { createHash, randomBytes } from "node:crypto";
import { AppError } from "../../errors";
import { log } from "../../logger";
import { hashPassword, verifyPassword } from "./passwords";
import * as repository from "./repository";
import type { UserRow } from "./repository";
import { isValidEmail, normalizeEmail, readText } from "./validation";

const SESSION_DAYS = 7;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const WRONG_LOGIN_TEXT = "Неверная почта или пароль";

export const SESSION_LIFETIME_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function startSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await repository.createSession(userId, hashToken(token), expiresAt);
  return token;
}

function checkNewPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AppError(400, `Пароль должен быть не длиннее ${MAX_PASSWORD_LENGTH} символов`);
  }
}

export async function register(emailValue: unknown, passwordValue: unknown, nameValue: unknown): Promise<string> {
  const email = normalizeEmail(emailValue);
  const password = readText(passwordValue);
  const name = readText(nameValue).trim();

  if (name === "" || name.length > 100) {
    throw new AppError(400, "Укажите имя длиной до 100 символов");
  }
  if (!isValidEmail(email)) {
    throw new AppError(400, "Укажите правильный адрес почты");
  }
  checkNewPassword(password);

  const passwordHash = await hashPassword(password);
  let user: UserRow;
  try {
    user = await repository.createUser(email, passwordHash, name);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new AppError(409, "Пользователь с такой почтой уже зарегистрирован");
    }
    throw error;
  }
  log("INFO", `Регистрация: ${user.email}`);
  return startSession(user.id);
}

export async function login(emailValue: unknown, passwordValue: unknown): Promise<string> {
  const user = await repository.findUserByEmail(normalizeEmail(emailValue));

  if (!user) {
    log("WARN", "Вход не удался: неизвестная почта");
    throw new AppError(401, WRONG_LOGIN_TEXT);
  }
  if (!(await verifyPassword(readText(passwordValue), user.password_hash))) {
    log("WARN", `Вход не удался: неверный пароль для ${user.email}`);
    throw new AppError(401, WRONG_LOGIN_TEXT);
  }
  if (user.is_blocked) {
    log("WARN", `Вход не удался: учётная запись заблокирована, ${user.email}`);
    throw new AppError(403, "Учётная запись заблокирована администратором");
  }

  await repository.logLogin(user.id);
  log("INFO", `Вход: ${user.email}`);
  return startSession(user.id);
}

export async function logout(token: string): Promise<void> {
  await repository.deleteSession(hashToken(token));
  log("INFO", "Выход из системы");
}

export async function changePassword(userId: number, currentValue: unknown, newValue: unknown): Promise<string> {
  const newPassword = readText(newValue);
  const user = await repository.findUserById(userId);

  if (!user || !(await verifyPassword(readText(currentValue), user.password_hash))) {
    log("WARN", `Смена пароля не удалась: неверный текущий пароль, пользователь ${userId}`);
    throw new AppError(400, "Текущий пароль указан неверно");
  }
  checkNewPassword(newPassword);

  await repository.updatePasswordHash(userId, await hashPassword(newPassword));
  await repository.deleteAllSessions(userId);
  log("INFO", `Пароль изменён: ${user.email}, все входы отменены`);
  return startSession(userId);
}

export async function getMe(user: UserRow) {
  const memberships = await repository.findMemberships(user.id);
  const invitationCount = await repository.countInvitations(user.email);
  return {
    user: { id: user.id, name: user.name, email: user.email, isAdmin: user.is_system_admin },
    teams: memberships.map((m) => ({ teamId: m.team_id, teamName: m.team_name, role: m.role })),
    invitationCount,
  };
}
