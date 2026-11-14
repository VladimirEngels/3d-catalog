import { defineConfig } from "vite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = import.meta.dirname;

const pages: Record<string, string> = { index: resolve(root, "index.html") };
for (const file of readdirSync(resolve(root, "pages"))) {
  if (file.endsWith(".html")) {
    const name = file.replace(".html", "");
    pages[name] = resolve(root, "pages", file);
  }
}

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(root, "src/shared"),
      "@modules": resolve(root, "src/modules"),
    },
  },
  build: {
    rollupOptions: { input: pages },
  },
  optimizeDeps: {
    include: [
      "three",
      "three/addons/controls/OrbitControls.js",
      "three/addons/loaders/GLTFLoader.js",
      "three/addons/loaders/MTLLoader.js",
      "three/addons/loaders/OBJLoader.js",
      "three/addons/loaders/PLYLoader.js",
      "three/addons/loaders/STLLoader.js",
    ],
  },
  server: {
    proxy: { "/api": "http://localhost:3000" },
  },
});
