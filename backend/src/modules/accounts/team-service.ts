
import { randomBytes } from "node:crypto";
import { transaction } from "../../db";
import { AppError } from "../../errors";
import { log } from "../../logger";
import type { Role } from "../../middleware/team-access";
import { removeFoldersOfFiles } from "../../storage";
import { listTeamStoragePaths } from "../catalog/repository";
import type { UserRow } from "./repository";
import * as repository from "./team-repository";
import type { InvitationDetailsRow } from "./team-repository";
import { isValidEmail, normalizeEmail, readText } from "./validation";

const INVITATION_DAYS = 7;
const LAST_OWNER_TEXT = "В команде должен остаться хотя бы один владелец. Сначала назначьте владельцем другого участника";
const INVALID_INVITATION_TEXT = "Приглашение не найдено или больше не действует";

function readRole(value: unknown, allowed: Role[]): Role {
  if (!allowed.includes(value as Role)) {
    throw new AppError(400, "Указана неверная роль");
  }
  return value as Role;
}


export async function createTeam(user: UserRow, nameValue: unknown): Promise<number> {
  const name = readText(nameValue).trim();
  if (name === "" || name.length > 100) {
    throw new AppError(400, "Укажите название команды длиной до 100 символов");
  }

  const teamId = await transaction((client) => repository.createTeam(client, name, user.id));
  await repository.logTeamAction(user.id, teamId, "create", `Создана команда «${name}»`);
  log("INFO", `Команда создана: ${teamId}, владелец ${user.email}`);
  return teamId;
}

export async function deleteTeam(user: UserRow, teamId: number): Promise<void> {
  const storagePaths = await listTeamStoragePaths(teamId);
  await repository.deleteTeam(teamId);
  await removeFoldersOfFiles(storagePaths);
  log("INFO", `Команда удалена: ${teamId}, удалил ${user.email}`);
}


export async function changeRole(user: UserRow, teamId: number, memberId: number, roleValue: unknown): Promise<void> {
  const role = readRole(roleValue, ["viewer", "member", "owner"]);

  await transaction(async (client) => {
    await repository.lockTeam(client, teamId);
    const currentRole = await repository.findMemberRole(client, teamId, memberId);
    if (!currentRole) {
      throw new AppError(404, "Участник не найден");
    }
    if (currentRole === "owner" && role !== "owner" && (await repository.countOwners(client, teamId)) === 1) {
      throw new AppError(409, LAST_OWNER_TEXT);
    }
    await repository.updateMemberRole(client, teamId, memberId, role);
  });

  await repository.logTeamAction(user.id, teamId, "update", `Изменена роль участника ${memberId}: ${role}`);
  log("INFO", `Роль изменена: команда ${teamId}, участник ${memberId}, новая роль ${role}`);
}

async function removeFromTeam(teamId: number, memberId: number): Promise<void> {
  await transaction(async (client) => {
    await repository.lockTeam(client, teamId);
    const currentRole = await repository.findMemberRole(client, teamId, memberId);
    if (!currentRole) {
      throw new AppError(404, "Участник не найден");
    }
    if (currentRole === "owner" && (await repository.countOwners(client, teamId)) === 1) {
      throw new AppError(409, LAST_OWNER_TEXT);
    }
    await repository.removeMember(client, teamId, memberId);
  });
}

export async function excludeMember(user: UserRow, teamId: number, memberId: number): Promise<void> {
  if (memberId === user.id) {
    throw new AppError(400, "Чтобы покинуть команду, используйте выход из команды в профиле");
  }
  await removeFromTeam(teamId, memberId);
  await repository.logTeamAction(user.id, teamId, "delete", `Исключён участник ${memberId}`);
  log("INFO", `Участник исключён: команда ${teamId}, участник ${memberId}`);
}

export async function leaveTeam(user: UserRow, teamId: number): Promise<void> {
  await removeFromTeam(teamId, user.id);
  await repository.logTeamAction(user.id, teamId, "update", "Участник вышел из команды");
  log("INFO", `Выход из команды: ${user.email}, команда ${teamId}`);
}


export async function invite(user: UserRow, teamId: number, emailValue: unknown, roleValue: unknown) {
  const role = readRole(roleValue, ["viewer", "member"]);
  const email = emailValue ? normalizeEmail(emailValue) : null;

  if (email !== null) {
    if (!isValidEmail(email)) {
      throw new AppError(400, "Укажите правильный адрес почты");
    }
    if (await repository.isEmailMember(teamId, email)) {
      throw new AppError(409, "Этот человек уже состоит в команде");
    }
    if (await repository.hasPendingInvitation(teamId, email)) {
      throw new AppError(409, "На эту почту уже отправлено приглашение");
    }
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  const invitation = await repository.createInvitation(teamId, user.id, email, token, role, expiresAt);

  await repository.logTeamAction(user.id, teamId, "invite", email ? `Приглашение на почту ${email}` : "Приглашение по ссылке");
  log("INFO", `Приглашение создано: команда ${teamId}, ${email ?? "по ссылке"}, роль ${role}`);
  return invitation;
}

export async function revokeInvitation(user: UserRow, teamId: number, invitationId: number): Promise<void> {
  if (!(await repository.deletePendingInvitation(teamId, invitationId))) {
    throw new AppError(404, "Приглашение не найдено");
  }
  await repository.logTeamAction(user.id, teamId, "delete", "Приглашение отозвано");
  log("INFO", `Приглашение отозвано: команда ${teamId}`);
}

function isActive(invitation: InvitationDetailsRow): boolean {
  return invitation.status === "pending" && invitation.expires_at > new Date() && !invitation.team_is_blocked;
}

export async function previewInvitation(tokenValue: unknown) {
  const invitation = await repository.findInvitationByToken(readText(tokenValue));
  if (!invitation || !isActive(invitation)) {
    throw new AppError(404, INVALID_INVITATION_TEXT);
  }
  return {
    teamName: invitation.team_name,
    role: invitation.role,
    invitedBy: invitation.invited_by_name,
    email: invitation.email,
  };
}

export async function acceptInvitation(user: UserRow, tokenValue: unknown): Promise<number> {
  const teamId = await transaction(async (client) => {
    const invitation = await repository.lockInvitationByToken(client, readText(tokenValue));
    if (!invitation || !isActive(invitation)) {
      throw new AppError(404, INVALID_INVITATION_TEXT);
    }
    if (invitation.email !== null && invitation.email !== user.email) {
      throw new AppError(403, "Это приглашение отправлено на другую почту");
    }
    if (await repository.findMemberRole(client, invitation.team_id, user.id)) {
      throw new AppError(409, "Вы уже состоите в этой команде");
    }
    await repository.addMember(client, invitation.team_id, user.id, invitation.role);
    await repository.setInvitationStatus(client, invitation.id, "accepted");
    return invitation.team_id;
  });

  await repository.logTeamAction(user.id, teamId, "create", "Участник принял приглашение");
  log("INFO", `Приглашение принято: ${user.email}, команда ${teamId}`);
  return teamId;
}

export async function declineInvitation(user: UserRow, tokenValue: unknown): Promise<void> {
  await transaction(async (client) => {
    const invitation = await repository.lockInvitationByToken(client, readText(tokenValue));
    if (!invitation || !isActive(invitation) || invitation.email !== user.email) {
      throw new AppError(404, INVALID_INVITATION_TEXT);
    }
    await repository.setInvitationStatus(client, invitation.id, "declined");
  });
  log("INFO", `Приглашение отклонено: ${user.email}`);
}
