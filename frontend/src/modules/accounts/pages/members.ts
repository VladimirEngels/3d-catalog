
import { can, getSession } from "@shared/session";
import { confirmAction, showMessage } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { createInput, errorText, field } from "@shared/ui/form";
import { mountLayout, pageHead } from "@shared/ui/layout";
import type { Role } from "@shared/api/types";
import {
  changeMemberRole, createInvitation, deleteTeam, excludeMember, getMembers, getTeamInvitations,
  revokeInvitation, type InviteRole, type TeamInvitation, type TeamMember,
} from "../api";
import "../accounts.css";

const main = await mountLayout("members");
const session = await getSession();

if (!can(session, "manageTeam")) {
  location.href = "/pages/catalog.html";
  await new Promise(() => {});
}

const team = session.team!;
const membersBox = h("div", { class: "table-wrap" });
const invitationsBox = h("ul", { class: "issues" });
const subtitle = h("span", { class: "sub" });

const ROLE_LABELS: [Role, string][] = [["viewer", "Наблюдатель"], ["member", "Участник"], ["owner", "Владелец"]];

function buildRoleSelect(roles: [Role, string][], current: Role): HTMLSelectElement {
  const select = h("select") as HTMLSelectElement;
  for (const [value, label] of roles) {
    select.append(h("option", { value }, label));
  }
  select.value = current;
  return select;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU");
}

function getInitials(name: string): string {
  const words = name.split(" ");
  const second = words.length > 1 ? words[1].charAt(0) : "";
  return (words[0].charAt(0) + second).toUpperCase();
}


function buildMemberRow(member: TeamMember): HTMLElement {
  const isMe = member.userId === session.user.id;
  const select = buildRoleSelect(ROLE_LABELS, member.role);

  select.addEventListener("change", async () => {
    try {
      await changeMemberRole(team.teamId, member.userId, select.value as Role);
      location.reload();
    } catch (error) {
      select.value = member.role;
      showMessage("Не удалось изменить роль", errorText(error));
    }
  });

  let actions: HTMLElement | null = null;
  if (!isMe) {
    actions = h("button", { class: "btn small", type: "button" }, "Исключить");
    actions.addEventListener("click", async () => {
      const agreed = await confirmAction("Исключить участника?", `${member.name} потеряет доступ к моделям команды.`, "Исключить");
      if (!agreed) {
        return;
      }
      try {
        await excludeMember(team.teamId, member.userId);
        await loadMembers();
      } catch (error) {
        showMessage("Не удалось исключить участника", errorText(error));
      }
    });
  }

  return h("tr", {},
    h("td", {},
      h("div", { class: "person" },
        h("div", { class: "avatar" }, getInitials(member.name)),
        h("div", {}, isMe ? `${member.name} (вы)` : member.name, h("small", {}, member.email)),
      ),
    ),
    h("td", {}, select),
    h("td", { class: "muted" }, formatDate(member.joinedAt)),
    h("td", {}, actions),
  );
}

async function loadMembers(): Promise<void> {
  const members = await getMembers(team.teamId);
  subtitle.textContent = `команда «${team.teamName}» · участников: ${members.length}`;

  const body = h("tbody");
  for (const member of members) {
    body.append(buildMemberRow(member));
  }
  membersBox.replaceChildren(h("table", { class: "table" },
    h("thead", {}, h("tr", {}, h("th", {}, "Участник"), h("th", {}, "Роль"), h("th", {}, "В команде с"), h("th"))),
    body,
  ));
}


function inviteLink(token: string): string {
  return `${location.origin}/pages/invite.html?token=${token}`;
}

