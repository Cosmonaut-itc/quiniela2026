# Foto de perfil editable + ocultar "Unirme" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un participante cambie su foto de perfil desde su panel `/me`, y ocultar el botón "Unirme" en la pestaña General cuando el dispositivo ya tiene un token de participante para esa quiniela.

**Architecture:** Backend Convex con una mutation nueva (`updateParticipantPhoto`) que reusa la subida a `_storage` ya existente y borra la foto anterior. Frontend React (Vite + React Router): un módulo compartido `src/lib/storage.ts` para la lectura segura de `localStorage`, un avatar editable en `Personal.tsx`, y una condición de visibilidad en `Join.tsx`.

**Tech Stack:** Convex (queries/mutations, `_storage`), React + TypeScript, Vite, React Router, Tailwind, sonner (toasts), Vitest + convex-test, Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-06-06-foto-perfil-editable-y-ocultar-unirse-design.md`

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `convex/participants.ts` | Modificar | Añadir mutation `updateParticipantPhoto`. |
| `convex/participants.test.ts` | Modificar | Tests de la mutation (actualiza foto, borra anterior, rechaza token inválido). |
| `src/lib/storage.ts` | Crear | Helpers `readStoredToken` / `persistToken` (lectura/escritura segura de localStorage). |
| `src/lib/storage.test.ts` | Crear | Tests de los helpers. |
| `src/components/Shell.tsx` | Modificar | Importar los helpers en vez de declararlos localmente. |
| `src/routes/Join.tsx` | Modificar | Ocultar el bloque de CTA si ya estás inscrito en este dispositivo. |
| `src/routes/Personal.tsx` | Modificar | Avatar editable (badge de cámara + input file oculto + subida). |

**Orden:** backend → refactor de helpers → frontend (Join, Personal) → verificación + E2E. El backend va primero porque el frontend llama a `updateParticipantPhoto`.

---

## Task 1: Backend — mutation `updateParticipantPhoto`

**Files:**
- Modify: `convex/participants.ts` (añadir después de `setParticipantPaid`, ~línea 69)
- Test: `convex/participants.test.ts` (añadir un nuevo `describe` al final)

- [ ] **Step 1: Escribir los tests que fallan**

Añade al final de `convex/participants.test.ts`:

```ts
describe("updateParticipantPhoto", () => {
  it("updates the participant's photo and deletes the previous one", async () => {
    const { t, q } = await setup(4);
    const oldPhotoId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["old"], { type: "image/png" })));
    const a = await t.mutation(api.participants.joinQuiniela, {
      joinToken: q.joinToken, name: "Ana", photoId: oldPhotoId,
    });
    const newPhotoId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["new"], { type: "image/png" })));

    await t.mutation(api.participants.updateParticipantPhoto, {
      personalToken: a.personalToken, photoId: newPhotoId,
    });

    const p = await t.run((ctx) =>
      ctx.db.query("participants")
        .withIndex("by_personalToken", (x) => x.eq("personalToken", a.personalToken))
        .first());
    expect(p?.photoId).toBe(newPhotoId);
    const oldUrl = await t.run((ctx) => ctx.storage.getUrl(oldPhotoId));
    expect(oldUrl).toBeNull(); // la anterior se borró del storage
  });

  it("rejects an invalid personalToken", async () => {
    const { t } = await setup(4);
    const photoId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["x"], { type: "image/png" })));
    await expect(
      t.mutation(api.participants.updateParticipantPhoto, {
        personalToken: "nope", photoId,
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run convex/participants.test.ts -t "updateParticipantPhoto"`
Expected: FAIL — `api.participants.updateParticipantPhoto` no existe (TypeError / propiedad indefinida).

- [ ] **Step 3: Implementar la mutation**

En `convex/participants.ts`, justo después del bloque `setParticipantPaid` (que termina en `});` alrededor de la línea 69), añade:

```ts
export const updateParticipantPhoto = mutation({
  args: { personalToken: v.string(), photoId: v.id("_storage") },
  handler: async (ctx, args) => {
    const me = await ctx.db
      .query("participants")
      .withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken))
      .first();
    if (!me) throw new Error("Jugador no encontrado");
    const oldPhotoId = me.photoId;
    await ctx.db.patch(me._id, { photoId: args.photoId });
    // Borra la foto anterior del storage para no dejar blobs huérfanos.
    if (oldPhotoId && oldPhotoId !== args.photoId) {
      await ctx.storage.delete(oldPhotoId);
    }
    return { ok: true as const };
  },
});
```

(No requiere imports nuevos: `mutation` y `v` ya están importados al inicio del archivo.)

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run convex/participants.test.ts -t "updateParticipantPhoto"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/participants.ts convex/participants.test.ts
git commit -m "feat: mutation updateParticipantPhoto (cambia foto y borra la anterior)"
```

---

## Task 2: Extraer helpers de localStorage a `src/lib/storage.ts`

**Files:**
- Create: `src/lib/storage.ts`
- Create: `src/lib/storage.test.ts`
- Modify: `src/components/Shell.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `src/lib/storage.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readStoredToken, persistToken } from "./storage";

