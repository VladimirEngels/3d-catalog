import { getModels } from "../api";
import { createTile } from "../components/tile";

const tilesBox = document.querySelector<HTMLElement>(".tiles");

async function showCatalog(): Promise<void> {
  if (tilesBox === null) {
    return;                                   
  }
  const models = await getModels();           
  const tiles = models.map(createTile);       
  tilesBox.replaceChildren(...tiles);         
}

showCatalog();