function buildInvitationRow(invitation: TeamInvitation): HTMLElement {
  const roleLabel = invitation.role === "member" ? "Участник" : "Наблюдатель";
  const revokeButton = h("button", { class: "btn link", type: "button" }, "Отозвать");
  revokeButton.addEventListener("click", async () => {
    try {
      await revokeInvitation(team.teamId, invitation.id);
      await loadInvitations();
    } catch (error) {
      showMessage("Не удалось отозвать приглашение", errorText(error));
    }
  });

  const actions = h("div", { class: "invite-actions" });
  if (invitation.email === null) {
    const copyButton = h("button", { class: "btn link", type: "button" }, "Копировать");
    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(inviteLink(invitation.token));
      copyButton.textContent = "Скопировано";
    });
    actions.append(copyButton);
  }
  actions.append(revokeButton);

  return h("li", {},
    h("div", { class: "invite-info" },
      invitation.email ?? "Одноразовая ссылка",
      h("small", {}, `${roleLabel} · действует до ${formatDate(invitation.expiresAt)}`),
    ),
    actions,
  );
}

async function loadInvitations(): Promise<void> {
  const invitations = await getTeamInvitations(team.teamId);
  invitationsBox.replaceChildren();
  for (const invitation of invitations) {
    invitationsBox.append(buildInvitationRow(invitation));
  }
  if (invitations.length === 0) {
    invitationsBox.append(h("div", { class: "hint" }, "Сейчас приглашений нет"));
  }
}

const emailInput = createInput({ type: "email", placeholder: "name@example.ru" });
const roleSelect = buildRoleSelect(ROLE_LABELS.slice(0, 2), "member");
const inviteError = h("div", { class: "err-text", role: "alert" });
const linkBox = h("div", { class: "copy-row panel-field" });
linkBox.hidden = true;

async function sendInvitation(email: string | null): Promise<void> {
  inviteError.textContent = "";
  try {
    const invitation = await createInvitation(team.teamId, email, roleSelect.value as InviteRole);
    emailInput.value = "";
    await loadInvitations();
    if (email === null) {
      linkBox.hidden = false;
      linkBox.replaceChildren(createInput({ type: "text", readonly: "", value: inviteLink(invitation.token) }));
    }
  } catch (error) {
    inviteError.textContent = errorText(error);
  }
}

const inviteForm = h("form", {},
  h("h3", { class: "chart-title" }, "Пригласить в команду"),
  field("Роль", roleSelect),
  field("Электронная почта", emailInput, "Человек увидит приглашение в системе после входа. Письма система пока не отправляет"),
  inviteError,
  h("button", { class: "btn primary full-button", type: "submit" }, "Пригласить по почте"),
);
inviteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (emailInput.value.trim() === "") {
    inviteError.textContent = "Укажите адрес почты";
    return;
  }
  sendInvitation(emailInput.value);
});

const linkButton = h("button", { class: "btn full-button", type: "button" }, "Создать ссылку-приглашение");
linkButton.addEventListener("click", () => sendInvitation(null));

const deleteButton = h("button", { class: "btn danger-text", type: "button" }, "Удалить команду…");
deleteButton.addEventListener("click", async () => {
  const agreed = await confirmAction(
    `Удалить команду «${team.teamName}»?`,
    "Будут удалены все её модели, коллекции и журнал. Отменить это нельзя.",
    "Удалить навсегда",
  );
  if (!agreed) {
    return;
  }
  try {
    await deleteTeam(team.teamId);
    location.href = "/pages/catalog.html";
  } catch (error) {
    showMessage("Не удалось удалить команду", errorText(error));
  }
});

main.append(
  pageHead("Участники"),
  h("div", { class: "cols-2" },
    membersBox,
    h("div", {},
      h("div", { class: "panel" }, inviteForm, linkButton, h("div", { class: "hint" }, "Ссылку можно использовать один раз, она действует 7 дней"), linkBox),
      h("div", { class: "panel" }, h("h3", { class: "chart-title" }, "Ждут ответа"), invitationsBox),
      h("div", { class: "panel" },
        h("h3", { class: "chart-title" }, "Опасные действия"),
        h("div", { class: "hint empty-state" }, "Команда удаляется вместе со всеми моделями. Отменить нельзя."),
        h("div", { class: "form-actions" }, deleteButton),
      ),
    ),
  ),
);
main.querySelector(".page-head")?.append(subtitle);

await Promise.all([loadMembers(), loadInvitations()]);
