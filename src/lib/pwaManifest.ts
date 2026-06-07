/**
 * Manifest dinámico de la PWA.
 *
 * Al instalar, iOS abre la PWA en el `start_url` del manifest. Un `start_url`
 * estático "/" hacía que la app SIEMPRE abriera en la página de crear quiniela,
 * sin importar desde qué panel/cuenta se instalara. Y como en iOS el storage de
 * la PWA NO se comparte con Safari, tampoco podemos recuperar la identidad con
 * un redirect en "/": la única vía fiable es anclar `start_url` a la página
 * desde la que el usuario instala.
 *
 * Por eso regeneramos el manifest en cada ruta (vía blob) con `start_url` =
 * página actual. `id` y `scope` se mantienen estables y absolutos para no romper
 * la identidad de la PWA al cambiar el href del <link>. Doble robustez en iOS:
 * si lee el blob usa el start_url correcto; si lo ignora, cae a los meta tags
 * `apple-mobile-web-app-capable` y abre la URL actual — que es la misma página.
 */

const BASE = {
  name: "Quiniela Mundial 2026",
  short_name: "Quiniela",
  display: "standalone",
  background_color: "#0a0a0a",
  theme_color: "#0a0a0a",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable",
    },
  ],
} as const;

/** Manifest con `start_url` anclado a `path`; `id`/`scope` estables en la raíz. */
export function buildManifest(origin: string, path: string) {
  return {
    ...BASE,
    id: `${origin}/`,
    scope: `${origin}/`,
    start_url: `${origin}${path}`,
  };
}

/**
 * Apunta el <link rel="manifest"> a un blob cuyo `start_url` es `path`.
 * Idempotente y seguro de llamar en cada navegación: revoca el blob previo
 * (pero nunca el href estático inicial, que no es un `blob:`).
 */
export function syncManifestLink(
  doc: Document,
  origin: string,
  path: string,
): void {
  const link = doc.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) return;

  const prev = link.getAttribute("href");
  const blob = new Blob([JSON.stringify(buildManifest(origin, path))], {
    type: "application/manifest+json",
  });
  link.setAttribute("href", URL.createObjectURL(blob));

  if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
}
