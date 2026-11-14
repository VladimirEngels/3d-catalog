import "@shared/styles/index.css";
import "../accounts.css";
import { h } from "@shared/ui/dom";
import { createInput, field } from "@shared/ui/form";
import { login, logout } from "../api";
import { authLink, goHome, showAuthForm } from "../components/auth-form";

if (location.search.includes("logout")) {
  try {
    await logout();
  } catch {
  }
  history.replaceState(null, "", "/pages/login.html");
}

const emailInput = createInput({ type: "email", required: "", autocomplete: "email" });
const passwordInput = createInput({ type: "password", required: "", autocomplete: "current-password" });

showAuthForm({
  subtitle: "Хранилище трёхмерных моделей команды",
  fields: [
    field("Электронная почта", emailInput),
    field("Пароль", passwordInput),
  ],
  buttonText: "Войти",
  footer: h("div", { class: "auth-foot" }, "Нет учётной записи? ", h("a", { href: authLink("register") }, "Зарегистрироваться")),
  onSubmit: async () => {
    const me = await login(emailInput.value, passwordInput.value);
    goHome(me.user.isAdmin);
  },
});
