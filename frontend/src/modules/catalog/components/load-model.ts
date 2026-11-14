
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import type { ModelView } from "../api";

function createDefaultMaterial(geometry: THREE.BufferGeometry): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: geometry.hasAttribute("color") ? 0xffffff : 0xb8c0cc,
    vertexColors: geometry.hasAttribute("color"),
    roughness: 0.7,
    metalness: 0.05,
  });
}

function hasUsableNormals(geometry: THREE.BufferGeometry): boolean {
  const normals = geometry.getAttribute("normal");
  if (!normals) {
    return false;
  }
  for (let i = 0; i < normals.count; i++) {
    if (normals.getX(i) !== 0 || normals.getY(i) !== 0 || normals.getZ(i) !== 0) {
      return true;
    }
  }
  return false;
}

function meshFromGeometry(geometry: THREE.BufferGeometry): THREE.Mesh {
  if (!hasUsableNormals(geometry)) {
    geometry.computeVertexNormals();
  }
  return new THREE.Mesh(geometry, createDefaultMaterial(geometry));
}

function createManager(view: ModelView): THREE.LoadingManager {
  const manager = new THREE.LoadingManager();
  const lastPart = (name: string) => decodeURIComponent(name).replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";

  const urlByName = new Map<string, string>();
  for (const asset of view.assets) {
    urlByName.set(lastPart(asset.name), asset.url);
  }

  manager.setURLModifier((url) => {
    if (url.startsWith("data:") || url.startsWith("blob:")) {
      return url;
    }
    return urlByName.get(lastPart(url)) ?? url;
  });
  return manager;
}

const MAX_TEXTURE_WAIT_MS = 15000;

function waitForAllFiles(manager: THREE.LoadingManager, isFinished: () => boolean): Promise<void> {
  if (isFinished()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    manager.onLoad = () => resolve();
    setTimeout(resolve, MAX_TEXTURE_WAIT_MS);
  });
}

async function loadObjMaterials(view: ModelView, manager: THREE.LoadingManager): Promise<OBJLoader> {
  const loader = new OBJLoader(manager);
  const materialFile = view.assets.find((asset) => asset.name.toLowerCase().endsWith(".mtl"));
  if (materialFile) {
    const materials = await new MTLLoader(manager).loadAsync(materialFile.url);
    materials.preload();
    loader.setMaterials(materials);
  }
  return loader;
}

export async function loadModel(view: ModelView): Promise<THREE.Object3D> {
  const manager = createManager(view);

  switch (view.format) {
    case "STL":
      return meshFromGeometry(await new STLLoader(manager).loadAsync(view.mainUrl));
    case "PLY": {
      const geometry = await new PLYLoader(manager).loadAsync(view.mainUrl);
      if (geometry.index === null && geometry.getAttribute("position").count % 3 !== 0) {
        return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xb8c0cc, size: 0.01 }));
      }
      return meshFromGeometry(geometry);
    }
    case "OBJ": {
      let loaded = 0;
      let total = 0;
      manager.onProgress = (_url, itemsLoaded, itemsTotal) => {
        loaded = itemsLoaded;
        total = itemsTotal;
      };
      const loader = await loadObjMaterials(view, manager);
      const model = await loader.loadAsync(view.mainUrl);
      await waitForAllFiles(manager, () => loaded >= total);
      return model;
    }
    case "GLTF":
    case "GLB":
      return (await new GLTFLoader(manager).loadAsync(view.mainUrl)).scene;
  }
}

export function frameCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.0001);

  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  const direction = new THREE.Vector3(0.7, 0.45, 1).normalize();

  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = distance / 100;
  camera.far = distance * 10;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

export function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(1, 2, 1.5);
  scene.add(light);
}
