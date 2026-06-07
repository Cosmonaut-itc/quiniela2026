# Diseño — Cambiar foto de perfil + ocultar "Unirme" si ya estás inscrito

**Fecha:** 2026-06-06
**Estado:** Aprobado, listo para plan de implementación.
**Idioma:** Español (UI, docs y commits).

## 1. Contexto y problema

Dos mejoras pequeñas e independientes para el participante (usuario):

1. **Cambiar foto de perfil.** Hoy la foto del participante solo se puede fijar **al inscribirse**
   (`joinQuiniela` acepta `photoId`). Si alguien se equivocó, no subió foto, o quiere cambiarla, no
   hay forma de hacerlo después. Se quiere poder **cambiar la foto desde el panel personal** (`/me`).

2. **Ocultar "Unirme" cuando ya estás inscrito.** En la pestaña General
   (`/q/:id/join/:joinToken`) el botón "⚽ Unirme a la quiniela" se muestra siempre que haya cupo y
   la quiniela esté abierta, **incluso a quien ya está inscrito**. Un participante que ya entró no
   debería ver ese CTA; solo debe aparecer para quien aún no tiene lugar.

## 2. Alcance

**Incluye:**

- Cambiar (reemplazar) la **foto** del participante desde su panel personal.
- Borrar del storage la foto anterior al reemplazarla (sin huérfanos).
- Ocultar el bloque de CTA de inscripción en General cuando el dispositivo ya tiene token de `me`
  para esa quiniela.
- Refactor dirigido: extraer los helpers de lectura/escritura segura de `localStorage` a un módulo
  compartido reutilizable y testeable.

**No incluye (decisiones acordadas / trabajo futuro):**

- **Editar el nombre** del participante — solo la foto.
- **Quitar la foto** (volver a iniciales) — solo reemplazar por una nueva.
- Diálogo con preview/recorte de imagen — la foto se sube y aplica directo.
- Validación de tamaño/tipo más allá del `accept="image/*"` ya usado en el resto de la app
  (consistencia; sin límite de peso nuevo).
- Mostrar **algo** en lugar del botón "Unirme" cuando ya estás inscrito — se oculta sin reemplazo.
- Validar el token de `me` contra el backend antes de ocultar — se usa la presencia en
  `localStorage`, igual que el resto de la navegación (ver §3.2).

## 3. Decisiones de arquitectura

### 3.1 Cambiar foto — reusar la subida existente, auth por `personalToken`

Ya existe toda la mecánica de subida: la mutation `quinielas.generateUploadUrl` y el hook
`src/lib/usePhotoUpload.ts` (sube a `_storage` y devuelve `storageId`). La única pieza que falta es
una mutation que **asocie** un `photoId` ya subido al participante.

La autorización sigue el modelo del proyecto: **quien tiene el `personalToken`, manda**. La mutation
busca el participante por `by_personalToken`; no hay sesión ni rol que verificar (igual que
`getPersonalPanel`).

Al reemplazar se **borra la foto anterior** del storage (`ctx.storage.delete`) para no acumular
blobs huérfanos. Se hace solo si había una foto previa y es distinta de la nueva.

**Alternativa descartada:** diálogo con preview + confirmar. Más código y estado para "solo
reemplazar"; el patrón directo (tocar avatar → elegir archivo → subir) es suficiente y más rápido.

### 3.2 Ocultar "Unirme" — presencia del token en el dispositivo

No hay login: la identidad del participante es su `personalToken`, que se guarda en
`localStorage['quiniela:${id}:me']` al unirse (`Join.submit`) y lo usa el `BottomNav` para enlazar a
`/me`. "Ya estás inscrito (en este dispositivo)" ⇔ **ese token existe en `localStorage`**. Esa es la
señal que usamos para ocultar el CTA.

Consecuencia conocida y aceptada: si te inscribiste en **otro** dispositivo/navegador, ahí no habrá
token y verás el botón. Es coherente con el modelo basado en tokens del resto de la app.

**Alternativa descartada:** consultar el backend para confirmar que el token es válido antes de
ocultar. Más robusto ante tokens viejos, pero añade un query y es inconsistente con el `BottomNav`,
que ya navega a `/me` confiando solo en la presencia del token.

### 3.3 Refactor — extraer helpers de `localStorage`

`Shell.tsx` ya tiene `readStoredToken(id, kind)` y `persistToken(id, kind, value)` privados, con el
manejo correcto de `localStorage` ausente o que lanza (Safari privado). `Join.tsx` necesita la misma
lectura segura. Se extraen ambos a **`src/lib/storage.ts`** y se importan desde `Shell.tsx` y
`Join.tsx`. Beneficio: reuso, una sola fuente de verdad para las claves `quiniela:${id}:${kind}`, y
testeabilidad directa del helper.

## 4. Modelo de datos

**Sin cambios.** `participants.photoId: v.optional(v.id("_storage"))` ya existe en el schema. No hay
migración.

## 5. Backend (Convex)

### 5.1 `updateParticipantPhoto` (mutación nueva, `convex/participants.ts`)

