
import { h } from "@shared/ui/dom";
import type { Material, Mesh, Object3D } from "three";
import type { ModelView } from "../api";

type ViewMode = "normal" | "wireframe" | "plain";

export async function showViewer(container: HTMLElement, view: ModelView): Promise<() => void> {
  const message = h("div", { class: "viewer-message" }, "Загрузка модели…");
  container.append(message);

  const THREE = await import("three");
  const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
  const { addLights, frameCamera, loadModel } = await import("./load-model");

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new THREE.Scene();
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(35, 1);

  let model;
  try {
    model = await loadModel(view);
  } catch (error) {
    console.warn("Не удалось загрузить модель:", error);
    message.textContent = "Не удалось показать модель. Файл можно скачать и открыть в другой программе.";
    renderer.dispose();
    return () => message.remove();
  }
  scene.add(model);
  frameCamera(camera, model);
  message.remove();
  container.prepend(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const box = new THREE.Box3().setFromObject(model);
  controls.target.copy(box.getCenter(new THREE.Vector3()));
  controls.saveState();

  renderer.domElement.addEventListener("dblclick", () => controls.reset());

  const originals = new Map<Object3D, Material | Material[]>();
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      originals.set(object, object.material);
    }
  });
  const plainMaterial = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.7 });
  const wireMaterial = new THREE.MeshBasicMaterial({ color: 0xc3cad6, wireframe: true });

  function setMode(mode: ViewMode): void {
    for (const [object, original] of originals) {
      if (mode === "wireframe") {
        (object as Mesh).material = wireMaterial;
      } else if (mode === "plain") {
        (object as Mesh).material = plainMaterial;
      } else {
        (object as Mesh).material = original;
      }
    }
  }

  const modes: [ViewMode, string][] = [["normal", "Обычный"], ["wireframe", "Каркас"], ["plain", "Без текстур"]];
  const toolbar = h("div", { class: "viewer-tools" });
  const buttons: HTMLElement[] = [];
  for (const [mode, label] of modes) {
    const button = h("button", { type: "button" }, label);
    button.addEventListener("click", () => {
      setMode(mode);
      for (const other of buttons) {
        other.classList.toggle("on", other === button);
      }
    });
    buttons.push(button);
    toolbar.append(button);
  }
  buttons[0].classList.add("on");
  const hint = h("div", { class: "viewer-hint" }, "Вращать — левая кнопка мыши · Приблизить — колёсико · Сбросить вид — двойной щелчок");
  container.append(toolbar, hint);

  function resize(): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    toolbar.remove();
    hint.remove();
  };
}
