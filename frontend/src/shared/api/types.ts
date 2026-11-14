
export type Role = "viewer" | "member" | "owner";
export type JobStatus = "queued" | "running" | "done" | "failed";
export type Format = "obj" | "glb" | "gltf" | "stl" | "ply";

export interface User {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
}

export interface TeamMembership {
  teamId: number;
  teamName: string;
  role: Role;
}

export interface Me {
  user: User;
  teams: TeamMembership[];
  invitationCount: number;
}
