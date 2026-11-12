import { getUserEmail, signOut } from "../session";
import { h } from "./dom";

export function mountMenu(activePage: string): void {
    const menu = document.querySelector<HTMLElement>(".sidebar");

    if (menu === null) {
        return;             
    }
    
    const logo = h("div", "logo", "3D-Каталог");
    const email = h(
        "p",
        "sidebar-email",
        getUserEmail() ?? "Демонстрационный режим"
    );

    menu.replaceChildren(logo, email);

    const links = [
        { page: "catalog", text: "Каталог" },
        { page: "jobs", text: "Мои переводы" },
        { page: "summary", text: "Сводка"},
    ];

    for (const item of links) {
        const className = item.page === activePage ? "active" : "";
        const link = h("a", className, item.text);

        link.setAttribute("href", `/pages/${item.page}.html`);
        menu.appendChild(link);
    }

    const logout = h("a", "logout", "Выйти");
    logout.setAttribute("href", "/pages/login.html");

    logout.addEventListener("click", (event) => {
        event.preventDefault();
        signOut();
        location.href = "/pages/login.html";
    });

    menu.append(logout);
}