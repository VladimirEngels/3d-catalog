const M = {
  256: { rough: 0.6 },
  272: { rough: 0.35 },
  288: { rough: 1.0, emissive: 1 },
  512: { rough: 0.85 },
  528: { rough: 0.85 },
  784: { rough: 0.45 },
  788: { rough: 0.95 },
  800: { rough: 0.8 },
  804: { rough: 0.9, emissive: 0.35 },
  816: { rough: 0.95 },
  820: { rough: 0.9 },
  832: { rough: 0.75 },
  836: { rough: 0.95 },
  848: { rough: 0.95 },
  864: { rough: 0.9 },
  880: { rough: 0.9 },
  896: { rough: 0.9 },
  912: { rough: 0.9 },
  1040: { rough: 0.75, metal: 1 },
  1056: { rough: 0.45, metal: 1 },
  1072: { rough: 0.2, metal: 1 },
  1088: { rough: 0.35, metal: 1 },
  1280: { rough: 1.0 },
  1284: { rough: 1.0 },
  1296: { rough: 1.0 },
  1312: { rough: 1.0 },
  1328: { rough: 0.85 },
  1344: { rough: 0.95 },
  1360: { rough: 0.95 },
  1376: { rough: 0.95 },
  1392: { rough: 0.9 },
  1536: { rough: 0.15 },
  1552: { rough: 0.25 },
  1568: { rough: 0.05 },
  1584: { rough: 0.3, emissive: 0.6 },
  2048: { rough: 0.1 },
  2304: { rough: 0.95 },
  2305: { rough: 1.0 },
  2306: { rough: 0.35 },
  2307: { rough: 0.8 },
  2308: { rough: 0.85 },
  2309: { rough: 0.7 },
  2310: { rough: 0.9 },
  2311: { rough: 0.95 },
};

const DEFAULT = { rough: 0.8, metal: 0, emissive: 0 };

function pbrFor(materialCode) {
  const m = M[materialCode];
  if (!m) return DEFAULT;
  return { rough: m.rough ?? DEFAULT.rough, metal: m.metal ?? 0, emissive: m.emissive ?? 0 };
}

function isEmissive(materialCode) {
  return pbrFor(materialCode).emissive > 0;
}

export { pbrFor, isEmissive };
