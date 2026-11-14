
import { request } from "@shared/api/http";


export interface LogItem {
  id: number;
  createdAt: string;
  action: string;
  details: string | null;
  userName: string;
}

export interface LogResponse {
  items: LogItem[];
  total: number;
  page: number;
  pageSize: number;
  authors: { id: number; name: string }[];
}

export interface LogFilters {
  user: string;
  action: string;
  days: string;
  query: string;
}

export function getTeamLog(teamId: number, filters: LogFilters, page: number): Promise<LogResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.user !== "") params.set("user", filters.user);
  if (filters.action !== "") params.set("action", filters.action);
  if (filters.days !== "") params.set("days", filters.days);
  if (filters.query.trim() !== "") params.set("q", filters.query.trim());
  return request("GET", `/teams/${teamId}/log?${params}`);
}


export interface DayCount {
  day: string;
  count: number;
}

export interface TeamSummary {
  models: number;
  members: number;
  newModels: number;
  newMembers: number;
  jobs: number;
  failedJobs: number;
  jobsByDay: DayCount[];
  errorReasons: { reason: string; count: number }[];
  formats: { format: string; count: number }[];
  largestModels: { id: number; name: string; authorName: string; triangles: number; sizeBytes: number }[];
}

export function getTeamSummary(teamId: number, days: string): Promise<TeamSummary> {
  return request("GET", `/teams/${teamId}/summary?days=${days}`);
}


export interface SystemStats {
  users: number;
  newUsers: number;
  teams: number;
  newTeams: number;
  diskBytes: number;
  jobs: number;
  failedJobs: number;
  jobsByDay: DayCount[];
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
  isBlocked: boolean;
  createdAt: string;
  teamCount: number;
  lastLogin: string | null;
}

export interface AdminTeam {
  id: number;
  name: string;
  isBlocked: boolean;
  createdAt: string;
  ownerEmails: string[];
  memberCount: number;
  modelCount: number;
  diskBytes: number;
}

export interface PagedList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function getSystemStats(days: string): Promise<SystemStats> {
  return request("GET", `/admin/stats?days=${days}`);
}

function listQuery(query: string, status: string, page: number): string {
  return new URLSearchParams({ q: query.trim(), status, page: String(page) }).toString();
}

export function getAdminUsers(query: string, status: string, page: number): Promise<PagedList<AdminUser>> {
  return request("GET", `/admin/users?${listQuery(query, status, page)}`);
}

export function getAdminTeams(query: string, status: string, page: number): Promise<PagedList<AdminTeam>> {
  return request("GET", `/admin/teams?${listQuery(query, status, page)}`);
}

export function setUserBlocked(userId: number, blocked: boolean): Promise<void> {
  return request("PATCH", `/admin/users/${userId}`, { blocked });
}

export function setTeamBlocked(teamId: number, blocked: boolean): Promise<void> {
  return request("PATCH", `/admin/teams/${teamId}`, { blocked });
}
