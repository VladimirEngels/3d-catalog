
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { writeFile } from "node:fs/promises";
import yazl from "yazl";
import { db } from "../db";
import { hashPassword } from "../modules/accounts/passwords";
import { createUser, type UserRow } from "../modules/accounts/repository";
import { listTeamStoragePaths } from "../modules/catalog/repository";
import { addModel } from "../modules/upload/service";
import { absolutePath, removeFoldersOfFiles } from "../storage";
import { addBox, addCylinder, addSphere, addTorus, createMesh, createPng, toGlb, toObj, toPly, toStl, type Mesh } from "./geometry";

const DEMO_DOMAIN = "demo.3d-katalog.local";
const DEMO_PASSWORD = "demo12345";
const TEAM_NAME = "Студия «Север» (демо)";


async function removeOldDemo(): Promise<void> {
  const users = `SELECT id FROM users WHERE email LIKE '%@${DEMO_DOMAIN}'`;
  const teams = await db.query<{ id: number }>(`SELECT DISTINCT team_id AS id FROM team_members WHERE user_id IN (${users})`);
  for (const team of teams.rows) {
    const paths = await listTeamStoragePaths(team.id);
    await db.query("DELETE FROM teams WHERE id = $1", [team.id]);
    await removeFoldersOfFiles(paths);
  }
  await db.query(`DELETE FROM action_log WHERE user_id IN (${users})`);
  await db.query(`DELETE FROM users WHERE email LIKE '%@${DEMO_DOMAIN}'`);
}

async function createDemoUser(name: string, login: string): Promise<UserRow> {
  return createUser(`${login}@${DEMO_DOMAIN}`, await hashPassword(DEMO_PASSWORD), name);
}


function buildFigure(heavyArmor: boolean): Mesh {
  const mesh = createMesh();
  addBox(mesh, [0, 1.05, 0], [0.5, 0.7, 0.28]);
  addSphere(mesh, [0, 1.62, 0], 0.2, 24);
  addBox(mesh, [-0.38, 1.05, 0], [0.16, 0.65, 0.16]);
  addBox(mesh, [0.38, 1.05, 0], [0.16, 0.65, 0.16]);
  addBox(mesh, [-0.14, 0.35, 0], [0.18, 0.7, 0.2]);
  addBox(mesh, [0.14, 0.35, 0], [0.18, 0.7, 0.2]);
  if (heavyArmor) {
    addBox(mesh, [0, 1.25, 0], [0.62, 0.22, 0.36]);
  }
  return mesh;
}

function buildChest(): Mesh {
  const mesh = createMesh();
  addBox(mesh, [0, 0.3, 0], [1.2, 0.6, 0.8]);
  addCylinder(mesh, [0, 0.72, 0], 0.4, 0.4, 0.1, 24);
  addBox(mesh, [0, 0.72, 0], [1.2, 0.24, 0.8]);
  addBox(mesh, [0, 0.42, 0.42], [0.2, 0.24, 0.06]);
  return mesh;
}

function buildBarrel(): Mesh {
  const mesh = createMesh();
  addCylinder(mesh, [0, 0.8, 0], 0.42, 0.5, 0.6, 32);
  addCylinder(mesh, [0, 0.2, 0], 0.5, 0.42, 0.6, 32);
  addTorus(mesh, [0, 0.5, 0], 0.5, 0.02, 32);
  return mesh;
}

function buildTent(): Mesh {
  const mesh = createMesh();
  addCylinder(mesh, [0, 1, 0], 0.02, 1.2, 1.2, 6);
  addCylinder(mesh, [0, 0.2, 0], 1.2, 1.2, 0.4, 6);
  return mesh;
}

function buildWheel(): Mesh {
  const mesh = createMesh();
  addTorus(mesh, [0, 0, 0], 0.8, 0.08);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    addBox(mesh, [Math.cos(angle) * 0.4, Math.sin(angle) * 0.4, 0], [0.08 + Math.abs(Math.cos(angle)) * 0.62, 0.08 + Math.abs(Math.sin(angle)) * 0.62, 0.06]);
  }
  return mesh;
}

