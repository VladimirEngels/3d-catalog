(function () {
  var KEY = "siteSettings";

  var DEFAULTS = {
    theme: "light",
    scale: 100,
    menu: "right",
    tiles: "medium",
    catalogView: "grid",
    motion: "on",
    palette: "forest",
    customColors: { accent: "#25623a", menu: "#1b231d", highlight: "#b9e25a" },
  };

  var PALETTES = {
    forest:   { accent: "#25623a", menu: "#1b231d", highlight: "#b9e25a" },
    ocean:    { accent: "#1f5f8b", menu: "#17222c", highlight: "#5cc8e8" },
    graphite: { accent: "#3c4650", menu: "#1d2126", highlight: "#e3b341" },
    plum:     { accent: "#6b3a7a", menu: "#221a26", highlight: "#e58fd0" },
    rust:     { accent: "#9a3f1c", menu: "#261a15", highlight: "#f2a65a" },
  };

  function textOn(hex) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#141a16" : "#ffffff";
  }

  function applyColors(settings, dark) {
    var c = settings.palette === "custom" ? settings.customColors : (PALETTES[settings.palette] || PALETTES.forest);
    var main = dark ? c.highlight : c.accent;
    var css = document.documentElement.style;
    css.setProperty("--accent", main);
    css.setProperty("--accent-fill", main);
    css.setProperty("--on-accent", textOn(main));
    css.setProperty("--accent-soft", "color-mix(in srgb, " + main + " 20%, var(--surface))");
    css.setProperty("--accent-hover", "color-mix(in srgb, " + main + " 70%, #ffffff)");
    css.setProperty("--menu-bg", dark ? "color-mix(in srgb, " + c.menu + " 65%, #000000)" : c.menu);
    css.setProperty("--menu-active", c.highlight);
    css.setProperty("--menu-active-text", textOn(c.highlight));
    css.setProperty("--bar-bg", dark ? "color-mix(in srgb, " + c.menu + " 85%, #ffffff)" : c.menu);
  }

  function read() {
    try {
      var saved = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}"));
      saved.customColors = Object.assign({}, DEFAULTS.customColors, saved.customColors);
      return saved;
    } catch (error) {
      return Object.assign({}, DEFAULTS, { customColors: Object.assign({}, DEFAULTS.customColors) });
    }
  }

  function apply(settings) {
    var root = document.documentElement;
    var dark = settings.theme === "dark"
      || (settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    root.setAttribute("data-theme", dark ? "dark" : "light");
    root.setAttribute("data-menu", settings.menu);
    root.setAttribute("data-tiles", settings.tiles);
    root.setAttribute("data-motion", settings.motion);
    root.style.zoom = settings.scale / 100;
    root.style.setProperty("--site-scale", settings.scale / 100);
    applyColors(settings, dark);
  }

  function save(settings) {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch (error) {
    }
    apply(settings);
  }

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    apply(read());
  });

  apply(read());
  window.siteSettings = { read: read, save: save, defaults: DEFAULTS, palettes: PALETTES };
})();
