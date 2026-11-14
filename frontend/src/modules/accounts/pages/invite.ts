import "@shared/styles/index.css";
import "../accounts.css";
import { ApiError } from "@shared/api/errors";
import type { Me } from "@shared/api/types";
import { roleName, switchTeam } from "@shared/session";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { acceptInvitation, previewInvitation } from "../api";

const token = new URLSearchParams(location.search).get("token") ?? "";
const encodedToken = encodeURIComponent(token);

function showCard(...content: (HTMLElement | string)[]): void {
  document.body.replaceChildren(h("div", { class: "auth" },
    h("div", { class: "auth-card" },
      h("div", { class: "logo" }, h("span", {}, "3D"), "-Каталог"),
      h("div", { class: "sub" }, "Приглашение в команду"),
      ...content,
    ),
  ));
}

async function getCurrentUser(): Promise<Me | null> {
  const response = await fetch("/api/me");
  return response.ok ? response.json() : null;
}

try {
  const invitation = await previewInvitation(token);
  const me = await getCurrentUser();
  const text = h("div", { class: "note info" },
    `${invitation.invitedBy} приглашает вас в команду `, h("b", {}, invitation.teamName),
    ` с ролью «${roleName[invitation.role]}».`,
  );

  if (me === null) {
    showCard(
      text,
      h("div", { class: "auth-actions" },
        h("a", { class: "btn primary", href: `/pages/register.html?invite=${encodedToken}` }, "Зарегистрироваться"),
        h("a", { class: "btn", href: `/pages/login.html?invite=${encodedToken}` }, "Войти"),
      ),
    );
  } else {
    const errorBox = h("div", { class: "err-text", role: "alert" });
    const acceptButton = h("button", { class: "btn primary", type: "button" }, "Принять");
    acceptButton.addEventListener("click", async () => {
      errorBox.textContent = "";
      try {
        const { teamId } = await acceptInvitation(token);
        switchTeam(teamId);
      } catch (error) {
        errorBox.textContent = errorText(error);
      }
    });
    showCard(
      text,
      h("div", { class: "hint" }, `Вы вошли как ${me.user.email}`),
      errorBox,
      h("div", { class: "auth-actions" },
        acceptButton,
        h("a", { class: "btn", href: "/pages/catalog.html" }, "Не сейчас"),
      ),
    );
  }
} catch (error) {
  const text = error instanceof ApiError ? error.message : errorText(error);
  showCard(
    h("div", { class: "err-text" }, text),
    h("div", { class: "auth-actions" }, h("a", { class: "btn", href: "/pages/catalog.html" }, "На главную")),
  );
}
