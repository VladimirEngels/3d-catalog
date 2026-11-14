
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { resolve } from "node:path";
import { AppError } from "./errors";
import { log } from "./logger";
import { requestLog } from "./middleware/request-log";
import { accountsRouter } from "./modules/accounts/routes";
import { adminRouter } from "./modules/admin/routes";
import { collectionRouter } from "./modules/catalog/collection-routes";
import { modelRouter } from "./modules/catalog/model-routes";
import { catalogRouter } from "./modules/catalog/routes";
import { conversionRouter } from "./modules/conversion/routes";
import { qualityRouter } from "./modules/quality/routes";
import { teamsRouter } from "./modules/accounts/team-routes";
import { uploadRouter } from "./modules/upload/routes";

export const app = express();

app.disable("x-powered-by");
app.use("/api", requestLog);
app.use(express.json());
app.use(cookieParser());

app.use("/api", accountsRouter);
app.use("/api", teamsRouter);
app.use("/api", uploadRouter);
app.use("/api", catalogRouter);
app.use("/api", modelRouter);
app.use("/api", qualityRouter);
app.use("/api", collectionRouter);
app.use("/api", adminRouter);
app.use("/api", conversionRouter);

app.use("/api", () => {
  throw new AppError(404, "Такого адреса нет");
});

app.use(express.static(resolve(import.meta.dirname, "../../frontend/dist")));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  if (error instanceof multer.MulterError) {
    const tooBig = error.code === "LIMIT_FILE_SIZE";
    res.status(tooBig ? 413 : 400).json({ error: tooBig ? "Файл слишком большой: можно загрузить до 100 МБ" : "Не удалось принять файл" });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "Неверный формат запроса" });
    return;
  }
  log("ERROR", error instanceof Error ? String(error.stack) : String(error));
  res.status(500).json({ error: "Ошибка на сервере. Попробуйте ещё раз" });
});
