// Formulario inline de inscripción compartido por JoinClasica y ProgolGeneral
// (espejo del Dialog de src/routes/Join.tsx / ProgolGeneral.tsx, sin foto:
// las fotos llegan con SEN-25). Presentacional: el submit real (mutación +
// persistencia de token + navegación) lo inyecta cada vista vía `alUnirse`;
// aquí solo viven nombre/busy/error.
//
// DIVERGENCIA vs. la web: la web usa try/finally para resetear busy porque
// react-router desmonta la pantalla en el mismo flush que router.navigate().
// Aquí la pantalla nativa sobrevive a la transición de router.replace(), por
// lo que un finally reactivaría el botón y permitiría un segundo tap antes de
// que el screen sea destruido (joinQuiniela no es idempotente y consumiría un
// lugar extra). Solución: busy solo se resetea en el catch; en éxito se deja
// en true para que "Entrando…" persista durante toda la transición de salida.
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
      // Éxito: NO reseteamos busy. Ver comentario de módulo sobre la
      // divergencia con la web y el riesgo de doble-tap en nativo.
    } catch (err) {
      // Feedback mínimo: el mensaje crudo de Convex trae request id y stack,
      // no es apto para UI. El detalle fino llega con SEN-25/26.
      // console.warn para diagnóstico hasta que SEN-25/26 traiga UI de error.
      console.warn("[FormularioUnirse] error al unirse:", err);
      setError("No se pudo completar la inscripción. Intenta de nuevo.");
      setBusy(false);
    }
  }

  return (
    <View className="mt-6 rounded-2xl border border-border bg-card px-4 py-4">
      <Text className="font-sans font-bold text-base text-foreground">
        {titulo}
      </Text>
      {/* isInvalid activa el estado visual temático de HeroUI; el texto de
          error debajo lo hace legible también sin color (accesibilidad). */}
      <TextField className="mt-3" isInvalid={!!error}>
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
