"use node";
import { internalAction } from "./_generated/server";

// Spike temporal: confirma que web-push se puede importar y correr en el runtime Node de
// Convex. Import dinámico para NO arrastrar dependencias de Node al cargar el módulo bajo
// edge-runtime en los tests (convex-test importa todos los módulos vía glob).
export const spike = internalAction({
  args: {},
  handler: async (): Promise<{ ok: boolean; hasPublic: boolean }> => {
    const webpush = (await import("web-push")).default;
    const keys = webpush.generateVAPIDKeys();
    return { ok: true, hasPublic: typeof keys.publicKey === "string" };
  },
});