function buildOrb(): Mesh {
  const mesh = createMesh();
  addSphere(mesh, [0, 0, 0], 0.7, 48);
  addTorus(mesh, [0, 0, 0], 1, 0.03);
  return mesh;
}

type Pattern = (x: number, y: number) => [number, number, number];

const woodPattern: Pattern = (x, y) => {
  const wave = (Math.sin((x * 14 + Math.sin(y * 9) * 1.2) * Math.PI) + 1) / 2;
  return [Math.round(110 + wave * 70), Math.round(72 + wave * 44), Math.round(38 + wave * 20)];
};
const leatherPattern: Pattern = (x, y) => {
  const wave = (Math.sin(x * 40) * Math.sin(y * 40) + 1) / 2;
  return [Math.round(84 + wave * 50), Math.round(122 + wave * 50), Math.round(66 + wave * 26)];
};
const bonePattern: Pattern = (x, y) => {
  const wave = (Math.sin(x * 22) * Math.cos(y * 60) + 1) / 2;
  return [Math.round(196 + wave * 40), Math.round(188 + wave * 38), Math.round(160 + wave * 34)];
};
const metalPattern: Pattern = (x, y) => {
  const wave = (Math.sin((x + y) * 30) + 1) / 2;
  return [Math.round(150 + wave * 60), Math.round(156 + wave * 60), Math.round(170 + wave * 60)];
};


interface JobPlan {
  model: string;
  by: UserRow;
  target: "OBJ" | "GLB" | "STL" | "PLY";
  status: "queued" | "running" | "done" | "failed";
  hoursAgo: number;
  error?: string;
  upscale?: boolean;
  similarity?: number;
  losses?: string[];
  defects?: string[];
}

function formatFile(mesh: Mesh, format: string): Buffer {
  switch (format) {
    case "OBJ": return toObj(mesh);
    case "STL": return toStl(mesh);
    case "PLY": return toPly(mesh);
    default: return toGlb(mesh, {});
  }
}

function zipFiles(files: Record<string, Buffer>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new yazl.ZipFile();
    for (const name of Object.keys(files)) {
      archive.addBuffer(files[name], name);
    }
    archive.end();
    const chunks: Buffer[] = [];
    archive.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    archive.outputStream.on("error", reject);
  });
}

async function objArchive(mesh: Mesh, baseName: string, material: string, pattern: Pattern, size: number): Promise<Buffer> {
  return zipFiles({
    [`${baseName}.obj`]: toObj(mesh, `${baseName}.mtl`, material),
    [`${baseName}.mtl`]: Buffer.from(`newmtl ${material}\nKd 1 1 1\nmap_Kd textures/${baseName}.png\n`),
    [`textures/${baseName}.png`]: createPng(size, pattern),
  });
}

