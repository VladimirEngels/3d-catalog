
import { app } from "./app";
import { db } from "./db";
import { log } from "./logger";
import { deleteExpiredSessions } from "./modules/accounts/repository";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "localhost";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

app.listen(PORT, HOST, () => {
  log("INFO", `Сервер запущен: http://localhost:${PORT}`);
});

db.query("SELECT 1").catch((error) => {
  log("ERROR", "Нет связи с базой данных. Проверьте, запущена ли служба PostgreSQL: " + String(error));
});

async function cleanSessions(): Promise<void> {
  try {
    await deleteExpiredSessions();
  } catch (error) {
    log("ERROR", "Не удалось удалить просроченные сеансы: " + String(error));
  }
}

cleanSessions();
setInterval(cleanSessions, ONE_DAY_MS);
