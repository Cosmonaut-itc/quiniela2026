# Flujos Maestro (SEN-24)

Cubren el modelo de identidad por link en nativo: deep link → ver quiniela →
unirse → token personal en SecureStore → Mi panel → recuperación sin link →
rescate por link/token. Verificación E2E del issue SEN-24.

## Requisitos

- **Java 17** en el PATH (Maestro lo exige). En este equipo:
  `export JAVA_HOME=/opt/homebrew/opt/openjdk@17` y añade `$JAVA_HOME/bin` al PATH.
- Maestro: `curl -fsSL https://get.maestro.mobile.dev | bash` (binario en
  `~/.maestro/bin`).
- Simulador iOS booteado + **Expo Go** instalado, con Metro corriendo desde
  `native/`: `npx expo start --ios --clear` (el `--clear` evita bundles
  cacheados que invalidan capturas).
- Backend **dev** sembrado (`coordinated-caribou-264`). NUNCA `--prod`.

## Orden

1. `sen24-unirse-desde-deeplink.yaml` — necesita una quiniela clásica
   `status: "open"` con lugares libres. Deja un inscrito "Maestro SEN24" y su
   token en el Keychain de Expo Go.
2. `sen24-recuperar-panel.yaml` — depende del paso 1 (lee el token persistido).
3. `sen24-rescate-link-o-token.yaml` — necesita el `personalToken` del inscrito
   (`npx convex data participants`).

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"

QID=<id de la quiniela>
JTOKEN=<joinToken>           # 2º hash en: npx convex data quinielas
maestro test -e QUINIELA_ID=$QID -e JOIN_TOKEN=$JTOKEN sen24-unirse-desde-deeplink.yaml
maestro test sen24-recuperar-panel.yaml
PTOKEN=<personalToken>       # columna personalToken en: npx convex data participants
maestro test -e QUINIELA_ID=$QID -e PERSONAL_TOKEN=$PTOKEN sen24-rescate-link-o-token.yaml
```

## Notas

- Deep links en Expo Go usan el esquema `exp://` (`exp://127.0.0.1:8081/--/...`).
  El esquema propio `quiniela://` (app.json) solo se verifica con dev build
  firmado (Task 9 del plan Fase 2), no en Expo Go.
- Una quiniela `assignMode: on_join` se bloquea al unirse durante un torneo en
  curso; para re-correr el flujo de unirse hace falta una quiniela `open` fresca.
