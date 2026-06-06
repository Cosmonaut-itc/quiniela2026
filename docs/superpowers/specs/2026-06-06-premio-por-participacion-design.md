# Diseño — Premio por participación (bote dinámico)

**Fecha:** 2026-06-06
**Estado:** Aprobado, listo para plan de implementación.
**Idioma:** Español (UI, docs y commits).
**Spec base:** `docs/superpowers/specs/2026-06-06-quiniela-mundial-design.md` (este documento añade un segundo modo de premio).

## 1. Contexto y problema

Hoy el premio de una quiniela es un único campo de texto libre `prizeText` (máx. 60 car.),
p. ej. `"$5,000"` o `"La gloria eterna"`. Se muestra en el banner dorado como
_"{prizeText} al campeón"_ en Join y Personal, y se devuelve tal cual en las tres queries de
lectura (`getOverview`, `getAdmin`, `getPersonal`).

**Idea nueva:** además del premio fijo, ofrecer un **modo dinámico por participación**: el admin
fija una **cuota por persona** (p. ej. $200) y un **máximo** de participantes (p. ej. 20), sin saber
de antemano cuánta gente entrará. El **bote = cuota × los que realmente entran**. Encaja con la
funcionalidad ya existente de **repartir los equipos sobrantes** entre quienes sí entraron al cerrar
la quiniela: aunque no se llenen todos los lugares, los 48 equipos quedan repartidos.

## 2. Alcance

**Incluye:**
- Segundo modo de premio `per_person` (cuota por persona) junto al `fixed` actual.
- Bote **en vivo** que crece con cada inscrito mientras la quiniela está abierta; se congela al
  cerrar (lock) porque `filledCount` queda fijo.
- Toggle en el formulario de creación (mismo estilo que el toggle de reparto de equipos).
- Cálculo del bote en el backend y un objeto `prize` estructurado en las tres queries de lectura.
- Formateo de moneda `$` estilo es-MX (separador de miles).
- Tests TDD de backend y front; validación con Playwright.

**No incluye (trabajo futuro):**
- Editar la cuota o el modo después de crear la quiniela.
- Monedas distintas a `$` (MXN) ni decimales.
- Nota/etiqueta de texto adicional en modo `per_person` (se mostrará **solo el bote**).
- Cobro real / registro de pagos por persona (sigue siendo confianza fuera de la app).

## 3. Decisión de arquitectura

**Enfoque elegido: campos estructurados + cálculo en el servidor.**

Se añaden dos campos opcionales a `quinielas` (`prizeMode`, `entryFee`). El bote se calcula en las
queries de lectura a partir de `filledCount` y se devuelve un objeto `prize` ya resuelto. El front
solo formatea y elige el texto según modo y estado.

Alternativas descartadas:
- **Codificar todo en `prizeText`** (sin cambio de schema): habría que parsear el string para
  calcular el bote → frágil, mezcla presentación y datos. No.
- **Tabla aparte para el premio**: sobre-ingeniería para dos campos escalares. No.

El patrón sigue al de `assignMode`: campo `v.optional(v.string())` cuyo valor ausente significa el
comportamiento legacy (`fixed`), de modo que las quinielas existentes siguen funcionando sin
migración.

## 4. Modelo de datos

Cambios **aditivos** a la tabla `quinielas`:

```ts
quinielas: defineTable({
  // ...campos existentes...
  prizeText: v.string(),              // se mantiene; en per_person va vacío ("")
  prizeMode: v.optional(v.string()),  // "fixed" | "per_person"; ausente = "fixed" (legacy)
  entryFee: v.optional(v.number()),   // solo per_person; entero ≥ 1 (pesos)
  numParticipants: v.number(),        // en per_person actúa como el MÁXIMO
  // ...
})
```

Reglas:
- `prizeMode` ausente → `fixed` (helper `prizeModeOf`, análogo a `modeOf` para `assignMode`).
- En `fixed`: `prizeText` se usa como hoy; `entryFee` ausente.
- En `per_person`: `entryFee` presente y ≥ 1; `prizeText` se guarda vacío.
- `numParticipants` sigue siendo 2–48; en `per_person` es el máximo de gente.

## 5. Cálculo del bote (backend)

`filledCount = participants.length` (los que realmente entraron). Las tres queries devuelven un
objeto `prize` con esta forma:

```ts
type PrizeView = {
  mode: "fixed" | "per_person";
  text: string;                 // fixed: prizeText. per_person: "".
  entryFee: number | null;      // per_person: la cuota. fixed: null.
  pool: number | null;          // per_person: entryFee * contributors. fixed: null.
  contributors: number;         // filledCount (relevante para per_person).
};
```

