// Formulario inline de inscripción compartido por JoinClasica y ProgolGeneral
// (espejo del Dialog de src/routes/Join.tsx / ProgolGeneral.tsx, sin foto:
// las fotos llegan con SEN-25). Presentacional: el submit real (mutación +
// persistencia de token + navegación) lo inyecta cada vista vía `alUnirse`;
// aquí solo viven nombre/busy/error y el try/finally que resetea busy
// (mismo patrón que el submit() web).
import { Button, Input, Label, TextField } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

type Props = {
  /** Texto del CTA web que encabeza la sección ("⚽/🎯 Unirme a la quiniela"). */
  titulo: string;
  /** Inscribe al jugador (mutación + token + navegación). Si lanza, el form muestra el error. */
  alUnirse: (nombre: string) => Promise<void>;
};

export function FormularioUnirse({ titulo, alUnirse }: Props) {
  const [nombre, setNombre] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!nombre.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await alUnirse(nombre);
    } catch {
      // Feedback mínimo: el mensaje crudo de Convex trae request id y stack,
      // no es apto para UI. El detalle fino llega con SEN-25/26.
      setError("No se pudo completar la inscripción. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-6 rounded-2xl border border-border bg-card px-4 py-4">
      <Text className="font-sans font-bold text-base text-foreground">
        {titulo}
      </Text>
      <TextField className="mt-3">
        <Label>Tu nombre</Label>
        <Input
          value={nombre}
          onChangeText={setNombre}
          placeholder="Ej. María"
          maxLength={40}
        />
      </TextField>
      {error && (
        <Text className="mt-2 font-sans text-sm text-destructive">{error}</Text>
      )}
      <Button
        variant="primary"
        className="mt-4 h-12 w-full rounded-2xl"
        isDisabled={busy || !nombre.trim()}
        onPress={() => void enviar()}
      >
        <Button.Label className="font-sans font-bold text-base text-primary-foreground">
          {busy ? "Entrando…" : "Confirmar inscripción"}
        </Button.Label>
      </Button>
    </View>
  );
}
