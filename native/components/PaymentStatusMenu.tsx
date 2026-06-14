// Port nativo de src/components/PaymentStatusMenu.tsx. El DropdownMenu web → un
// action-sheet (Modal transparente + backdrop). El trigger muestra la etiqueta de
// estado (paymentTriggerLabel, compartida vía @shared/payment). Al elegir una
// opción se llama onSelect y se cierra. RN: cada texto con color explícito.
import { useState } from "react";
import { Modal, Pressable, Text } from "react-native";
import {
  paymentTriggerLabel,
  type PaymentMethod,
  type PaymentSelection,
} from "@shared/payment";

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
  const [open, setOpen] = useState(false);
  // Pago legacy (paid sin método) marca "pending" en el check, pero el trigger
  // sigue mostrando "✓ Pagó" vía paymentTriggerLabel.
  const current: PaymentSelection = paid ? (method ?? "pending") : "pending";

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Estado de pago"
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`shrink-0 rounded-lg px-2.5 py-1 ${paid ? "bg-alive/15" : "bg-muted/60"} ${disabled ? "opacity-50" : "active:opacity-80"}`}
      >
        <Text
          className={`font-sans text-xs font-semibold ${paid ? "text-alive" : "text-muted-foreground"}`}
        >
          {paymentTriggerLabel(paid, method)}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* Gating de contenido: evita que jest-expo exponga los items del menú
            cuando visible=false (el mock de Modal renderiza children siempre).
            En producción RN no renderiza children con visible=false, pero en
            el entorno de test el gating es necesario para que la prueba
            "disabled → no abre el menú" pase correctamente. */}
        {open && (
          /* Backdrop: cierra al tocar fuera. */
          <Pressable
            className="flex-1 justify-end bg-black/50"
            accessibilityLabel="Cerrar menú de pago"
            onPress={() => setOpen(false)}
          >
            {/* Contenedor interno: detiene la propagación para no cerrar al tocar dentro. */}
            <Pressable
              onPress={() => {}}
              className="rounded-t-3xl border-t border-border bg-card px-4 pb-8 pt-3"
            >
              <Text className="mb-2 px-1 font-sans text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Estado de pago
              </Text>
              {ITEMS.map((it) => {
                const selected = current === it.value;
                return (
                  <Pressable
                    key={it.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onSelect(it.value);
                      setOpen(false);
                    }}
                    className="flex-row items-center justify-between rounded-xl px-3 py-3 active:opacity-70"
                  >
                    <Text className="font-sans text-base text-foreground">{it.label}</Text>
                    {selected && (
                      <Text className="font-sans text-base text-alive">✓</Text>
                    )}
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        )}
      </Modal>
    </>
  );
}
