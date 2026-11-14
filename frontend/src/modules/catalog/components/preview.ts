
import { getModelView, savePreview } from "../api";

const WIDTH = 640;
const HEIGHT = 480;

export async function createAndSavePreview(teamId: number, modelId: number): Promise<boolean> {
  try {
    const view = await getModelView(teamId, modelId);
    const THREE = await import("three");
    const { addLights, frameCamera, loadModel } = await import("./load-model");

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(WIDTH, HEIGHT);
    try {
      const scene = new THREE.Scene();
      addLights(scene);

      const model = await loadModel(view);
      scene.add(model);

      const camera = new THREE.PerspectiveCamera(35, WIDTH / HEIGHT);
      frameCamera(camera, model);
      renderer.render(scene, camera);

      const image = await new Promise<Blob | null>((resolve) => renderer.domElement.toBlob(resolve, "image/png"));
      if (image === null) {
        return false;
      }
      await savePreview(teamId, modelId, image);
      return true;
    } finally {
      renderer.dispose();
    }
  } catch (error) {
    console.warn("Не удалось создать превью:", error);
    return false;
  }
}
