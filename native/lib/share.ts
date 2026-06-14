// Compartir links de invitación/personales por el share sheet nativo de iOS.
// Los links apuntan a la WEB de producción (no a deep links exp://, que solo
// funcionan en dev): así cualquiera puede abrirlos en un navegador e inscribirse.
// La base se puede sobre-escribir con EXPO_PUBLIC_WEB_URL (build/env), con la
// URL de producción como fallback.
import { Share } from "react-native";

const WEB_BASE =
  process.env.EXPO_PUBLIC_WEB_URL ??
  "https://quiniela2026-production-b5aa.up.railway.app";

export function buildJoinUrl(quinielaId: string, joinToken: string): string {
  return `${WEB_BASE}/q/${quinielaId}/join/${joinToken}`;
}

export function buildPersonalUrl(quinielaId: string, personalToken: string): string {
  return `${WEB_BASE}/q/${quinielaId}/me/${personalToken}`;
}

/**
 * Abre el share sheet nativo. iOS usa `url`; `message` lleva el texto. Sin toast:
 * un fallo (o un dismiss) se registra y no revienta el render.
 */
export async function shareLink(url: string, message: string): Promise<void> {
  try {
    await Share.share({ message: `${message} ${url}`, url });
  } catch (e) {
    console.warn("shareLink falló", e);
  }
}
