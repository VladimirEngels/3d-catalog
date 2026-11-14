
import { request } from "@shared/api/http";
import type { Me, Role } from "@shared/api/types";

export function login(email: string, password: string): Promise<Me> {
  return request<Me>("POST", "/auth/login", { email, password });
}

export function register(name: string, email: string, password: string): Promise<Me> {
  return request<Me>("POST", "/auth/register", { name, email, password });
}

export function logout(): Promise<void> {
  return request<void>("POST", "/auth/logout");
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request<void>("POST", "/auth/change-password", { currentPassword, newPassword });
}


export type InviteRole = "viewer" | "member";

export interface TeamMember {
  userId: number;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface TeamInvitation {
  id: number;
  email: string | null;
  role: InviteRole;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface MyInvitation {
  token: string;
  teamName: string;
  role: InviteRole;
  invitedBy: string;
  expiresAt: string;
}

export interface InvitationPreview {
  teamName: string;
  role: InviteRole;
  invitedBy: string;
  email: string | null;
}

export function createTeam(name: string): Promise<{ teamId: number }> {
  return request("POST", "/teams", { name });
}

export function deleteTeam(teamId: number): Promise<void> {
  return request("DELETE", `/teams/${teamId}`);
}

export function leaveTeam(teamId: number): Promise<void> {
  return request("POST", `/teams/${teamId}/leave`);
}

export function getMembers(teamId: number): Promise<TeamMember[]> {
  return request("GET", `/teams/${teamId}/members`);
}

export function changeMemberRole(teamId: number, userId: number, role: Role): Promise<void> {
  return request("PATCH", `/teams/${teamId}/members/${userId}`, { role });
}

export function excludeMember(teamId: number, userId: number): Promise<void> {
  return request("DELETE", `/teams/${teamId}/members/${userId}`);
}

export function getTeamInvitations(teamId: number): Promise<TeamInvitation[]> {
  return request("GET", `/teams/${teamId}/invitations`);
}

export function createInvitation(teamId: number, email: string | null, role: InviteRole): Promise<TeamInvitation> {
  return request("POST", `/teams/${teamId}/invitations`, { email, role });
}

export function revokeInvitation(teamId: number, invitationId: number): Promise<void> {
  return request("DELETE", `/teams/${teamId}/invitations/${invitationId}`);
}

export function getMyInvitations(): Promise<MyInvitation[]> {
  return request("GET", "/invitations/mine");
}

export function previewInvitation(token: string): Promise<InvitationPreview> {
  return request("GET", `/invitations/preview?token=${encodeURIComponent(token)}`);
}

export function acceptInvitation(token: string): Promise<{ teamId: number }> {
  return request("POST", "/invitations/accept", { token });
}

export function declineInvitation(token: string): Promise<void> {
  return request("POST", "/invitations/decline", { token });
}
