import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { readObj } from "../../../../converter/readers/obj.js";

const origin = "http://model-render.invalid";
const threeRoot = resolve(import.meta.dirname, "../../../../frontend/node_modules/three");
const contentTypes = {
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function inside(root, path) {
  const target = resolve(root, path);
  if (!target.startsWith(root + sep)) throw new Error("Неверный путь ресурса рендеринга");
  return target;
}

async function describe(path, root, prefix) {
  const format = extname(path).toLowerCase() === ".glb" ? "GLB" : "OBJ";
  const url = (name) => prefix + relative(root, name).split(sep).map(encodeURIComponent).join("/");
  const materials =
    format === "OBJ"
      ? readObj(await readFile(path)).materialLibraries.map((name) =>
          url(inside(root, relative(root, resolve(dirname(path), name)))),
        )
      : [];
  return { format, url: url(path), materials };
}

export async function compareModelImages(inputPath, resultPath, resourceRoot, imageFolder) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      timeout: 20000,
      args: ["--enable-unsafe-swiftshader"],
    });
    const context = await browser.newContext({
      viewport: { width: 384, height: 384 },
      serviceWorkers: "block",
    });
    const resultRoot = dirname(resultPath);
    await context.route("**/*", async (route) => {
      try {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === "/")
          return route.fulfill({
            contentType: "text/html",
            body: '<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><script type="module" src="/render-page.js"></script>',
          });
        let path;
        if (["/render-page.js", "/image-score.js"].includes(url.pathname))
          path = join(import.meta.dirname, url.pathname.slice(1));
        else if (url.pathname.startsWith("/three/"))
          path = inside(threeRoot, decodeURIComponent(url.pathname.slice(7)));
        else if (url.pathname.startsWith("/input/"))
          path = inside(resourceRoot, decodeURIComponent(url.pathname.slice(7)));
        else if (url.pathname.startsWith("/result/"))
          path = inside(resultRoot, decodeURIComponent(url.pathname.slice(8)));
        else return route.abort();
        await route.fulfill({
          body: await readFile(path),
          contentType: contentTypes[extname(path).toLowerCase()] ?? "application/octet-stream",
        });
      } catch {
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    await page.goto(origin);
    await page.waitForFunction(() => typeof window.renderComparison === "function", null, {
      timeout: 15000,
    });
    const descriptions = [
      await describe(inputPath, resourceRoot, "/input/"),
      await describe(resultPath, resultRoot, "/result/"),
    ];
    let timer;
    const rendered = await Promise.race([
      page.evaluate(([source, result]) => window.renderComparison(source, result), descriptions),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Превышено время визуального сравнения")), 60000);
      }),
    ]).finally(() => clearTimeout(timer));
    await mkdir(imageFolder);
    for (const [index, view] of rendered.views.entries()) {
      for (const side of ["before", "after"]) {
        const file = `${side}-${index}.png`;
        await writeFile(join(imageFolder, file), Buffer.from(view[side].split(",")[1], "base64"));
      }
    }
    return {
      status: "done",
      method: "RGB SSIM, окна 8×8",
      score: rendered.score,
      threshold: 80,
      views: rendered.views.map((view, index) => ({ name: view.name, score: view.score, index })),
    };
  } catch {
    return {
      status: "unavailable",
      message:
        "Не удалось получить изображения для сравнения. Проверьте установку Chromium и доступность WebGL на сервере.",
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
