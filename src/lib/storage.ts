/**
 * Acceso seguro a los tokens de navegación por quiniela guardados en
 * localStorage. Algunos navegadores (p. ej. Safari en modo privado) lanzan un
 * SecurityError al acceder a localStorage aun cuando el objeto existe, así que
 * toda lectura/escritura va protegida y degrada a null / no-op.
 * Claves: `quiniela:${id}:${kind}`.
 */
export function readStoredToken(id: string, kind: "me" | "join"): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(`quiniela:${id}:${kind}`);
  } catch {
    return null;
  }
}

/** Persiste un token de navegación para que rutas sin token (Mundial) lo alcancen. */
export function persistToken(id: string, kind: "me" | "join", value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(`quiniela:${id}:${kind}`, value);
  } catch {
    // modo privado / storage deshabilitado — no fatal
  }
}
