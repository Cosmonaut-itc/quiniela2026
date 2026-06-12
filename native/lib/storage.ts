/**
 * Almacenamiento seguro de tokens de identidad en iOS Keychain via SecureStore.
 *
 * Los tokens (admin/join/personal) SON la identidad en este sistema (ADR-0002).
 * Se usa SecureStore en lugar de AsyncStorage para protegerlos en el Keychain.
 *
 * Las claves siguen exactamente la misma semántica que la web (shared/storageKeys),
 * saneadas para que solo contengan caracteres permitidos por SecureStore.
 *
 * ## Contrato de degradación (paridad con src/lib/storage.ts)
 *
 * SecureStore puede fallar cuando el Keychain es inaccesible (app en background
 * estricto) o cuando el descifrado falla tras un restore de backup. En esos
 * casos este módulo degrada igual que el twin web (SecurityError en Safari
 * privado → null / no-op) para que los view ports puedan copiar los mismos
 * patrones de llamada sin guard adicional:
 *
 * - `getToken`          → captura excepción, devuelve `null`
 * - `setToken`          → captura excepción, no-op silencioso
 * - `clearToken`        → captura excepción, no-op silencioso
 * - `listKnownQuinielas`→ captura excepción, devuelve `[]`
 *
 * Consecuencia aceptada: si el Keychain falla, la UI trata al usuario como
 * no-inscrito. El flujo de rescate por link (token en URL) cubre esa pérdida.
 */
import * as SecureStore from "expo-secure-store";
import {
  type TokenKind,
  secureStoreKey,
  KNOWN_QUINIELAS_KEY,
  parseKnownQuinielas,
  addKnownQuiniela,
} from "@shared/storageKeys";

export type { TokenKind };

/** Lee el token de la quiniela almacenado en Keychain; null si no existe o si el Keychain falla. */
export async function getToken(
  quinielaId: string,
  kind: TokenKind,
): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(secureStoreKey(quinielaId, kind));
  } catch {
    return null;
  }
}

/**
 * Guarda el token en Keychain y registra el id en la lista de quinielas
 * conocidas (necesario para recuperar "Mi panel" sin link, ya que SecureStore
 * no permite enumerar claves).
 */
export async function setToken(
  quinielaId: string,
  kind: TokenKind,
  token: string,
): Promise<void> {
  try {
    await SecureStore.setItemAsync(secureStoreKey(quinielaId, kind), token);

    // read-modify-write no atómica, pero aceptable: JS es single-threaded y los
    // únicos escritores concurrentes persisten el MISMO id (me+join al montar una
    // vista), lo que converge. Dos quinielas DISTINTAS nunca escriben en vuelo
    // simultáneo porque unirse es acción secuencial del usuario.
    const raw = await SecureStore.getItemAsync(KNOWN_QUINIELAS_KEY);
    const known = addKnownQuiniela(parseKnownQuinielas(raw), quinielaId);
    await SecureStore.setItemAsync(KNOWN_QUINIELAS_KEY, JSON.stringify(known));
  } catch {
    // Keychain inaccesible — no fatal (ver contrato de degradación en el módulo)
  }
}

/** Elimina el token de Keychain. No altera el registro de quinielas conocidas. */
export async function clearToken(
  quinielaId: string,
  kind: TokenKind,
): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(secureStoreKey(quinielaId, kind));
  } catch {
    // Keychain inaccesible — no fatal (ver contrato de degradación en el módulo)
  }
}

/** Devuelve la lista de ids de quinielas que alguna vez tuvieron un token guardado; [] si el Keychain falla. */
export async function listKnownQuinielas(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(KNOWN_QUINIELAS_KEY);
    return parseKnownQuinielas(raw);
  } catch {
    return [];
  }
}
