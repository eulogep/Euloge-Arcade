/** Player names for same-device party games, remembered on this device only. */
const KEY = 'euloge-arcade:party-players';
export const MAX_NAME_LENGTH = 20;

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

/** Valid list: every name non-empty and unique (case-insensitive). */
export function validatePlayers(names: string[], min: number, max: number): string | null {
  const cleaned = names.map(cleanName);
  if (cleaned.length < min) return `Il faut au moins ${min} joueurs.`;
  if (cleaned.length > max) return `${max} joueurs maximum.`;
  if (cleaned.some((n) => n.length === 0)) return 'Chaque joueur a besoin d’un prénom.';
  const seen = new Set<string>();
  for (const n of cleaned) {
    const k = n.toLocaleLowerCase('fr');
    if (seen.has(k)) return `Deux joueurs s’appellent « ${n} » : ajoute une initiale.`;
    seen.add(k);
  }
  return null;
}

export function loadPlayers(fallback: string[]): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (Array.isArray(raw) && raw.every((n) => typeof n === 'string') && raw.length > 0) {
      return raw.map(cleanName).slice(0, 20);
    }
  } catch {
    /* storage unavailable: use the fallback */
  }
  return fallback;
}

export function savePlayers(names: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(names.map(cleanName)));
  } catch {
    /* ignore */
  }
}
