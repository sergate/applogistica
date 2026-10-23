const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// Colores oficiales de clase (nombres en español e inglés, sin acentos).
const CLASS_COLORS: Record<string, string> = {
  guerrero: "#C69B6D",
  warrior: "#C69B6D",
  paladin: "#F48CBA",
  mago: "#3FC7EB",
  mage: "#3FC7EB",
  cazador: "#ABD473",
  hunter: "#ABD473",
  brujo: "#8788EE",
  warlock: "#8788EE",
  picaro: "#FFF468",
  rogue: "#FFF468",
  sacerdote: "#FFFFFF",
  priest: "#FFFFFF",
  chaman: "#0070DE",
  shaman: "#0070DE",
  "caballero de la muerte": "#C41F3B",
  "death knight": "#C41F3B",
  druida: "#FF7C0A",
  druid: "#FF7C0A",
  monje: "#00FF96",
  monk: "#00FF96",
  evocador: "#33937F",
  evoker: "#33937F",
  "cazador de demonios": "#A330C9",
  "demon hunter": "#A330C9",
};

export const FALLBACK_CLASS_COLOR = "#8A8A93";

export function classColor(className: string): string {
  return CLASS_COLORS[normalize(className)] ?? FALLBACK_CLASS_COLOR;
}

export type RoleKind = "tank" | "healer" | "dps" | "unknown";

export function roleKind(role: string): RoleKind {
  const r = normalize(role);
  if (/^(tank|tanque)/.test(r)) return "tank";
  if (/^(heal|sanador|curandero)/.test(r)) return "healer";
  if (/^(dps|damage|dano)/.test(r)) return "dps";
  return "unknown";
}
