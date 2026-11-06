// Вход на заглушке: пароль не проверяется, это сделает сервер
const form = document.querySelector<HTMLFormElement>(".auth-form");

if (form !== null) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();                          // не перезагружать страницу
    const email = String(new FormData(form).get("email"));
    localStorage.setItem("userEmail", email);        // запомнить, кто вошёл
    location.href = "/pages/catalog.html";           // перейти в каталог
  });
}
