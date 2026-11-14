import "@shared/styles/index.css";
import "../accounts.css";
import { ApiError } from "@shared/api/errors";
import { h } from "@shared/ui/dom";
import { createInput, field } from "@shared/ui/form";
import { previewInvitation, register } from "../api";
import { authLink, getInviteToken, goHome, showAuthForm } from "../components/auth-form";

async function buildInviteNote(): Promise<HTMLElement[]> {
  const token = getInviteToken();
  if (token === null) {
    return [];
  }
  try {
    const invitation = await previewInvitation(token);
    if (invitation.email !== null) {
      emailInput.value = invitation.email;
    }
    return [h("div", { class: "note info" }, "Вас пригласили в команду ", h("b", {}, invitation.teamName), `. После регистрации останется принять приглашение.`)];
  } catch {
    return [];
  }
}

const nameInput = createInput({ type: "text", required: "", maxlength: "100", autocomplete: "name", placeholder: "Как вас называть в команде" });
const emailInput = createInput({ type: "email", required: "", autocomplete: "email" });
const passwordInput = createInput({ type: "password", required: "", minlength: "8", autocomplete: "new-password" });
const repeatInput = createInput({ type: "password", required: "", autocomplete: "new-password" });

showAuthForm({
  subtitle: "Регистрация",
  fields: [
    ...(await buildInviteNote()),
    field("Имя", nameInput),
    field("Электронная почта", emailInput),
    field("Пароль", passwordInput, "Не короче 8 символов"),
    field("Пароль ещё раз", repeatInput),
  ],
  buttonText: "Зарегистрироваться",
  footer: h("div", { class: "auth-foot" }, "Уже есть учётная запись? ", h("a", { href: authLink("login") }, "Войти")),
  onSubmit: async () => {
    if (passwordInput.value !== repeatInput.value) {
      throw new ApiError(400, "Пароли не совпадают");
    }
    const me = await register(nameInput.value, emailInput.value, passwordInput.value);
    goHome(me.user.isAdmin);
  },
});