```ts
updateParticipantPhoto({ personalToken: v.string(), photoId: v.id("_storage") })
```

- Busca el participante por `by_personalToken`; si no existe, lanza `"Jugador no encontrado"`.
- Guarda `oldPhotoId = me.photoId`.
- `patch(me._id, { photoId })`.
- Si `oldPhotoId` existe y `oldPhotoId !== photoId`, `await ctx.storage.delete(oldPhotoId)`.
- Devuelve `{ ok: true as const }`.

No depende del estado de la quiniela (open/locked/finished): cambiar tu foto es válido siempre.

`getPersonalPanel` ya devuelve `me.photoUrl` (vía `photoUrl(ctx, me.photoId)`), así que tras la
mutación el avatar se actualiza solo por reactividad de Convex. No cambia su firma.

## 6. Tipos (`convex/types.ts`)

**Sin cambios.** No se añaden ni modifican tipos de datos devueltos.

## 7. Frontend

### 7.1 `src/lib/storage.ts` (nuevo)

- `readStoredToken(id: string, kind: "me" | "join"): string | null` — movido tal cual desde
  `Shell.tsx` (guarda con try/catch; `null` si `localStorage` ausente o lanza).
- `persistToken(id: string, kind: "me" | "join", value: string): void` — movido tal cual.
- `Shell.tsx` deja de declararlos localmente y los importa de aquí (comportamiento idéntico).

### 7.2 `src/routes/Personal.tsx` — avatar editable

- Convertir el avatar del header en editable: superponer un pequeño **badge de cámara** 📷 sobre el
  `Avatar` (botón con `aria-label`, p. ej. "Cambiar foto"), y un `<input type="file" accept="image/*">`
  **oculto** disparado por el botón (`ref` + `.click()`).
- Al elegir archivo (`onChange`):
  - estado local `uploading` → overlay/opacidad de carga sobre el avatar y badge deshabilitado;
  - `photoId = await upload(file)` (hook `usePhotoUpload`);
  - `await updateParticipantPhoto({ personalToken: token!, photoId })`;
  - `toast.success("Foto actualizada")`; en error, `toast.error(...)` dentro de try/catch/finally.
- El avatar se refresca solo (Convex reactivo); no se mantiene estado de imagen local.
- Solo aplica en `/me` (siempre es el panel propio, accedido con el `personalToken`), así que el
  control de edición se muestra siempre en esa página.

### 7.3 `src/routes/Join.tsx` — ocultar CTA si ya inscrito

- Calcular `alreadyJoined = !!readStoredToken(id!, "me")` (importado de `src/lib/storage.ts`).
- Envolver el bloque de CTA actual (el ternario `canJoin ? <Dialog…> : <recuadro muted>`) de modo
  que **no se renderice nada** cuando `alreadyJoined` sea `true`. Si `alreadyJoined` es `false`, el
  comportamiento es exactamente el actual.
- No se añade botón ni texto de reemplazo (decisión §2). El resto de la página (tabla de jugadores,
  duelos, link al Mundial, BottomNav) no cambia.

## 8. Manejo de errores

- `updateParticipantPhoto`: si el `personalToken` no corresponde a ningún participante, lanza `Error`
  en español; el front lo captura y muestra `toast.error`. Fallo de subida (`usePhotoUpload`) también
  se captura y muestra toast; el `finally` limpia `uploading`.
- Lectura de `localStorage`: el helper nunca lanza (try/catch → `null`), así que `alreadyJoined`
  degrada a `false` (se muestra el botón) si el storage no está disponible.

## 9. Pruebas

**Backend (TDD), `convex/participants.test.ts`:**

- `updateParticipantPhoto` actualiza `photoId` del participante (verificable vía `getPersonalPanel`
  / lectura directa).
- Con `personalToken` inválido, lanza error.
- Reemplazar una foto existente borra la anterior del storage (la anterior deja de existir).

**Front (unit), `src/lib/storage.test.ts`:**

- `readStoredToken` devuelve el valor guardado y `null` cuando no hay nada / `localStorage` no está
  disponible (reusar el polyfill de los tests existentes).

**E2E (Playwright):**

- General sin token de `me`: el botón "Unirme" aparece. Con token de `me` guardado: no aparece.
- Panel `/me`: cambiar la foto desde el avatar y ver que se actualiza.

## 10. Archivos tocados

- `convex/participants.ts` (+ `convex/participants.test.ts`) — `updateParticipantPhoto`.
- `src/lib/storage.ts` (nuevo) + `src/lib/storage.test.ts` (nuevo) — helpers extraídos.
- `src/components/Shell.tsx` — importar helpers en vez de declararlos.
- `src/routes/Personal.tsx` — avatar editable.
- `src/routes/Join.tsx` — ocultar CTA si ya inscrito.

## 11. Plan de despliegue

Mismo orden del proyecto: **backend antes que frontend** (el front llama a
`updateParticipantPhoto`, que el backend debe aceptar primero). Deploy manual front+back juntos tras
validar (`npm test`, `npm run build`, `npm run lint`, E2E).
