import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { imageSimilarity } from "/image-score.js";

async function loadModel(description) {
  let loading = false;
  let complete = () => {};
  let failure;
  const manager = new THREE.LoadingManager(() => {
    loading = false;
    complete();
  });
  manager.onStart = () => {
    loading = true;
  };
  manager.onError = () => {
    failure = new Error("Не загружена текстура или материал модели");
  };
  let model;
  if (description.format === "GLB") {
    model = (await new GLTFLoader(manager).loadAsync(description.url)).scene;
  } else {
    const libraries = [];
    for (const url of description.materials) {
      const materials = await new MTLLoader(manager).loadAsync(url);
      materials.preload();
      libraries.push(materials);
    }
    const loader = new OBJLoader(manager);
    if (libraries.length)
      loader.setMaterials({
        create: (name) => {
          const library = libraries.find((item) => Object.hasOwn(item.materialsInfo, name));
          if (!library) throw new Error("Материал OBJ не найден");
          return library.create(name);
        },
      });
    model = await loader.loadAsync(description.url);
  }
  if (loading)
    await new Promise((resolve) => {
      complete = resolve;
    });
  if (failure) throw failure;
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (object.isSkinnedMesh) object.skeleton.update();
  });
  return model;
}

window.renderComparison = async (source, result) => {
  const models = [await loadModel(source), await loadModel(result)];
  const width = 384;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, width);
  renderer.setClearColor(0x202020, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(1, 2, 1.5);
  scene.add(light);
  const bounds = new THREE.Box3().setFromObject(models[0]);
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.0001);
  const camera = new THREE.PerspectiveCamera(35, 1);
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05;
  camera.near = distance / 1000;
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = width;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const views = [];
  try {
    for (const [name, direction] of [
      ["front", [0, 0, 1]],
      ["back", [0, 0, -1]],
      ["left", [-1, 0, 0]],
      ["right", [1, 0, 0]],
      ["top", [0, 1, 0]],
      ["bottom", [0, -1, 0]],
    ]) {
      camera.up.set(0, direction[1] ? 0 : 1, direction[1] ? -1 : 0);
      camera.position.copy(center).addScaledVector(new THREE.Vector3(...direction), distance);
      camera.lookAt(center);
      const pictures = [];
      for (const model of models) {
        scene.add(model);
        renderer.render(scene, camera);
        context.clearRect(0, 0, width, width);
        context.drawImage(renderer.domElement, 0, 0);
        pictures.push({
          png: canvas.toDataURL("image/png"),
          pixels: context.getImageData(0, 0, width, width).data,
        });
        scene.remove(model);
      }
      let score = null;
      try {
        score = imageSimilarity(pictures[0].pixels, pictures[1].pixels, width, width);
      } catch {
        if (
          pictures.some((picture) =>
            picture.pixels.some((value, index) => index % 4 === 3 && value > 0),
          )
        )
          throw new Error("Не удалось сравнить ракурс");
      }
      views.push({ name, score, before: pictures[0].png, after: pictures[1].png });
    }
    const scores = views.filter((view) => view.score !== null).map((view) => view.score);
    if (!scores.length) throw new Error("На изображениях нет видимой поверхности модели");
    return {
      views,
      score:
        Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100,
    };
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
};
