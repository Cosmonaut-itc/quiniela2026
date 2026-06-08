import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export type PaymentMethod = "efectivo" | "transferencia";
export type PaymentSelection = "pending" | PaymentMethod;

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
};

/** Etiqueta del botón según el estado de pago. Pura (fácil de testear). */
export function paymentTriggerLabel(paid: boolean, method: PaymentMethod | null): string {
  if (!paid) return "Pendiente";
  if (method) return `✓ ${METHOD_LABEL[method]}`;
  return "✓ Pagó"; // legacy: pagó sin método registrado
}

const ITEMS: { value: PaymentSelection; label: string }[] = [
  { value: "pending", label: "Pendiente" },
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
];

export function PaymentStatusMenu({
  paid,
  method,
  disabled,
  onSelect,
}: {
  paid: boolean;
  method: PaymentMethod | null;
  disabled?: boolean;
  onSelect: (next: PaymentSelection) => void;
}) {
  // Un pago legacy (paid sin método) marca "pending" en el check del menú, pero el
  // botón sigue mostrando "✓ Pagó" vía paymentTriggerLabel.
  const current: PaymentSelection = paid ? (method ?? "pending") : "pending";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label="Estado de pago"
        className={cn(
          "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
          paid
            ? "bg-alive/15 text-alive"
            : "bg-muted/60 text-muted-foreground hover:text-foreground",
        )}
      >
        {paymentTriggerLabel(paid, method)}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {ITEMS.map((it) => (
          <DropdownMenuItem key={it.value} onClick={() => onSelect(it.value)}>
            {it.label}
            {current === it.value && <CheckIcon className="size-3.5 text-alive" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