async function main(): Promise<void> {
  await removeOldDemo();
  const work = mkdtempSync(join(tmpdir(), "3d-katalog-demo-"));

  const owner = await createDemoUser("Владимир П.", "owner");
  const anna = await createDemoUser("Анна К.", "anna");
  const ivan = await createDemoUser("Иван С.", "ivan");
  const viewer = await createDemoUser("Дмитрий Р.", "viewer");
  const admin = await createDemoUser("Администратор", "admin");
  await db.query("UPDATE users SET is_system_admin = true WHERE id = $1", [admin.id]);

  const team = await db.query<{ id: number }>("INSERT INTO teams (name) VALUES ($1) RETURNING id", [TEAM_NAME]);
  const teamId = team.rows[0].id;
  const members: [UserRow, string][] = [[owner, "owner"], [anna, "member"], [ivan, "member"], [viewer, "viewer"]];
  for (const [user, role] of members) {
    await db.query("INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)", [teamId, user.id, role]);
  }

  const figure = buildFigure(false);
  const armored = buildFigure(true);
  const chest = buildChest();
  const barrel = buildBarrel();
  const tent = buildTent();
  const wheel = buildWheel();
  const orb = buildOrb();

  const plans: { name: string; file: string; data: Buffer; by: UserRow; description: string; tags: string; mesh: Mesh; daysAgo: number }[] = [
    { name: "Сундук деревянный", file: "chest.zip", data: await objArchive(chest, "chest", "Дерево", woodPattern, 64), by: ivan, description: "Реквизит для таверны и подземелий.", tags: "реквизит, дерево", mesh: chest, daysAgo: 12 },
    { name: "Бочка с обручами", file: "barrel.zip", data: await objArchive(barrel, "barrel", "Дерево", woodPattern, 128), by: ivan, description: "Простая бочка для рынка.", tags: "реквизит, рынок", mesh: barrel, daysAgo: 11 },
    { name: "Шатёр торговца", file: "tent.stl", data: toStl(tent), by: anna, description: "Шатёр без текстур: заготовка для печати.", tags: "окружение, рынок", mesh: tent, daysAgo: 10 },
    { name: "Магическая сфера", file: "orb.ply", data: toPly(orb), by: anna, description: "", tags: "эффекты", mesh: orb, daysAgo: 8 },
    { name: "Колесо телеги", file: "wheel.obj", data: toObj(wheel), by: ivan, description: "Колесо для телеги торговца.", tags: "реквизит", mesh: wheel, daysAgo: 6 },
    { name: "Скелет-страж", file: "guard.glb", data: toGlb(figure, { skeleton: true, texture: createPng(128, bonePattern), materialName: "Кость" }), by: anna, description: "Страж подземелья.", tags: "враг", mesh: figure, daysAgo: 5 },
    { name: "Гоблин-лучник", file: "goblin_archer.glb", data: toGlb(figure, { skeleton: true, texture: createPng(128, leatherPattern), materialName: "Кожа" }), by: anna, description: "Враг дальнего боя для первого уровня. Анимации: ходьба, выстрел.", tags: "враг, фэнтези", mesh: figure, daysAgo: 3 },
    { name: "Рыцарь, базовый", file: "knight_base.glb", data: toGlb(armored, { skeleton: true, texture: createPng(128, metalPattern), materialName: "Броня" }), by: owner, description: "Главный герой, базовая версия.", tags: "средневековье, герой", mesh: armored, daysAgo: 1 },
  ];

  const modelIds = new Map<string, number>();
  const meshes = new Map<string, Mesh>();
  for (const plan of plans) {
    const path = join(work, plan.file);
    writeFileSync(path, plan.data);
    const { modelId } = await addModel(plan.by, teamId, {
      file: { originalName: plan.file, path },
      name: plan.name,
      description: plan.description,
      tags: plan.tags,
      collectionId: "",
    });
    modelIds.set(plan.name, modelId);
    meshes.set(plan.name, plan.mesh);
    await db.query(
      "UPDATE models SET created_at = now() - $1 * interval '1 day', updated_at = now() - $1 * interval '1 day' WHERE id = $2",
      [plan.daysAgo, modelId],
    );
    await db.query(
      "UPDATE model_versions SET created_at = now() - $1 * interval '1 day' WHERE model_id = $2",
      [plan.daysAgo, modelId],
    );
  }

  for (const [name, models] of [
    ["Уровень 1", ["Гоблин-лучник", "Скелет-страж", "Сундук деревянный", "Бочка с обручами"]],
    ["Рынок", ["Шатёр торговца", "Бочка с обручами", "Колесо телеги"]],
    ["Персонажи", ["Рыцарь, базовый", "Гоблин-лучник", "Скелет-страж"]],
  ] as [string, string[]][]) {
    const collection = await db.query<{ id: number }>("INSERT INTO collections (team_id, name) VALUES ($1, $2) RETURNING id", [teamId, name]);
    for (const model of models) {
      await db.query("INSERT INTO collection_models (collection_id, model_id) VALUES ($1, $2)", [collection.rows[0].id, modelIds.get(model)]);
    }
  }

  const SKELETON_OBJ = "Скелет не сохранён: формат OBJ его не поддерживает";
  const ANIMATION_OBJ = "Анимации не сохранены: формат OBJ их не поддерживает";
  const jobs: JobPlan[] = [
    { model: "Рыцарь, базовый", by: owner, target: "OBJ", status: "running", hoursAgo: 0.2, upscale: true },
    { model: "Скелет-страж", by: owner, target: "PLY", status: "queued", hoursAgo: 0.1 },
    { model: "Колесо телеги", by: owner, target: "STL", status: "failed", hoursAgo: 3, error: "Файл повреждён: в строке 1204 треугольник ссылается на несуществующую вершину. Исправьте файл и загрузите заново." },
    { model: "Колесо телеги", by: ivan, target: "GLB", status: "done", hoursAgo: 8, similarity: 41, losses: ["Часть геометрии не сохранена: спицы потеряны при переводе"], defects: ["Вывернутые грани: 36", "Отсутствуют текстурные координаты"] },
    { model: "Гоблин-лучник", by: owner, target: "OBJ", status: "done", hoursAgo: 26, similarity: 72, losses: [SKELETON_OBJ, ANIMATION_OBJ, "Материалы упрощены: свойства «металличность» и «шероховатость» в MTL не переносятся"], defects: ["Дыры в поверхности: 2", "Пустые треугольники: 14"] },
    { model: "Сундук деревянный", by: owner, target: "GLB", status: "done", hoursAgo: 50, similarity: 94, upscale: true, losses: [], defects: [] },
    { model: "Магическая сфера", by: owner, target: "OBJ", status: "done", hoursAgo: 74, similarity: 91, losses: [], defects: ["Пустые треугольники: 3"] },
    { model: "Скелет-страж", by: anna, target: "OBJ", status: "done", hoursAgo: 96, similarity: 99, losses: [SKELETON_OBJ], defects: [] },
    { model: "Бочка с обручами", by: ivan, target: "STL", status: "failed", hoursAgo: 120, error: "Не найдена текстура: файл barrel.png отсутствует в архиве" },
    { model: "Шатёр торговца", by: anna, target: "GLB", status: "failed", hoursAgo: 200, error: "Файл повреждён: в строке 1204 треугольник ссылается на несуществующую вершину. Исправьте файл и загрузите заново." },
  ];

  const extraTargets: JobPlan["target"][] = ["OBJ", "GLB", "OBJ", "STL", "OBJ", "GLB", "PLY", "OBJ", "GLB", "OBJ"];
  const extraModels = ["Сундук деревянный", "Гоблин-лучник", "Бочка с обручами", "Шатёр торговца", "Скелет-страж"];
  const authors = [owner, anna, ivan];
  for (let i = 0; i < 24; i++) {
    jobs.push({
      model: extraModels[i % extraModels.length],
      by: authors[i % authors.length],
      target: extraTargets[i % extraTargets.length],
      status: "done",
      hoursAgo: 30 + (i * 13) % 300,
    });
  }

  for (const job of jobs) {
    const version = await db.query<{ id: number; file_path: string; source: string }>(
      `SELECT v.id, f.storage_path AS file_path, f.format AS source
       FROM model_versions v
       JOIN files f ON f.version_id = v.id
       WHERE v.model_id = $1
       ORDER BY f.id LIMIT 1`,
      [modelIds.get(job.model)],
    );
    const { id: versionId, file_path: filePath, source } = version.rows[0];
    if (source === job.target) {
      continue;
    }

    const finished = job.status === "done" || job.status === "failed";
    const created = await db.query<{ id: number }>(
      `INSERT INTO conversion_jobs (version_id, created_by, target_format, upscale_textures, status, error_message, created_at, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5::varchar, $6, now() - $7 * interval '1 hour',
               CASE WHEN $5::varchar = 'queued' THEN NULL ELSE now() - $7 * interval '1 hour' END,
               CASE WHEN $8::boolean THEN now() - $7 * interval '1 hour' + interval '40 seconds' END)
       RETURNING id`,
      [versionId, job.by.id, job.target, job.upscale === true, job.status, job.error ?? null, job.hoursAgo, finished],
    );
    const jobId = created.rows[0].id;

    if (job.status === "done" && job.similarity !== undefined) {
      const data = formatFile(meshes.get(job.model)!, job.target);
      const storagePath = posix.join(dirname(filePath).replace(/\\/g, "/"), `job-${jobId}.${job.target.toLowerCase()}`);
      await writeFile(absolutePath(storagePath), data);
      await db.query(
        `INSERT INTO files (job_id, format, file_name, storage_path, size_bytes, checksum, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() - $7 * interval '1 hour')`,
        [jobId, job.target, `${job.model}.${job.target.toLowerCase()}`, storagePath, data.length, createHash("sha256").update(data).digest("hex"), job.hoursAgo],
      );

      const check = await db.query<{ id: number }>(
        `INSERT INTO quality_checks (job_id, similarity_percent, needs_review, created_at)
         VALUES ($1, $2, $3, now() - $4 * interval '1 hour') RETURNING id`,
        [jobId, job.similarity, job.similarity < 80, job.hoursAgo],
      );
      for (const message of job.losses ?? []) {
        await db.query("INSERT INTO quality_issues (check_id, kind, message) VALUES ($1, 'loss', $2)", [check.rows[0].id, message]);
      }
      for (const message of job.defects ?? []) {
        await db.query("INSERT INTO quality_issues (check_id, kind, message) VALUES ($1, 'defect', $2)", [check.rows[0].id, message]);
      }

      if (job.upscale) {
        const texture = await db.query<{ id: number; file_name: string }>(
          "SELECT id, file_name FROM textures WHERE version_id = $1 ORDER BY id LIMIT 1",
          [versionId],
        );
        if (texture.rows[0]) {
          const size = 256;
          const image = createPng(size, woodPattern);
          const improvedPath = posix.join(dirname(filePath).replace(/\\/g, "/"), `improved-${texture.rows[0].id}.png`);
          await writeFile(absolutePath(improvedPath), image);
          await db.query(
            `INSERT INTO textures (source_texture_id, file_name, storage_path, width, height, size_bytes)
             VALUES ($1, $2, $3, $4, $4, $5)`,
            [texture.rows[0].id, `improved-${texture.rows[0].file_name.split("/").pop()}`, improvedPath, size, image.length],
          );
        }
      }
    }
  }

  for (const [user, hours] of [[owner, 1], [anna, 5], [ivan, 9], [viewer, 28]] as [UserRow, number][]) {
    await db.query("INSERT INTO action_log (user_id, action, created_at) VALUES ($1, 'login', now() - $2 * interval '1 hour')", [user.id, hours]);
  }
  await db.query(
    "INSERT INTO action_log (user_id, team_id, action, details, created_at) VALUES ($1, $2, 'download', $3, now() - interval '4 hours')",
    [viewer.id, teamId, "Скачан файл Сундук деревянный.glb модели «Сундук деревянный»"],
  );

  rmSync(work, { recursive: true, force: true });

  console.log("");
  console.log("Демо-данные созданы. Пароль у всех: " + DEMO_PASSWORD);
  console.log(`  владелец:      owner@${DEMO_DOMAIN}`);
  console.log(`  участник:      anna@${DEMO_DOMAIN}`);
  console.log(`  наблюдатель:   viewer@${DEMO_DOMAIN}`);
  console.log(`  администратор: admin@${DEMO_DOMAIN}`);
  console.log("");
  console.log("Войдите сначала как владелец и откройте каталог: браузер нарисует превью всех моделей.");
}

try {
  await main();
} finally {
  await db.end();
}
