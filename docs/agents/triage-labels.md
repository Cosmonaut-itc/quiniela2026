# Triage Labels

The skills speak in terms of five canonical triage roles. In Linear these map to a **hybrid** of native workflow states and labels, applied via `update_issue`.

| Rol canónico      | En Linear               | Cómo se aplica                                  |
| ----------------- | ----------------------- | ----------------------------------------------- |
| `needs-triage`    | estado **Triage**       | `update_issue` → `state` = "Triage" (nativo)    |
| `needs-info`      | label `needs-info`      | `update_issue` → añadir label `needs-info`      |
| `ready-for-agent` | label `ready-for-agent` | `update_issue` → añadir label `ready-for-agent` |
| `ready-for-human` | label `ready-for-human` | `update_issue` → añadir label `ready-for-human` |
| `wontfix`         | estado **Canceled**     | `update_issue` → `state` = "Canceled" (nativo)  |

## Notas

- Resuelve ids de estados con `list_issue_statuses` y de labels con `list_issue_labels` antes de aplicarlos.
- Si un label (`needs-info`, `ready-for-agent`, `ready-for-human`) aún no existe, créalo con `create_issue_label` la primera vez.
- `Triage` y `Canceled` son estados nativos de Linear; no crees labels con esos nombres.
- Cuando una skill mencione un rol (p. ej. "aplica la etiqueta de listo-para-AFK"), usa la fila correspondiente de esta tabla.

Edita la columna central si tu vocabulario real cambia.
