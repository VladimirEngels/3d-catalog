
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireTeamRole } from "../../middleware/team-access";
import * as repository from "./team-repository";
import type { InvitationDetailsRow, InvitationRow } from "./team-repository";
import * as service from "./team-service";
import { readId } from "./validation";

export const teamsRouter = Router();

function invitationForOwner(invitation: InvitationRow) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    token: invitation.token,
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
  };
}

function invitationForUser(invitation: InvitationDetailsRow) {
  return {
    token: invitation.token,
    teamName: invitation.team_name,
    role: invitation.role,
    invitedBy: invitation.invited_by_name,
    expiresAt: invitation.expires_at,
  };
}


teamsRouter.post("/teams", requireAuth, async (req, res) => {
  const teamId = await service.createTeam(res.locals.user, req.body?.name);
  res.status(201).json({ teamId });
});

teamsRouter.delete("/teams/:teamId", requireAuth, requireTeamRole("owner"), async (_req, res) => {
  await service.deleteTeam(res.locals.user, res.locals.team.id);
  res.status(204).end();
});

teamsRouter.post("/teams/:teamId/leave", requireAuth, requireTeamRole("viewer"), async (_req, res) => {
  await service.leaveTeam(res.locals.user, res.locals.team.id);
  res.status(204).end();
});


teamsRouter.get("/teams/:teamId/members", requireAuth, requireTeamRole("owner"), async (_req, res) => {
  const members = await repository.listMembers(res.locals.team.id);
  res.json(members.map((m) => ({ userId: m.user_id, name: m.name, email: m.email, role: m.role, joinedAt: m.joined_at })));
});

teamsRouter.patch("/teams/:teamId/members/:userId", requireAuth, requireTeamRole("owner"), async (req, res) => {
  await service.changeRole(res.locals.user, res.locals.team.id, readId(req.params.userId), req.body?.role);
  res.status(204).end();
});

teamsRouter.delete("/teams/:teamId/members/:userId", requireAuth, requireTeamRole("owner"), async (req, res) => {
  await service.excludeMember(res.locals.user, res.locals.team.id, readId(req.params.userId));
  res.status(204).end();
});


teamsRouter.get("/teams/:teamId/invitations", requireAuth, requireTeamRole("owner"), async (_req, res) => {
  const invitations = await repository.listTeamInvitations(res.locals.team.id);
  res.json(invitations.map(invitationForOwner));
});

teamsRouter.post("/teams/:teamId/invitations", requireAuth, requireTeamRole("owner"), async (req, res) => {
  const invitation = await service.invite(res.locals.user, res.locals.team.id, req.body?.email, req.body?.role);
  res.status(201).json(invitationForOwner(invitation));
});

teamsRouter.delete("/teams/:teamId/invitations/:invitationId", requireAuth, requireTeamRole("owner"), async (req, res) => {
  await service.revokeInvitation(res.locals.user, res.locals.team.id, readId(req.params.invitationId));
  res.status(204).end();
});


teamsRouter.get("/invitations/preview", async (req, res) => {
  res.json(await service.previewInvitation(req.query.token));
});

teamsRouter.get("/invitations/mine", requireAuth, async (_req, res) => {
  const invitations = await repository.listInvitationsForEmail(res.locals.user.email);
  res.json(invitations.map(invitationForUser));
});

teamsRouter.post("/invitations/accept", requireAuth, async (req, res) => {
  const teamId = await service.acceptInvitation(res.locals.user, req.body?.token);
  res.json({ teamId });
});

teamsRouter.post("/invitations/decline", requireAuth, async (req, res) => {
  await service.declineInvitation(res.locals.user, req.body?.token);
  res.status(204).end();
});
