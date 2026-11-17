import { fork, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, posix, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { PoolClient } from "pg";
import { db, transaction } from "../../db";
import { log } from "../../logger";
import { absolutePath, removeFolder, verifyStoredFile } from "../../storage";
import { lockTeam } from "../accounts/team-repository";
import { uploadTempFolder } from "../upload/temporary-files";
import type { StructuralReport } from "../quality/report";

interface Job {
  id: number;
  version_id: number;
  created_by: number;
  target_format: string;
  upscale_textures: boolean;
  attempt: string;
}
interface InputFile {
  file_name: string;
  storage_path: string;
  checksum: string | null;
}
interface Result {
  path: string;
  losses: string[];
  quality: StructuralReport;
}

export function startConversionQueue() {
  let stopping = false;
  let leaseLost = false;
  let active: ChildProcess | undefined;
  const canWork = () => !stopping && !leaseLost;
  async function execute(job: Job, work: string, inputPath: string): Promise<Result> {
    return new Promise((done, reject) => {
      const child = fork(resolve(import.meta.dirname, "process-file.js"), [], {
        execArgv: ["--max-old-space-size=512"],
        silent: true,
        windowsHide: true,
        env: { ...process.env, DATABASE_URL: undefined, TEST_DATABASE_URL: undefined },
      });
      active = child;
      child.stdout!.resume();
      child.stderr!.resume();
      const timer = setTimeout(
        () => finish(new Error("Превышено время преобразования: 2 минуты")),
        120000,
      );
      let settled = false;
      const finish = (error?: Error, result?: Result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        active = undefined;
        if (child.connected) child.disconnect();
        child.kill();
        if (error) reject(error);
        else done(result!);
      };
      child.once("error", (error) => finish(error));
      child.once("exit", () =>
        finish(new Error("Процесс преобразования завершился без результата")),
      );
      child.once("message", (message: { error?: string; result?: Result }) => {
        if (message.error) return finish(new Error(message.error));
        const result = message.result;
        if (
          !result ||
          !resolve(result.path).startsWith(work + sep) ||
          !Array.isArray(result.losses) ||
          !result.losses.every((loss) => typeof loss === "string")
        )
          return finish(new Error("Неверный результат конвертера"));
        finish(undefined, result);
      });
      child.send(
        {
          inputPath,
          targetFormat: job.target_format,
          outputDirectory: join(work, "output"),
          resourceRoot: join(work, "input"),
          upscale: job.upscale_textures,
        },
        (error) => {
          if (error) finish(error);
        },
      );
    });
  }
  async function run(job: Job) {
    const work = await mkdtemp(join(uploadTempFolder, "conversion-"));
    let outputFolder = "";
    let published = false;
    try {
      const context = await db.query<{ team_id: number; allowed: boolean }>(
        `SELECT m.team_id, (NOT t.is_blocked AND NOT u.is_blocked AND tm.role IN ('member','owner')) AS allowed
         FROM model_versions v JOIN models m ON m.id=v.model_id JOIN teams t ON t.id=m.team_id
         JOIN users u ON u.id=$2 LEFT JOIN team_members tm ON tm.team_id=t.id AND tm.user_id=u.id WHERE v.id=$1`,
        [job.version_id, job.created_by],
      );
      const teamId = context.rows[0]?.team_id;
      if (!teamId || !context.rows[0].allowed)
        throw new Error("Модель недоступна или права на преобразование изменились");
      const files = (
        await db.query<InputFile>(
          `SELECT file_name,storage_path,checksum FROM files WHERE version_id=$1 ORDER BY id`,
          [job.version_id],
        )
      ).rows;
      if (!files.length) throw new Error("Не найден исходный файл модели");
      const textures = (
        await db.query<InputFile>(
          `SELECT file_name,storage_path,NULL AS checksum FROM textures WHERE version_id=$1 ORDER BY id`,
          [job.version_id],
        )
      ).rows;
      const versionFolder = posix.dirname(files[0].storage_path);
      const prefix = `converted-${job.id}-`;
      for (const entry of await readdir(absolutePath(versionFolder), { withFileTypes: true })) {
        if (
          entry.isDirectory() &&
          entry.name.startsWith(prefix) &&
          /^[a-f0-9-]{36}$/.test(entry.name.slice(prefix.length))
        )
          await removeFolder(posix.join(versionFolder, entry.name));
      }
      const input = join(work, "input");
      await mkdir(input);
      const names = new Set<string>();
      let inputPath = "";
      for (const file of [...files, ...textures]) {
        if (!canWork()) return;
        const name = file.file_name.replace(/\\/g, "/");
        const target = resolve(input, name);
        const key = process.platform === "win32" ? target.toLowerCase() : target;
        if (!target.startsWith(input + sep) || name.includes(":"))
          throw new Error("Неверный путь исходного файла");
        if (names.has(key)) throw new Error("В пакете совпадают имена файлов");
        names.add(key);
        if (file.checksum) await verifyStoredFile(file.storage_path, file.checksum);
        await mkdir(resolve(target, ".."), { recursive: true });
        await copyFile(absolutePath(file.storage_path), target);
        if (!inputPath) inputPath = target;
      }
      if (!canWork()) return;
      const result = await execute(job, work, inputPath);
      if (!canWork()) return;
      outputFolder = posix.join(versionFolder, prefix + randomUUID());
      await transaction(async (client) => {
        await lockTeam(client, teamId);
        const current = await client.query(
          `SELECT id FROM conversion_jobs WHERE id=$1 AND status='running' AND started_at::text=$2 FOR UPDATE`,
          [job.id, job.attempt],
        );
        if (!current.rows.length) throw new Error("Обработка была прервана или модель удалена");
        const rights = await client.query(
          `SELECT tm.role FROM team_members tm JOIN users u ON u.id=tm.user_id JOIN teams t ON t.id=tm.team_id
          WHERE tm.team_id=$1 AND tm.user_id=$2 AND tm.role IN ('member','owner') AND NOT u.is_blocked AND NOT t.is_blocked FOR SHARE OF u,t`,
          [teamId, job.created_by],
        );
        if (!rights.rows.length || !canWork())
          throw new Error("Права на преобразование изменились");
        await mkdir(absolutePath(outputFolder), { recursive: true });
        const fileName = "model" + extname(result.path);
        const stored = posix.join(outputFolder, fileName);
        await copyFile(result.path, absolutePath(stored));
        if (result.quality.upscale?.items.some((item) => item.status === "done")) {
          await cp(join(work, "textures"), absolutePath(posix.join(outputFolder, "textures")), {
            recursive: true,
          });
        }
        const imagePath = join(work, "images");
        if (result.quality.visual?.status === "done") {
          await cp(imagePath, absolutePath(posix.join(outputFolder, "images")), {
            recursive: true,
          });
        }
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(absolutePath(stored))) hash.update(chunk);
        const checksum = hash.digest("hex");
        await writeFile(
          absolutePath(posix.join(outputFolder, "report.json")),
          JSON.stringify({ losses: result.losses, quality: result.quality }),
        );
        await client.query(
          `INSERT INTO files(job_id,format,file_name,storage_path,size_bytes,checksum) VALUES($1,$2,$3,$4,$5,$6)`,
          [
            job.id,
            job.target_format,
            fileName,
            stored,
            (await stat(absolutePath(stored))).size,
            checksum,
          ],
        );
        await client.query(
          `UPDATE conversion_jobs SET status='done',finished_at=now(),error_message=NULL WHERE id=$1`,
          [job.id],
        );
        if (result.quality.visual?.status === "done") {
          const check = await client.query<{ id: number }>(
            `INSERT INTO quality_checks(job_id,similarity_percent,needs_review) VALUES($1,$2,$3) RETURNING id`,
            [job.id, result.quality.visual.score, result.quality.needsReview],
          );
          for (const [kind, messages] of [
            ["loss", result.quality.losses],
            ["defect", result.quality.defects],
          ] as const) {
            for (const message of messages) {
              await client.query(
                `INSERT INTO quality_issues(check_id,kind,message) VALUES($1,$2,$3)`,
                [check.rows[0].id, kind, message.slice(0, 500)],
              );
            }
          }
        }
        await client.query(
          `INSERT INTO action_log(user_id,team_id,action,details) VALUES($1,$2,'convert',$3)`,
          [
            job.created_by,
            teamId,
            `Конвертация ${job.id} завершена: ${job.target_format}. Предупреждений: ${result.losses.length}`,
          ],
        );
      });
      published = true;
      log("INFO", `Конвертация ${job.id} завершена`);
    } catch (error) {
      if (canWork()) {
        const message = error instanceof Error ? error.message : "Ошибка преобразования";
        await db.query(
          `UPDATE conversion_jobs SET status='failed',finished_at=now(),error_message=$3 WHERE id=$1 AND status='running' AND started_at::text=$2`,
          [job.id, job.attempt, message.slice(0, 2000)],
        );
        log("WARN", `Конвертация ${job.id}: ${message}`);
      }
    } finally {
      if (outputFolder && !published) await removeFolder(outputFolder);
      if (!work.startsWith(uploadTempFolder + sep)) throw new Error("Неверный путь рабочей папки");
      await rm(work, { recursive: true, force: true });
    }
  }
  const finished = (async () => {
    while (!stopping) {
      let client: PoolClient | undefined;
      let locked = false;
      leaseLost = false;
      const connectionError = () => {
        leaseLost = true;
        active?.kill();
      };
      try {
        client = await db.connect();
        client.on("error", connectionError);
        locked = (
          await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(300305,1) AS locked")
        ).rows[0].locked;
        if (locked) {
          await client.query(
            `UPDATE conversion_jobs SET status='queued',started_at=NULL,finished_at=NULL,error_message=NULL WHERE status='running'`,
          );
          while (canWork()) {
            const result =
              await client.query<Job>(`UPDATE conversion_jobs SET status='running',started_at=clock_timestamp(),finished_at=NULL,error_message=NULL
              WHERE id=(SELECT id FROM conversion_jobs WHERE status='queued' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
              RETURNING *,started_at::text AS attempt`);
            if (result.rows[0]) await run(result.rows[0]);
            else await delay(500);
          }
        }
      } catch (error) {
        if (!stopping) log("ERROR", "Очередь конвертации: " + String(error));
      } finally {
        if (client) {
          if (locked && !leaseLost)
            await client.query("SELECT pg_advisory_unlock(300305,1)").catch(() => {});
          client.removeListener("error", connectionError);
          client.release(leaseLost);
        }
      }
      if (!stopping) await delay(1000);
    }
  })();
  return {
    stop: async () => {
      stopping = true;
      active?.kill();
      await finished;
    },
  };
}
