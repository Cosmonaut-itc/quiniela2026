# 🏆 Quiniela Mundial 2026

App web **sin cuentas** para organizar una quiniela del Mundial 2026 entre familia y amigos.
Alguien crea una quiniela, comparte un link, y quienes entran reciben **equipos al azar**.
Cuando dos de tus equipos se enfrentan en un partido real del Mundial, sus dueños "juegan"
entre sí. Un equipo queda eliminado cuando sale del torneo; quedas descalificado cuando
**todos** tus equipos están fuera. **El dueño del equipo campeón se lleva el premio completo**
(*winner‑take‑all*).

- **App en vivo:** https://quiniela2026-production-b5aa.up.railway.app
- Mobile‑first, en español. Resultados **automáticos** vía API de fútbol + corrección manual del admin.

---

## ⚙️ Cómo funciona

Hay **dos capas de datos** en Convex:

- **Capa global (compartida):** equipos, partidos, quién sigue vivo, quién es campeón. Se
  sincroniza una sola vez desde la API y sirve a todas las quinielas.
- **Capa por quiniela:** solo la "dueñería" (qué equipos le tocan a cada quien).

Toda la derivación (próximo rival, eliminados, standings, duelos, campeón) ocurre en **queries
reactivas de Convex** que devuelven datos listos para renderizar, así que React queda delgado y
todos los dispositivos se actualizan solos.

### Enlaces (sin cuentas, basados en tokens)

| Enlace | Ruta | Quién |
|---|---|---|
| **Admin** | `/q/:id/admin/:adminToken` | solo el creador (compartir, cerrar, corregir marcadores) |
| **Invitar / Ver** | `/q/:id/join/:joinToken` | se comparte; muestra la quiniela y permite unirse |
| **Personal** | `/q/:id/me/:personalToken` | panel privado de cada jugador |
| **Mundial** | `/q/:id/mundial` | grupos + bracket con el dueño de cada equipo (público) |

El `personalToken` se guarda en `localStorage` para regreso automático. Si alguien pierde su
link, el admin se lo reenvía desde su panel.

### Flujo

1. **Crear** → nombre, premio (texto libre), número de participantes (2–48), foto opcional.
2. **Unirse** → nombre + foto → reparto **aleatorio instantáneo** de equipos sin dueño.
3. **Cerrar y repartir** → el admin (o el auto‑cierre al primer partido) reparte los equipos de
   los lugares vacíos al participante con menos equipos → los 48 siempre tienen dueño.
4. **Sincronizar** → un cron consulta la API cada 5 min, actualiza marcadores, calcula
   eliminaciones y campeón. El admin puede corregir un marcador a mano (gana sobre la API).

---

## 🧱 Stack

