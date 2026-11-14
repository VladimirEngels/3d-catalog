
import { switchTeam } from "@shared/session";
import { dialogButton, openDialog } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { createInput, errorText, field } from "@shared/ui/form";
import { createTeam } from "../api";

export function openCreateTeamDialog(): void {
  const nameInput = createInput({ type: "text", required: "", maxlength: "100", placeholder: "например: Студия «Юг»" });
  const errorBox = h("div", { class: "err-text", role: "alert" });

  async function submit(): Promise<void> {
    errorBox.textContent = "";
    try {
      const { teamId } = await createTeam(nameInput.value);
      switchTeam(teamId);
    } catch (error) {
      errorBox.textContent = errorText(error);
    }
  }

  const form = h("form", {},
    h("p", {}, "У команды будет свой закрытый каталог. Вы станете её владельцем и сможете пригласить участников."),
    field("Название команды", nameInput),
    errorBox,
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });

  const close = openDialog("Новая команда", form, [
    dialogButton("Отмена", "btn", () => close()),
    dialogButton("Создать", "btn primary", submit),
  ]);
  nameInput.focus();
}
