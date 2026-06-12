/**
 * Almacenamiento seguro de tokens de identidad en iOS Keychain via SecureStore.
 *
 * Los tokens (admin/join/personal) SON la identidad en este sistema (ADR-0002).
 * Se usa SecureStore en lugar de AsyncStorage para protegerlos en el Keychain.
 *
 * Las claves siguen exactamente la misma semántica que la web (shared/storageKeys),
 * saneadas para que solo contengan caracteres permitidos por SecureStore.
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

/** Lee el token de la quiniela almacenado en Keychain; null si no existe. */
export async function getToken(
  quinielaId: string,
  kind: TokenKind,
): Promise<string | null> {
  return SecureStore.getItemAsync(secureStoreKey(quinielaId, kind));
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
  await SecureStore.setItemAsync(secureStoreKey(quinielaId, kind), token);

  // Actualiza el registro de quinielas conocidas.
  const raw = await SecureStore.getItemAsync(KNOWN_QUINIELAS_KEY);
  const known = addKnownQuiniela(parseKnownQuinielas(raw), quinielaId);
  await SecureStore.setItemAsync(KNOWN_QUINIELAS_KEY, JSON.stringify(known));
}

/** Elimina el token de Keychain. No altera el registro de quinielas conocidas. */
export async function clearToken(
  quinielaId: string,
  kind: TokenKind,
): Promise<void> {
  await SecureStore.deleteItemAsync(secureStoreKey(quinielaId, kind));
}

/** Devuelve la lista de ids de quinielas que alguna vez tuvieron un token guardado. */
export async function listKnownQuinielas(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(KNOWN_QUINIELAS_KEY);
  return parseKnownQuinielas(raw);
}
