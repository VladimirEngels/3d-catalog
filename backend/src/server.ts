import { app } from "./app";
import { db } from "./db";
import { log } from "./logger";
import { deleteExpiredSessions } from "./modules/accounts/repository";
import { startConversionQueue } from "./modules/conversion/queue";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "localhost";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const server = app.listen(PORT, HOST, () => {
  log("INFO", `Сервер запущен: http://localhost:${PORT}`);
});

db.query("SELECT 1").catch((error) => {
  log(
    "ERROR",
    "Нет связи с базой данных. Проверьте, запущена ли служба PostgreSQL: " + String(error),
  );
});

async function cleanSessions(): Promise<void> {
  try {
    await deleteExpiredSessions();
  } catch (error) {
    log("ERROR", "Не удалось удалить просроченные сеансы: " + String(error));
  }
}

cleanSessions();
const cleanupInterval = setInterval(cleanSessions, ONE_DAY_MS);
const queue = startConversionQueue();
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(cleanupInterval);
  const closed = new Promise<void>((done) => server.close(() => done()));
  await queue.stop();
  server.closeAllConnections();
  await closed;
  await db.end();
}
process.once("SIGINT", () => {
  void shutdown().catch((error) => {
    log("ERROR", String(error));
    process.exitCode = 1;
  });
});
process.once("SIGTERM", () => {
  void shutdown().catch((error) => {
    log("ERROR", String(error));
    process.exitCode = 1;
  });
});
