import { getSession, roleName } from "@shared/session";
import { ApiError } from "@shared/api/errors";
import { confirmAction, showMessage } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { createInput, errorText, field } from "@shared/ui/form";
import { mountLayout, pageHead } from "@shared/ui/layout";
import type { TeamMembership } from "@shared/api/types";
import { changePassword, leaveTeam } from "../api";
import { openCreateTeamDialog } from "../components/create-team";
import { showInvitationList } from "../components/invitation-list";
import "../accounts.css";

const main = await mountLayout("");
const session = await getSession();


const currentInput = createInput({ type: "password", required: "", autocomplete: "current-password" });
const newInput = createInput({ type: "password", required: "", minlength: "8", autocomplete: "new-password" });
const repeatInput = createInput({ type: "password", required: "", autocomplete: "new-password" });
const errorBox = h("div", { class: "err-text", role: "alert" });
const successBox = h("div", { class: "success-text", role: "status" });

const passwordForm = h("form", { class: "profile-section" },
  h("h3", { class: "chart-title" }, "Смена пароля"),
  field("Текущий пароль", currentInput),
  field("Новый пароль", newInput, "Не короче 8 символов"),
  field("Новый пароль ещё раз", repeatInput),
  errorBox,
  successBox,
  h("div", { class: "form-actions" }, h("button", { class: "btn primary", type: "submit" }, "Сохранить")),
);

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";
  successBox.textContent = "";
  try {
    if (newInput.value !== repeatInput.value) {
      throw new ApiError(400, "Новые пароли не совпадают");
    }
    await changePassword(currentInput.value, newInput.value);
    (passwordForm as HTMLFormElement).reset();
    successBox.textContent = "Пароль изменён. На других устройствах нужно войти заново";
  } catch (error) {
    errorBox.textContent = errorText(error);
  }
});


function buildTeamRow(team: TeamMembership): HTMLElement {
  const leaveButton = h("button", { class: "btn link", type: "button" }, "Выйти из команды");
  leaveButton.addEventListener("click", async () => {
    const agreed = await confirmAction(`Выйти из команды «${team.teamName}»?`, "Вернуться можно будет только по новому приглашению.", "Выйти");
    if (!agreed) {
      return;
    }
    try {
      await leaveTeam(team.teamId);
      location.reload();
    } catch (error) {
      showMessage("Не удалось выйти из команды", errorText(error));
    }
  });

  return h("li", {},
    h("div", { class: "invite-info" }, team.teamName, h("small", {}, roleName[team.role])),
    leaveButton,
  );
}

const teamList = h("ul", { class: "issues" });
for (const team of session.teams) {
  teamList.append(buildTeamRow(team));
}

const newTeamButton = h("button", { class: "btn full-button", type: "button" }, "Создать команду");
newTeamButton.addEventListener("click", openCreateTeamDialog);

const invitationsPanel = h("div", { class: "panel" });
invitationsPanel.hidden = true;

main.append(
  pageHead("Профиль"),
  h("div", { class: "cols-even profile-grid" },
    h("div", { class: "panel" },
      h("h3", { class: "chart-title" }, "Учётная запись"),
      field("Имя", createInput({ type: "text", readonly: "", value: session.user.name })),
      field("Электронная почта", createInput({ type: "email", readonly: "", value: session.user.email })),
      passwordForm,
    ),
    h("div", {},
      invitationsPanel,
      h("div", { class: "panel" },
        h("h3", { class: "chart-title" }, "Мои команды"),
        session.teams.length > 0 ? teamList : h("div", { class: "hint" }, "Вы пока не состоите ни в одной команде"),
        newTeamButton,
      ),
    ),
  ),
);

await showInvitationList(invitationsPanel);

if (location.search.includes("newTeam")) {
  openCreateTeamDialog();
}
