# Dos clientes (web + Expo iOS), un solo backend Convex y la misma identidad por tokens

Al portear la webapp a Expo decidimos NO crear un repo nuevo ni un sistema de cuentas: la app nativa vive en `native/` dentro de este repo (package.json propio, importa `../convex` vía metro watchFolders + tsconfig paths), apunta al mismo deployment de Convex, y conserva la identidad por links con token opaco (admin/join/personal) — en nativo los tokens se guardan en SecureStore en lugar de localStorage. La entrada a una quiniela es por Universal Links: el mismo link de WhatsApp abre la app si está instalada o la web si no, con el flujo "pegar link/token" como rescate.

## Considered Options

- **Monorepo con workspaces formales (apps/web, apps/native, packages/backend)**: descartado por ahora — implica mover `src/` y `convex/` y reconfigurar Railway/tsconfigs sobre una web en producción durante el Mundial. Migrable después si la carpeta `native/` duele.
- **Repo separado**: descartado — dos copias de los tipos de Convex garantizan drift.
- **Añadir cuentas/auth para nativo**: descartado — el link-como-identidad es el corazón del producto; nativo lo respeta.

## Consequences

- Push nativo va por Expo Notifications (APNs) y convive con web-push: las suscripciones distinguen su canal y la entrega se bifurca en el backend. Web-push no se toca.
- Universal Links requieren servir `apple-app-site-association` desde el dominio de producción (Railway) y associated domains en la app.
- Distribución: TestFlight primero (revisión laxa); App Store después, asumiendo que habrá que revisar la guideline 5.3 (premios en dinero — el pago ya ocurre fuera de la app).
- iOS primero; Android queda para cuando iOS esté estable (la PWA cubre Android mientras tanto).