- **Frontend:** React 19 · Vite 8 · TypeScript 6 · Tailwind CSS 4 · shadcn/ui · react‑router‑dom 7
- **Backend:** Convex (Cloud) — base de datos, funciones, *scheduled action* de sincronización, almacenamiento de fotos
- **Pruebas:** Vitest · convex‑test · @testing‑library/react
- **Despliegue:** frontend en **Railway** (estático con `serve`), backend en **Convex Cloud**
- **API de fútbol:** [football‑data.org](https://www.football-data.org) (competencia `WC`, temporada 2026)

---

## 📁 Estructura

```
convex/                     # Backend (Convex)
  schema.ts                 # teams, matches, quinielas, participants, ownerships + índices
  types.ts                  # formas de retorno compartidas (también las usa el frontend)
  quinielas.ts              # createQuiniela, getOverview, getAdmin, closeAndRedistribute, autoCloseDue, generateUploadUrl
  participants.ts           # joinQuiniela, getPersonalPanel
  mundial.ts                # getMundial (grupos + bracket)
  matches.ts                # setMatchResultManual (admin) + upsert/recompute (internas)
  seed.ts                   # seedFromSnapshot (interna)
  sync.ts                   # syncMatches (internalAction, consulta la API)
  crons.ts                  # cron de sincronización cada 5 min
  lib/                      # módulos puros: distribution, tournament, footballData, view, tokens
  data/wc2026-snapshot.json # 48 equipos + 104 partidos (semilla offline + fixture de pruebas)
src/                        # Frontend (React)
  routes/                   # Home, Join, Personal, Mundial, Admin
  components/               # PlayerRow, TeamCard, DuelRow, GroupsView, BracketView, Shell, ...
  components/ui/            # componentes generados por shadcn/ui
  lib/                      # convex (cliente), usePhotoUpload, format
docs/superpowers/           # diseño + plan de implementación
railway.json                # config de build/deploy en Railway
.nvmrc                      # Node 22 (Vite 8 requiere >= 20.19)
```

---

## 🔑 Variables de entorno

| Variable | Dónde vive | Para qué |
|---|---|---|
| `VITE_CONVEX_URL` | Frontend — se inyecta **en build**. En local va en `.env.local`; en Railway es una variable del servicio. | URL del deployment de Convex al que se conecta el cliente. |
| `FOOTBALL_DATA_TOKEN` | **Convex** (variable de entorno del servidor — `npx convex env set`). **Nunca** se commitea. | Token de football‑data.org para la sincronización de resultados. |
| `CONVEX_DEPLOYMENT`, `CONVEX_URL`, `CONVEX_SITE_URL` | `.env.local` (los gestiona `npx convex dev`). | Identidad del deployment de Convex en desarrollo. |

> 🔒 El token de la API vive **solo** como variable de entorno en Convex (lado servidor). El
> navegador nunca habla con la API directamente, y el token no está en el repositorio.
> Consigue uno gratis en https://www.football-data.org/client/register

`.env.local`, `.env` y `.env.*.local` están en `.gitignore`.

---

## 🚀 Desarrollo local

**Requisitos:** Node ≥ 20.19 (recomendado 22, ver `.nvmrc`), una cuenta de Convex y un token de
football‑data.org.

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar/enlazar Convex (crea .env.local con VITE_CONVEX_URL y deja corriendo el dev server)
npx convex dev            # primera vez: te guía para crear/enlazar el proyecto

# 3. En el deployment de desarrollo, configurar el token de la API
npx convex env set FOOTBALL_DATA_TOKEN <tu-token>

# 4. Sembrar los datos del Mundial (48 equipos + 104 partidos)
npx convex run seed:seedFromSnapshot '{}'
#   …o trae los datos en vivo de la API:
npx convex run sync:syncMatches '{}'

# 5. En OTRA terminal, levantar el frontend
npm run dev               # http://localhost:5173
```

> Asegúrate de que `.env.local` contenga `VITE_CONVEX_URL=<url de tu deployment de Convex>`
> (el cliente lo lee en build/dev). `npx convex dev` normalmente lo escribe por ti.

### Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Frontend en modo desarrollo (Vite, puerto 5173). |
| `npm run build` | Type‑check + build de producción (`tsc -b && vite build` → `dist/`). |
| `npm run preview` | Sirve el build de producción localmente. |
| `npm test` | Corre toda la suite (Vitest + convex‑test). |
| `npm run test:watch` | Pruebas en modo watch. |
| `npm run lint` | ESLint. |
| `npm start` | Sirve `dist/` con `serve` (lo usa Railway). |

Las pruebas de Convex declaran su entorno con `// @vitest-environment edge-runtime`; las de
componentes usan `// @vitest-environment jsdom`.

---

## ☁️ Despliegue — Backend (Convex Cloud)

```bash
# 1. Desplegar funciones + esquema a producción (imprime la URL de prod)
npx convex deploy

# 2. Configurar el token de la API en el deployment de PRODUCCIÓN
npx convex env set FOOTBALL_DATA_TOKEN <tu-token> --prod

# 3. Sembrar datos en producción (o disparar una sincronización en vivo)
npx convex run seed:seedFromSnapshot '{}' --prod
npx convex run sync:syncMatches '{}' --prod     # opcional: trae el estado actual de la API
```

A partir de ahí, el **cron `syncMatches` corre cada 5 minutos** automáticamente: hace upsert de
los partidos por `externalId` (respetando las correcciones manuales), recalcula vivos/eliminados/
campeón y auto‑cierra las quinielas al arrancar el primer partido.

Guarda la URL de producción (algo como `https://<nombre>.convex.cloud`): es el valor de
`VITE_CONVEX_URL` para Railway.

---

## ☁️ Despliegue — Frontend (Railway)

El repo ya incluye `railway.json` (build con NIXPACKS → `npm run build`, arranque con
`serve -s dist`). Con la [CLI de Railway](https://docs.railway.com/guides/cli):

```bash
# 1. (si aún no) crear/enlazar el proyecto y crear el servicio
railway init                       # o: railway link --project <id>
railway add --service quiniela2026

# 2. Variables del servicio
railway variable set VITE_CONVEX_URL=<url de Convex prod> --service quiniela2026
railway variable set NIXPACKS_NODE_VERSION=22 --service quiniela2026   # Vite 8 requiere Node >= 20.19

# 3. Desplegar el directorio actual
railway up --service quiniela2026

# 4. Generar un dominio público
railway domain --service quiniela2026
```

> ⚠️ `VITE_CONVEX_URL` debe estar puesta **antes** del build: Vite la "hornea" en el bundle.
> Si falta, la app lanza un error claro al iniciar (`Falta la variable de entorno VITE_CONVEX_URL`).
>
> ⚠️ Node: el build falla con Node 18 (Vite 8 necesita ≥ 20.19/22.12). El `.nvmrc` y
> `NIXPACKS_NODE_VERSION=22` lo fijan.

También puedes hacerlo desde el dashboard de Railway: nuevo servicio desde el repo de GitHub,
agregar las dos variables y desplegar.

---

## 🧪 Calidad

- **28 pruebas** (lógica de reparto y torneo, mutaciones/queries vía convex‑test, mapeo de la API, smoke de componentes).
- `npm run lint` en limpio (0 errores).
- Validado en navegador con Playwright (todos los roles) y revisado con CodeRabbit.

## ⚠️ Limitación conocida

La corrección manual de marcador edita la fila **global** del partido, así que en un deployment
que aloje muchas quinielas afectaría a todas. Está bien para un despliegue de una sola familia;
los overrides por quiniela quedan para una v1.5.

---

Diseño e implementación documentados en `docs/superpowers/`.
