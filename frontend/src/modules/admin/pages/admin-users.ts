import { getSession } from "@shared/session";
import { confirmAction, showMessage } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { formatDate } from "@shared/ui/format";
import { mountLayout, pageHead } from "@shared/ui/layout";
import { getAdminUsers, setUserBlocked, type AdminUser } from "../api";
import { buildAdminList } from "../components/admin-list";

const main = await mountLayout("admin-users", "admin");
const session = await getSession();

if (!session.user.isAdmin) {
  location.href = "/pages/catalog.html";
  await new Promise(() => {});
}

function buildRow(user: AdminUser, reload: () => void): HTMLElement {
  let action: HTMLElement | null = null;
  if (user.id !== session.user.id) {
    action = h("button", { class: "btn small", type: "button" }, user.isBlocked ? "Разблокировать" : "Заблокировать");
    action.addEventListener("click", async () => {
      if (!user.isBlocked) {
        const agreed = await confirmAction(`Заблокировать ${user.name}?`, "Человек сразу выйдет из системы и не сможет войти снова. Его модели останутся в командах.", "Заблокировать");
        if (!agreed) {
          return;
        }
      }
      try {
        await setUserBlocked(user.id, !user.isBlocked);
        reload();
      } catch (error) {
        showMessage("Не удалось выполнить действие", errorText(error));
      }
    });
  }

  return h("tr", {},
    h("td", {}, h("div", { class: "person" }, h("div", {}, user.name, user.isAdmin ? " (администратор)" : "", h("small", {}, user.email)))),
    h("td", {}, String(user.teamCount)),
    h("td", { class: "muted" }, formatDate(user.createdAt)),
    h("td", { class: "muted" }, user.lastLogin ? formatDate(user.lastLogin) : "—"),
    h("td", {}, h("span", { class: user.isBlocked ? "status blocked" : "status done" }, user.isBlocked ? "Заблокирован" : "Активен")),
    h("td", {}, action),
  );
}

main.append(
  pageHead("Пользователи"),
  buildAdminList<AdminUser>({
    searchPlaceholder: "Поиск по имени или почте",
    statusLabels: ["Активные", "Заблокированные"],
    columns: ["Пользователь", "Команд", "Зарегистрирован", "Последний вход", "Состояние", ""],
    emptyText: "Никого не найдено",
    loadPage: getAdminUsers,
    buildRow,
  }),
);
