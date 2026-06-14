// Lógica de pago compartida entre la web (src/lib/payment.ts re-exporta) y la app
// nativa (native importa @shared/payment). Funciones puras, sin dependencias de DOM
// ni RN, para que ambos clientes pinten la misma etiqueta de estado de pago.
export type PaymentMethod = "efectivo" | "transferencia";
export type PaymentSelection = "pending" | PaymentMethod;

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
};

/** Etiqueta del botón de pago según el estado. Pura (fácil de testear). */
export function paymentTriggerLabel(paid: boolean, method: PaymentMethod | null): string {
  if (!paid) return "Pendiente";
  if (method) return `✓ ${METHOD_LABEL[method]}`;
  return "✓ Pagó"; // legacy: pagó sin método registrado
}
