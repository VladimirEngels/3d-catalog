
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";

interface AuthFormOptions {
  subtitle: string;
  fields: HTMLElement[];
  buttonText: string;
  footer: HTMLElement;
  onSubmit: () => Promise<void>;
}

export function showAuthForm(options: AuthFormOptions): void {
  const errorBox = h("div", { class: "err-text", role: "alert" });
  const button = h("button", { class: "btn primary", type: "submit" }, options.buttonText) as HTMLButtonElement;

  const form = h("form", { class: "auth-card" },
    h("div", { class: "logo" }, h("span", {}, "3D"), "-Каталог"),
    h("div", { class: "sub" }, options.subtitle),
    ...options.fields,
    errorBox,
    button,
    options.footer,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";
    button.disabled = true;
    try {
      await options.onSubmit();
    } catch (error) {
      errorBox.textContent = errorText(error);
    }
    button.disabled = false;
  });

  document.body.replaceChildren(h("div", { class: "auth" }, form));
}

export function getInviteToken(): string | null {
  return new URLSearchParams(location.search).get("invite");
}

export function goHome(isAdmin: boolean): void {
  const token = getInviteToken();
  if (token !== null) {
    location.href = "/pages/invite.html?token=" + encodeURIComponent(token);
  } else {
    location.href = isAdmin ? "/pages/admin.html" : "/pages/catalog.html";
  }
}

export function authLink(page: "login" | "register"): string {
  const token = getInviteToken();
  const query = token !== null ? "?invite=" + encodeURIComponent(token) : "";
  return `/pages/${page}.html${query}`;
}
