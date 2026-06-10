# Backend multi-torneo con catálogo en código y sync solo de torneos activos

La app nació acoplada al Mundial 2026 (`teams`/`matches` globales, sync hardcodeado a `/competitions/WC/matches`). Decidimos generalizar el backend a múltiples Torneos: `teams` y `matches` quedan scoped por Torneo, cada Quiniela referencia su Torneo, y el catálogo de torneos disponibles se declara en código (las ~12 competiciones del free tier de football-data.org) con su formato (eliminatorio/liga), porque el formato determina los modos de juego permitidos (Clásica solo en eliminatorios — ver CONTEXT.md).

## Considered Options

- **Catálogo dinámico desde la API**: descartado — el formato y el nombre corto requieren curaduría manual, y el catálogo cambia una vez al año como mucho.
- **Sincronizar todo el catálogo siempre**: descartado — gasta ~12 llamadas/ciclo todo el año contra un límite de 10/min, sin margen y sin beneficio cuando nadie juega esos torneos.
- **Elegido — sync solo de torneos con quinielas activas**: el cron itera los Torneos referenciados por quinielas vivas, 1 llamada por torneo por ciclo, espaciadas.

## Consequences

- Crear la primera quiniela de un Torneo dispara un sync inicial de ese torneo: Clásica necesita el conteo de equipos para repartir slots y Progol necesita partidos. El flujo de creación espera/confirma ese primer sync.
- Migración de schema sobre datos en producción: las filas existentes de `teams`/`matches`/`quinielas` se backfillean al Torneo Mundial 2026.
- Si algún día se paga tier de football-data, ampliar el catálogo es añadir entradas al código, no rediseñar.
