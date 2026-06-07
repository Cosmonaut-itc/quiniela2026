import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { syncManifestLink } from "@/lib/pwaManifest";

/**
 * Ancla el `start_url` del manifest a la ruta actual para que, al instalar la
 * PWA desde un panel, iOS la abra ahí y no en la página de crear quiniela.
 * Se ejecuta en cada navegación (la página visible al "Añadir a inicio" manda).
 */
export function ManifestSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    syncManifestLink(document, window.location.origin, pathname);
  }, [pathname]);
  return null;
}