describe("storage helpers", () => {
  beforeEach(() => localStorage.clear());

  it("persiste y lee un token", () => {
    persistToken("Q1", "me", "tok123");
    expect(readStoredToken("Q1", "me")).toBe("tok123");
  });

  it("devuelve null cuando no hay nada guardado", () => {
    expect(readStoredToken("Q1", "me")).toBeNull();
  });

  it("separa por id y por kind", () => {
    persistToken("Q1", "me", "a");
    persistToken("Q1", "join", "b");
    persistToken("Q2", "me", "c");
    expect(readStoredToken("Q1", "me")).toBe("a");
    expect(readStoredToken("Q1", "join")).toBe("b");
    expect(readStoredToken("Q2", "me")).toBe("c");
  });

  it("devuelve null si localStorage lanza (modo privado) y no propaga el error", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() { throw new Error("Storage unavailable"); },
    });
    try {
      expect(() => readStoredToken("Q1", "me")).not.toThrow();
      expect(readStoredToken("Q1", "me")).toBeNull();
      expect(() => persistToken("Q1", "me", "x")).not.toThrow();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
    }
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: FAIL — `./storage` no existe (no se puede resolver el módulo).

- [ ] **Step 3: Crear `src/lib/storage.ts`**

```ts
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
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactorizar `src/components/Shell.tsx` para usar el módulo**

En `src/components/Shell.tsx`:

1. Añade el import junto a los demás del inicio (después de `import { cn } from "@/lib/utils";`):

```ts
import { readStoredToken, persistToken } from "@/lib/storage";
```

2. **Borra** las dos definiciones locales y sus comentarios de doc (el bloque que va desde `/**\n * Reads a persisted nav token...` hasta el cierre `}` de `persistToken`, actualmente entre la línea `type NavKey = ...;` y el comentario `/**\n * Sticky bottom navigation...`). Deja intactas la línea `type NavKey = "me" | "general" | "mundial";` y la función `BottomNav` que sigue usando `readStoredToken` / `persistToken` (ahora importados).

El resultado: `Shell.tsx` ya no declara esas funciones; `BottomNav` las usa desde `@/lib/storage` sin cambios de comportamiento.

- [ ] **Step 6: Verificar que toda la suite sigue verde y compila**

Run: `npm test`
Expected: PASS (todos los archivos; los nuevos de `storage` incluidos).

Run: `npm run build`
Expected: build sin errores de TypeScript (confirma que Shell.tsx resuelve los imports y no quedaron símbolos sin usar).

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts src/components/Shell.tsx
git commit -m "refactor: extraer helpers de localStorage a src/lib/storage (reuso + tests)"
```

---

## Task 3: Ocultar "Unirme" en `Join.tsx` cuando ya estás inscrito

**Files:**
- Modify: `src/routes/Join.tsx`

- [ ] **Step 1: Importar el helper**

En `src/routes/Join.tsx`, añade el import junto a los demás (después de `import { usePhotoUpload } from "@/lib/usePhotoUpload";`):

```ts
import { readStoredToken } from "@/lib/storage";
```

- [ ] **Step 2: Calcular `alreadyJoined`**

Justo después de la línea `const canJoin = quiniela.status === "open" && data.freeSlots > 0;`, añade:

```ts
  // "Ya inscrito en este dispositivo" = existe el token de participante en localStorage.
  const alreadyJoined = !!id && !!readStoredToken(id, "me");
```

- [ ] **Step 3: Envolver el bloque de CTA**

Reemplaza el bloque completo de "Join CTA" (desde el comentario `{/* Join CTA */}` hasta su `)}` de cierre) por esta versión, que no renderiza nada cuando `alreadyJoined`:

```tsx
      {/* Join CTA — oculto si ya estás inscrito en este dispositivo */}
      {!alreadyJoined &&
        (canJoin ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button
                  size="lg"
                  className="glow-primary mt-6 h-12 w-full rounded-2xl text-base font-bold"
                />
              }
            >
              ⚽ Unirme a la quiniela
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Unirte a {quiniela.name}</DialogTitle>
                <DialogDescription>
                  Te tocarán equipos al azar. Quedan {data.freeSlots}{" "}
                  {data.freeSlots === 1 ? "lugar" : "lugares"}.
                </DialogDescription>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="join-name">Tu nombre</Label>
                  <Input
                    id="join-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. María"
                    maxLength={40}
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="join-photo">Foto (opcional)</Label>
                  <Input
                    id="join-photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="h-11 rounded-xl font-bold"
                  disabled={busy || uploading || !name.trim()}
                >
                  {busy || uploading ? "Entrando…" : "Confirmar inscripción"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        ) : (
          <div className="mt-6 rounded-2xl border border-border bg-card px-4 py-3.5 text-center text-sm text-muted-foreground">
            {quiniela.status === "open"
              ? "No quedan lugares disponibles."
              : "Las inscripciones ya están cerradas."}
          </div>
        ))}
