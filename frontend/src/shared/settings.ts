
export interface SiteSettings {
  theme: "light" | "dark" | "system";
  scale: number;
  menu: "left" | "right";
  tiles: "small" | "medium" | "large";
  catalogView: "grid" | "table";
  motion: "on" | "off";
  palette: string;
  customColors: Colors;
}

export interface Colors {
  accent: string;
  menu: string;
  highlight: string;
}

declare global {
  interface Window {
    siteSettings: {
      read: () => SiteSettings;
      save: (settings: SiteSettings) => void;
      defaults: SiteSettings;
      palettes: Record<string, Colors>;
    };
  }
}

export function readSettings(): SiteSettings {
  return window.siteSettings.read();
}

export function changeSetting<K extends keyof SiteSettings>(name: K, value: SiteSettings[K]): void {
  const settings = readSettings();
  settings[name] = value;
  window.siteSettings.save(settings);
}

export function resetSettings(): void {
  window.siteSettings.save({ ...window.siteSettings.defaults });
}

export function getScale(): number {
  return readSettings().scale / 100;
}
