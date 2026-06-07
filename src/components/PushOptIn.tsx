import { toast } from "sonner";
import { usePushSubscription } from "@/lib/usePushSubscription";

/** Botón de opt-in de Web Push. Se monta con exactamente un token: personalToken en el
 *  panel personal, adminToken en el admin. En iPhone, si la app no está en modo standalone,
 *  explica el paso de "Agregar a pantalla de inicio" antes de poder activar. */
export function PushOptIn({ personalToken, adminToken }: { personalToken?: string; adminToken?: string }) {
  const { supported, standalone, enabled, busy, enable, disable } = usePushSubscription({ personalToken, adminToken });
  if (!supported) return null;

  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !standalone) {
    return (
      <p className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-[0.78rem] text-muted-foreground">
        📲 Para recibir avisos con la app cerrada, agrégala a tu pantalla de inicio:
        toca <span className="font-semibold">Compartir</span> → <span className="font-semibold">Agregar a inicio</span>.
      </p>
    );
  }

  async function toggle() {
    try {
      await (enabled ? disable() : enable());
    } catch (err) {
      console.error("Error al cambiar la suscripción de avisos:", err);
      toast.error("No se pudo cambiar la suscripción de avisos");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className="mt-3 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-50"
    >
      {busy ? "…" : enabled ? "🔔 Avisos activados (tocar para desactivar)" : "🔔 Avisarme aunque cierre la app"}
    </button>
  );
}
