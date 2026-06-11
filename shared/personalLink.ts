/**
 * Convierte lo que el usuario pega en la ruta de "Mi panel".
 *
 * En la PWA standalone no hay barra de direcciones, y la vista General (link
 * compartido) no puede saber quién eres. Para que un inscrito recupere su panel
 * pega su link personal completo (`https://.../q/<id>/me/<token>`), solo la ruta,
 * o nada más el token. Devuelve la ruta a navegar, o `null` si no se reconoce.
 */
export function parsePersonalPanelPath(
  input: string,
  fallbackId: string,
): string | null {
  const text = input.trim();
  if (!text) return null;

  // Link completo o ruta: /q/<id>/me/<token> (corta en / ? # o espacio).
  const m = text.match(/\/q\/([^/\s]+)\/me\/([^/\s?#]+)/);
  if (m) return `/q/${m[1]}/me/${m[2]}`;

  // Token suelto (sin barras): usa la quiniela actual.
  if (fallbackId && /^[^/\s?#]+$/.test(text)) {
    return `/q/${fallbackId}/me/${text}`;
  }

  return null;
}
