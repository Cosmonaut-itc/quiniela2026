// Re-export desde shared para que web y nativo compartan la misma lógica de pago.
// Los imports existentes (`@/lib/payment`) siguen funcionando sin cambios.
export {
  paymentTriggerLabel,
  type PaymentMethod,
  type PaymentSelection,
} from "@shared/payment";
