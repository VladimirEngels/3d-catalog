
import { db } from "./db";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const isAdmin = process.argv[3] !== "--remove";

if (email === "") {
  console.log("Укажите почту зарегистрированного пользователя: npm run make-admin -- почта@пример.ru");
  process.exit(1);
}

const result = await db.query("UPDATE users SET is_system_admin = $1 WHERE email = $2", [isAdmin, email]);
await db.end();

if (result.rowCount === 0) {
  console.log("Пользователь с такой почтой не найден. Сначала зарегистрируйтесь на сайте.");
  process.exit(1);
}
console.log(isAdmin ? `${email} теперь администратор системы` : `${email} больше не администратор системы`);
