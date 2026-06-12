/**
 * Claves de almacenamiento compartidas entre web y native.
 *
 * - Web (localStorage): usa la clave canónica tal cual, con separadores `:`.
 * - Native (SecureStore/Keychain): usa la clave saneada; SecureStore solo
 *   acepta caracteres `[A-Za-z0-9._-]`, así que cualquier otro carácter se
 *   reemplaza con `_`.
 *
 * Módulo puro: sin imports de DOM, React ni Expo.
 */

export type TokenKind = "me" | "join";

/** Clave canónica web: `quiniela:${id}:${kind}` (la usa localStorage tal cual). */
export function storageKey(id: string, kind: TokenKind): string {
  return `quiniela:${id}:${kind}`;
}

/** Clave canónica saneada para SecureStore (solo [A-Za-z0-9._-]; lo demás → "_"). */
export function secureStoreKey(id: string, kind: TokenKind): string {
  return storageKey(id, kind).replace(/[^A-Za-z0-9._-]/g, "_");
}

/** Clave fija (ya SecureStore-safe) del registro de quinielas conocidas. */
export const KNOWN_QUINIELAS_KEY = "quiniela.known";

/** Parsea el JSON del registro; tolerante: null/JSON inválido/no-array → []. */
export function parseKnownQuinielas(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/** Devuelve el registro con el id agregado (dedupe; conserva orden, append al final). */
export function addKnownQuiniela(known: string[], id: string): string[] {
  if (known.includes(id)) return known;
  return [...known, id];
}
