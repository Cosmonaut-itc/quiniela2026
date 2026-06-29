// convex/lib/syncGate.ts
/** Gate de los crons de sincronización (syncMatches / syncLineups).
 *
 *  Habilitado por defecto: prod no necesita configuración nueva y nunca queda
 *  silenciado por accidente. Poner `DISABLE_SYNC=1` (o `true`) en las variables
 *  de entorno de un deployment apaga ambos crons sin redeploy — pensado para el
 *  deployment de dev, que sondeaba la API en vivo cada 5 min igual que prod y
 *  consumía MÁS Database I/O que prod. También sirve como kill-switch de
 *  emergencia en prod. */
export function syncCronEnabled(env: Record<string, string | undefined>): boolean {
  // Normaliza (trim + minúsculas): un kill-switch de emergencia debe apagar igual
  // con "TRUE", " true " o " 1 " escritos a mano en el dashboard.
  const flag = env.DISABLE_SYNC?.trim().toLowerCase();
  return !(flag === "1" || flag === "true");
}
