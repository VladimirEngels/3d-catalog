import { getSession } from "@shared/session";
import { confirmAction, showMessage } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { formatBytes, formatNumber } from "@shared/ui/format";
import { mountLayout, pageHead } from "@shared/ui/layout";
import { getAdminTeams, setTeamBlocked, type AdminTeam } from "../api";
import { buildAdminList } from "../components/admin-list";

const main = await mountLayout("admin-teams", "admin");
const session = await getSession();

if (!session.user.isAdmin) {
  location.href = "/pages/catalog.html";
  await new Promise(() => {});
}

function buildRow(team: AdminTeam, reload: () => void): HTMLElement {
  const action = h("button", { class: "btn small", type: "button" }, team.isBlocked ? "Разблокировать" : "Заблокировать");
  action.addEventListener("click", async () => {
    if (!team.isBlocked) {
      const agreed = await confirmAction(`Заблокировать команду «${team.name}»?`, "Её участники потеряют доступ к каталогу. Данные сохранятся, команду можно разблокировать.", "Заблокировать");
      if (!agreed) {
        return;
      }
    }
    try {
      await setTeamBlocked(team.id, !team.isBlocked);
      reload();
    } catch (error) {
      showMessage("Не удалось выполнить действие", errorText(error));
    }
  });

  return h("tr", {},
    h("td", {}, team.name),
    h("td", {}, team.ownerEmails.join(", ") || "—"),
    h("td", {}, formatNumber(team.memberCount)),
    h("td", {}, formatNumber(team.modelCount)),
    h("td", {}, formatBytes(team.diskBytes)),
    h("td", {}, h("span", { class: team.isBlocked ? "status blocked" : "status done" }, team.isBlocked ? "Заблокирована" : "Активна")),
    h("td", {}, action),
  );
}

main.append(
  pageHead("Команды"),
  buildAdminList<AdminTeam>({
    searchPlaceholder: "Поиск команды или владельца",
    statusLabels: ["Активные", "Заблокированные"],
    columns: ["Команда", "Владелец", "Участников", "Моделей", "На диске", "Состояние", ""],
    emptyText: "Команд не найдено",
    loadPage: getAdminTeams,
    buildRow,
  }),
);
