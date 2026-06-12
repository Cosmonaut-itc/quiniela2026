// Home mínimo (SEN-24 Task 4): recuperación de panel desde storage +
// rescate por link o token. La pantalla de Crear quiniela / selector de
// torneo llega con una issue posterior; esto es la versión funcional mínima.
//
// Sin consultas Convex en el home: una quiniela eliminada no debe bloquear
// el home. Cada ruta tiene su propio ErrorBoundary y maneja el 404.
import { router, useFocusEffect } from "expo-router";
import type { Href } from "expo-router";
import { Button, Input, Label, TextField } from "heroui-native";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { parsePersonalPanelPath } from "@shared/personalLink";
import { Cargando, Pantalla } from "@/components/Pantalla";
import { getToken, listKnownQuinielas } from "@/lib/storage";

// Reexportar ErrorBoundary para uniformidad con las demás rutas del proyecto.
export { ErrorBoundary } from "expo-router";

type EstadoStorage = {
  cargado: boolean;
  paneles: { id: string; token: string }[];
};

export default function Index() {
  const [estado, setEstado] = useState<EstadoStorage>({
    cargado: false,
    paneles: [],
  });
  const [linkInput, setLinkInput] = useState("");
  const [errorLink, setErrorLink] = useState<string | null>(null);

  // Re-lee storage en cada focus (no solo en mount): si el usuario entró a una
  // quiniela via deep link y volvió aquí, el nuevo token ya debe aparecer.
  useFocusEffect(
    useCallback(() => {
      let activo = true;

      // ESLint prohíbe setState síncrono en effects; usamos .then para que el
      // setState ocurra en la resolución de la promesa, no en el body del effect.
      listKnownQuinielas().then(async (ids) => {
        if (!activo) return;

        // Solo quinielas con token "me" — el home no sabe cuáles siguen vivas
        // (sin Convex), así que filtra solo las que podría navegar de inmediato.
        const entradas = await Promise.all(
          ids.map(async (id) => {
            const token = await getToken(id, "me");
            return token ? { id, token } : null;
          }),
        );

        if (!activo) return;
        setEstado({
          cargado: true,
          paneles: entradas.filter(
            (e): e is { id: string; token: string } => e !== null,
          ),
        });
      });

      return () => {
        activo = false;
      };
    }, []),
  );

  function recuperar() {
    // fallbackId: cuando hay exactamente un panel guardado, un token suelto
    // puede resolverse sin ambigüedad. Con cero o varios paneles se necesita
    // el link completo (no hay forma de saber a qué quiniela pertenece el token).
    const fallbackId = estado.paneles.length === 1 ? estado.paneles[0].id : "";
    const path = parsePersonalPanelPath(linkInput, fallbackId);
    if (!path) {
      setErrorLink("No reconocí el link. Pega tu link personal completo.");
      return;
    }
    setErrorLink(null);
    setLinkInput("");
    // El cast a Href está justificado: parsePersonalPanelPath garantiza que
    // el resultado tiene la forma `/q/<id>/me/<token>`, que es una ruta válida
    // de Expo Router. El tipo Href no puede inferirse desde un string en tiempo
    // de compilación sin el cast.
    router.push(path as Href);
  }

  return (
    <Pantalla>
      {/* Título siempre visible */}
      <Text className="font-heading font-extrabold text-3xl text-foreground">
        Quiniela 2026
      </Text>

      {/* Sección "Tus quinielas" — solo cuando hay paneles guardados */}
      {estado.cargado && estado.paneles.length > 0 && (
        <View className="mt-6">
          <Text className="font-sans font-bold text-xs uppercase tracking-[1.4px] text-muted-foreground">
            Tus quinielas
          </Text>
          <View className="mt-3 gap-2.5">
            {estado.paneles.map((panel, idx) => {
              // Etiqueta: panel único → texto inequívoco; varios → sufijo de id
              // para distinguirlos sin hacer queries a Convex.
              const etiqueta =
                estado.paneles.length === 1
                  ? "Continuar a Mi panel"
                  : `Mi panel ${idx + 1}`;
              const sufijo =
                estado.paneles.length > 1
                  ? `…${panel.id.slice(-6)}`
                  : null;

              return (
                <Pressable
                  key={panel.id}
                  className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-70"
                  onPress={() =>
                    router.push({
                      pathname: "/q/[id]/me/[token]",
                      params: { id: panel.id, token: panel.token },
                    })
                  }
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="font-sans font-bold text-sm text-foreground">
                      {etiqueta}
                    </Text>
                    {sufijo && (
                      <Text className="font-sans text-xs text-muted-foreground">
                        {sufijo}
                      </Text>
                    )}
                  </View>
                  <Text className="font-sans text-sm text-muted-foreground">
                    →
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Estado vacío — cuando el storage ya cargó y no hay paneles */}
      {!estado.cargado && <Cargando />}
      {estado.cargado && estado.paneles.length === 0 && (
        <Text className="mt-4 font-sans text-sm text-muted-foreground">
          Abre el link de tu quiniela para entrar; tu panel quedará guardado
          aquí.
        </Text>
      )}

      {/* Sección de rescate — siempre visible: el usuario puede tener el link
          pero no haberlo abierto en este dispositivo todavía. Textos espejo del
          Dialog de recuperación en src/components/Shell.tsx. */}
      <View className="mt-8 rounded-2xl border border-border bg-card px-4 py-4">
        <Text className="font-sans font-bold text-base text-foreground">
          Ir a Mi panel
        </Text>
        <Text className="mt-1 font-sans text-sm text-muted-foreground">
          Pega tu link personal (el que recibiste al inscribirte) para abrir tu
          panel en esta app.
        </Text>
        <TextField className="mt-3" isInvalid={!!errorLink}>
          <Label>Tu link o token</Label>
          <Input
            value={linkInput}
            onChangeText={(v) => {
              setLinkInput(v);
              // Limpiar el error cuando el usuario vuelve a escribir.
              if (errorLink) setErrorLink(null);
            }}
            placeholder="https://…/q/…/me/…"
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="url"
          />
        </TextField>
        {errorLink && (
          <Text className="mt-2 font-sans text-sm text-destructive">
            {errorLink}
          </Text>
        )}
        <Button
          variant="primary"
          className="mt-4 h-12 w-full rounded-2xl"
          isDisabled={!linkInput.trim()}
          onPress={recuperar}
        >
          <Button.Label className="font-sans font-bold text-base text-primary-foreground">
            Recuperar mi panel
          </Button.Label>
        </Button>
      </View>
    </Pantalla>
  );
}
