
import { roleName, switchTeam } from "@shared/session";
import { showMessage } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { acceptInvitation, declineInvitation, getMyInvitations, type MyInvitation } from "../api";

export async function showInvitationList(container: HTMLElement): Promise<void> {
  const invitations = await getMyInvitations();
  container.hidden = invitations.length === 0;

  const list = h("ul", { class: "issues" });
  for (const invitation of invitations) {
    list.append(buildRow(invitation));
  }
  container.replaceChildren(h("h3", { class: "chart-title" }, "Приглашения в команды"), list);
}

function buildRow(invitation: MyInvitation): HTMLElement {
  const acceptButton = h("button", { class: "btn small primary", type: "button" }, "Принять");
  const declineButton = h("button", { class: "btn small", type: "button" }, "Отклонить");

  acceptButton.addEventListener("click", async () => {
    try {
      const { teamId } = await acceptInvitation(invitation.token);
      switchTeam(teamId);
    } catch (error) {
      showMessage("Не удалось принять приглашение", errorText(error));
    }
  });

  declineButton.addEventListener("click", async () => {
    try {
      await declineInvitation(invitation.token);
      location.reload();
    } catch (error) {
      showMessage("Не удалось отклонить приглашение", errorText(error));
    }
  });

  return h("li", {},
    h("div", { class: "invite-info" },
      invitation.teamName,
      h("small", {}, `${roleName[invitation.role]} · пригласил(а) ${invitation.invitedBy}`),
    ),
    h("div", { class: "invite-actions" }, acceptButton, declineButton),
  );
}
