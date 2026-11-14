
import "@shared/styles/index.css";
import { getSession, can, roleName, switchTeam, type Action, type Session } from "@shared/session";
import { h } from "./dom";
import { icon, type IconName } from "./icons";

interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  needs?: Action;
}

const teamNav: NavItem[] = [
  { id: "catalog", label: "Каталог", icon: "box", href: "/pages/catalog.html" },
  { id: "collections", label: "Коллекции", icon: "folder", href: "/pages/collections.html" },
  { id: "jobs", label: "Мои переводы", icon: "jobs", href: "/pages/jobs.html", needs: "convert" },
];

const ownerNav: NavItem[] = [
  { id: "members", label: "Участники", icon: "users", href: "/pages/members.html", needs: "manageTeam" },
  { id: "log", label: "Журнал", icon: "log", href: "/pages/log.html", needs: "viewLog" },
  { id: "summary", label: "Сводка", icon: "chart", href: "/pages/summary.html", needs: "viewLog" },
];

const adminNav: NavItem[] = [
  { id: "admin", label: "Статистика", icon: "chart", href: "/pages/admin.html" },
  { id: "admin-users", label: "Пользователи", icon: "users", href: "/pages/admin-users.html" },
  { id: "admin-teams", label: "Команды", icon: "team", href: "/pages/admin-teams.html" },
];

export async function mountLayout(active: string, area: "team" | "admin" = "team"): Promise<HTMLElement> {
  const session = await getSession();
  const main = h("main", { class: "main" });
  const sidebar = buildSidebar(session, active, area);

  document.body.replaceChildren(h("div", { class: "layout" }, sidebar, main));
  return main;
}

export function pageHead(title: string, subtitle?: string, actions: HTMLElement[] = []): HTMLElement {
  const head = h("div", { class: "page-head" }, h("h1", {}, title));

  if (subtitle) {
    head.append(h("span", { class: "sub" }, subtitle));
  }
  if (actions.length > 0) {
    head.append(h("div", { class: "actions" }, ...actions));
  }
  return head;
}

function buildSidebar(session: Session, active: string, area: "team" | "admin"): HTMLElement {
  const sidebar = h("aside", { class: "sidebar" });

  const logo = h("div", { class: "logo" }, h("span", {}, "3D"), "-Каталог");
  sidebar.append(logo);

  if (area === "admin") {
    logo.append(h("span", { class: "admin-mark" }, "админ"));
  } else {
    sidebar.append(buildTeamSwitch(session));
  }

  sidebar.append(buildNav(session, active, area));
  sidebar.append(buildUserBlock(session));
  return sidebar;
}

function buildNav(session: Session, active: string, area: "team" | "admin"): HTMLElement {
  const nav = h("nav", { class: "nav" });

  if (area === "admin") {
    for (const item of adminNav) {
      nav.append(buildLink(item, active));
    }
    return nav;
  }

  for (const item of teamNav) {
    if (isAllowed(session, item)) {
      nav.append(buildLink(item, active));
    }
  }

  const ownerItems = ownerNav.filter((item) => isAllowed(session, item));
  if (ownerItems.length > 0) {
    nav.append(h("div", { class: "nav-title" }, "Управление командой"));
    for (const item of ownerItems) {
      nav.append(buildLink(item, active));
    }
  }
  return nav;
}

function isAllowed(session: Session, item: NavItem): boolean {
  return item.needs === undefined || can(session, item.needs);
}

function buildLink(item: NavItem, active: string): HTMLElement {
  const link = h("a", { href: item.href }, icon(item.icon), item.label);
  if (item.id === active) {
    link.classList.add("active");
  }
  return link;
}

function buildUserBlock(session: Session): HTMLElement {
  return h("div", { class: "sidebar-footer" },
    h("div", { class: "avatar" }, getInitials(session.user.name)),
    h("div", {},
      h("a", { href: "/pages/profile.html", class: "user-link" }, session.user.name),
      session.invitationCount > 0
        ? h("a", { href: "/pages/profile.html", class: "invitation-link" }, `Приглашения: ${session.invitationCount}`)
        : null,
      h("a", { href: "/pages/settings.html", class: "settings-link" }, "Настройки"),
      h("a", { href: "/pages/login.html?logout", class: "tag logout-link" }, "Выйти"),
    ),
  );
}

function buildTeamSwitch(session: Session): HTMLElement {
  const menu = buildTeamMenu(session);

  let teamName = "Нет команды";
  let roleText = "Создайте или примите приглашение";
  let initials = "?";
  if (session.team) {
    teamName = session.team.teamName;
    roleText = roleName[session.team.role];
    initials = getInitials(teamName);
  }

  const box = h("div", { class: "team-switch" },
    h("div", { class: "avatar" }, initials),
    h("div", {},
      h("div", { class: "name" }, teamName),
      h("div", { class: "role" }, roleText),
    ),
    h("span", { class: "chevron" }, icon("down")),
    menu,
  );

  box.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
  });
  return box;
}

function buildTeamMenu(session: Session): HTMLElement {
  const menu = h("div", { class: "menu team-menu" });
  menu.hidden = true;

  for (const team of session.teams) {
    if (team.teamId === session.team?.teamId) {
      continue;
    }
    const link = h("a", { href: "#" }, team.teamName);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      switchTeam(team.teamId);
    });
    menu.append(link);
  }

  menu.append(h("a", { href: "/pages/profile.html?newTeam" }, "+ Новая команда"));
  return menu;
}

function getInitials(name: string): string {
  const words = name.replace(/[«»]/g, "").split(" ");
  const first = words[0].charAt(0);
  const second = words.length > 1 ? words[1].charAt(0) : "";
  return (first + second).toUpperCase();
}