- **fixed:** `{ mode: "fixed", text: prizeText, entryFee: null, pool: null, contributors: filledCount }`.
- **per_person:** `{ mode: "per_person", text: "", entryFee, pool: entryFee * filledCount, contributors: filledCount }`.

El bote crece al unirse gente (cambia `filledCount`) y, al cerrar (lock), `filledCount` ya no cambia,
así que el bote queda congelado sin lógica extra.

`prize` reemplaza a `prizeText` en los tres tipos de retorno (`OverviewData`, `AdminData`,
`PersonalData`). El servidor devuelve **números puros**; el formateo a `$` vive en el front.

## 6. Front — formulario de creación (`Home.tsx`)

- Toggle **"Premio fijo" / "Por participación 💰"** con el mismo patrón visual que el toggle de
  reparto de equipos (`on_join` / `on_reveal`): dos botones `aria-pressed`.
- Estado `prizeMode` (`"fixed" | "per_person"`, default `"fixed"`).
- **fixed:** campo de texto actual "Premio" (sin cambios).
- **per_person:** campo numérico "Cuota por persona" con prefijo `$` (entero ≥ 1); la etiqueta del
  número de participantes cambia a **"Máximo de participantes"** y el texto de ayuda se adapta.
- `submit()` envía `prizeMode` y, en `per_person`, `entryFee` (y `prizeText: ""`).
- Validación de envío: en `per_person`, `entryFee ≥ 1`.

## 7. Front — banner de premio (`PrizeBanner`)

`PrizeBanner` pasa de recibir `text: string` a recibir `{ title: string; subline?: string }`. Las
rutas (`Join`, `Personal`) arman estos textos desde el objeto `prize` y el estado de la quiniela:

- **fixed:** `title = "{prize.text} al campeón"`, sin subline (igual que hoy; si `text` vacío, no se
  renderiza, como ahora).
- **per_person, abierta (`status === "open"`):**
  `title = "Bote: {formatMXN(pool)}"`, `subline = "{formatMXN(entryFee)} × {contributors} inscritos"`.
- **per_person, cerrada (`locked`/`finished`):**
  `title = "{formatMXN(pool)} al campeón"`, `subline = "{contributors} × {formatMXN(entryFee)}"`.

Singular/plural: `"1 inscrito"` / `"N inscritos"`.

Helper nuevo en `src/lib/format.ts`:

```ts
export function formatMXN(n: number): string {
  return `$${n.toLocaleString("es-MX")}`;
}
```

## 8. Pruebas

**Backend (convex-test, TDD):**
- `createQuiniela` en `per_person` guarda `prizeMode`, `entryFee` (validado ≥ 1) y `prizeText: ""`.
- `createQuiniela` sin `prizeMode` o en `fixed` se comporta como hoy.
- `getOverview` devuelve `prize.pool = entryFee × filledCount` y **crece** al unirse participantes.
- Quiniela **legacy** (sin `prizeMode`) devuelve `prize.mode === "fixed"` con su `text`.
- `getAdmin` y `getPersonal` también devuelven el objeto `prize` correcto.
- Tras cerrar (lock), el bote queda igual (no cambia `filledCount`).

**Front (vitest + Testing Library):**
- `formatMXN` formatea con separador de miles es-MX.
- Lógica del banner: título/subline correctos por modo (`fixed` / `per_person`) y estado
  (`open` / `locked`), incluyendo singular/plural.

**E2E (Playwright):** crear una quiniela `per_person`, unir 2–3 participantes y verificar que el bote
crece en el banner; cerrar y verificar el texto "al campeón".

## 9. Compatibilidad y migración

Sin migración. Los campos nuevos son opcionales; las filas existentes (sin `prizeMode`) se
interpretan como `fixed` vía `prizeModeOf`. Los tests existentes que pasan `prizeText` siguen
válidos. Se actualizan los tipos y las tres queries de lectura para devolver `prize` en vez de
`prizeText` (cambio coordinado backend + front en el mismo plan).

## 10. Plan de commits (atómicos, TDD)

Orden tentativo (lo afina el plan de implementación):
1. Schema: `prizeMode` + `entryFee` (aditivo) + helper `prizeModeOf`.
2. `createQuiniela`: aceptar/validar `prizeMode` + `entryFee` (test primero).
3. Tipos + queries (`getOverview`, `getAdmin`, `getPersonal`): devolver `prize` (test primero).
4. `formatMXN` + refactor de `PrizeBanner` a `{ title, subline }` (test primero).
5. `Home.tsx`: toggle de modo + campo de cuota.
6. Cableado de banner en `Join`/`Personal` desde `prize`.
7. Validación Playwright + ajustes finales.
