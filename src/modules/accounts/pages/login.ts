import {signIn} from "../../../shared/session";

const form = document.querySelector<HTMLFormElement>(".auth-form");

if (form !== null) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
  
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();


    signIn(email);
    location.href = "/pages/catalog.html";
  });
}
