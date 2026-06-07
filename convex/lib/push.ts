/** Endpoints cuya suscripción ya no existe (Not Found / Gone) y deben borrarse. */
export function deadEndpoints(results: { endpoint: string; statusCode: number }[]): string[] {
  return results.filter((r) => r.statusCode === 404 || r.statusCode === 410).map((r) => r.endpoint);
}