```

- [ ] **Step 4: Verificar compilación y suite**

Run: `npm run build`
Expected: build sin errores (confirma que `alreadyJoined` y el import resuelven y el JSX es válido).

Run: `npm test`
Expected: PASS (sin regresiones).

- [ ] **Step 5: Commit**

```bash
git add src/routes/Join.tsx
git commit -m "feat: ocultar CTA de Unirme en General cuando ya estás inscrito"
```

---

## Task 4: Avatar editable en `Personal.tsx`

**Files:**
- Modify: `src/routes/Personal.tsx`

- [ ] **Step 1: Actualizar imports**

En `src/routes/Personal.tsx`:

1. Cambia `import { useQuery } from "convex/react";` por:

```ts
import { useQuery, useMutation } from "convex/react";
```

2. Añade estos imports junto a los demás del inicio:

```ts
import { useRef, useState } from "react";
import { toast } from "sonner";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
```

- [ ] **Step 2: Añadir hooks y el handler de cambio de foto**

Dentro de `export default function Personal()`, justo después de:

```ts
  const data = useQuery(api.participants.getPersonalPanel, {
    personalToken: token!,
  });
```

y **antes** de `if (data === undefined) return <LoadingState />;`, añade:

```ts
  const { upload } = usePhotoUpload();
  const updatePhoto = useMutation(api.participants.updateParticipantPhoto);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  async function changePhoto(file: File) {
    setSaving(true);
    try {
      const photoId = await upload(file);
      await updatePhoto({ personalToken: token!, photoId });
      toast.success("Foto actualizada");
    } catch {
      toast.error("No se pudo actualizar la foto");
    } finally {
      setSaving(false);
    }
  }
```

(Los hooks van antes del early-return para no romper el orden de hooks de React.)

- [ ] **Step 3: Hacer el avatar editable**

Reemplaza el bloque actual del avatar del header:

```tsx
            <div
              className={
                me.status === "champion" ? "gold-ring rounded-full" : undefined
              }
            >
              <Avatar name={me.name} url={me.photoUrl} size={48} />
            </div>
```

por:

```tsx
            <div className="relative shrink-0">
              <div
                className={
                  me.status === "champion" ? "gold-ring rounded-full" : undefined
                }
              >
                <Avatar name={me.name} url={me.photoUrl} size={48} />
              </div>
              {saving && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                  <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={saving}
                aria-label="Cambiar foto"
                className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background transition-opacity disabled:opacity-60"
              >
                <span className="text-[0.7rem] leading-none">📷</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void changePhoto(f);
                  e.target.value = ""; // permite re-elegir el mismo archivo
                }}
              />
            </div>
```

- [ ] **Step 4: Verificar compilación y suite**

Run: `npm run build`
Expected: build sin errores (confirma tipos, imports y que `saving`/`fileRef`/`changePhoto` se usan).

Run: `npm test`
Expected: PASS (sin regresiones).

Run: `npm run lint`
Expected: sin errores (sin variables sin usar; recuerda que NO debe haber setState dentro de un useEffect — aquí el setState va en un handler, lo cual es correcto).

- [ ] **Step 5: Commit**

```bash
git add src/routes/Personal.tsx
git commit -m "feat: permitir cambiar la foto de perfil desde el panel personal"
```

---

## Task 5: Verificación completa + E2E (Playwright)

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suite, build y lint completos**

Run: `npm test`
Expected: PASS — incluye `convex/participants.test.ts` (con `updateParticipantPhoto`) y `src/lib/storage.test.ts`.

Run: `npm run build`
Expected: build limpio.

Run: `npm run lint`
Expected: 0 errores.

- [ ] **Step 2: Levantar la app en local**

Run (en background): `npm run dev`
Anota la URL local (Vite suele exponer `http://localhost:5173`).

- [ ] **Step 3: E2E — el botón "Unirme" aparece sin token**

Con Playwright (MCP `browser_*`):
1. Abrir la Home local y crear una quiniela (nombre cualquiera, ≥2 participantes). Esto navega a `/q/:id/admin/:token`.
2. Desde admin, obtener el enlace de la pestaña General (`/q/:id/join/:joinToken`).
3. Abrir ese enlace en un contexto **sin** `localStorage` previo (ventana/pestaña nueva).
Expected: se ve el botón "⚽ Unirme a la quiniela".

- [ ] **Step 4: E2E — unirse y cambiar la foto**

1. Pulsar "Unirme", escribir un nombre y confirmar. Redirige a `/q/:id/me/:personalToken`.
2. En el panel, pulsar el badge de cámara 📷 del avatar y subir una imagen.
Expected: aparece el toast "Foto actualizada" y el avatar muestra la nueva imagen.

- [ ] **Step 5: E2E — el botón "Unirme" ya no aparece**

1. Desde el panel personal, navegar a la pestaña General con el BottomNav (📋).
Expected: **no** aparece el botón "Unirme" (ya hay token de `me` en este dispositivo). El resto de la página (tabla de jugadores, etc.) sí se ve.

- [ ] **Step 6: Cerrar el dev server**

Detener el proceso de `npm run dev`.

---

## Notas de despliegue

Tras validar todo, el despliegue es manual front+back juntos (convención del proyecto). El backend (mutation nueva) debe estar desplegado antes de que el frontend la invoque en producción.
