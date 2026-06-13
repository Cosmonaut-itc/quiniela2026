// Port nativo del Shell de página + nav inferior clásicos (SEN-25, Tarea E).
// Espejo de src/components/Shell.tsx: una columna centrada (~max-w-md) sobre el
// fondo stadium-night, con un nav inferior de 3 tabs (Mi panel · General ·
// Mundial) que se ancla abajo y respeta el safe-area inset.
//
// Diferencias con la web (decididas en el spec de la tarea):
//   - storage es SecureStore ASÍNCRONO (native/lib/storage.ts), no localStorage
//     síncrono → la persistencia es fire-and-forget en un effect y el fallback
//     de tokens se lee con getToken y se asienta dentro de .then (NUNCA setState
//     síncrono en el body del effect: lo prohíbe la regla set-state-in-effect).
//   - "Mi panel" sin token NO abre un Dialog de recuperación: navega al home,
//     que ya hospeda el rescate por link (app/index.tsx).
//   - sonner / Dialog no se portan (el home es dueño del rescate).
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { GrainCard } from "@/components/Grain";
import { getToken, setToken } from "@/lib/storage";

/**
 * Shell de página: columna centrada (~28rem / max-w-md) sobre bg-background, con
 * espacio para un nav inferior opcional fijado abajo. Espejo del Shell web.
 */
export function Shell({
  children,
  bottomNav,
  className,
}: {
  children: ReactNode;
  bottomNav?: ReactNode;
  className?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      {/* keyboardShouldPersistTaps="handled": sin esto el primer tap con el
          teclado abierto solo cierra el teclado y se traga el press (mismo
          patrón que Pantalla.tsx; bit a FormularioUnirse y al rescate del home). */}
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName={`mx-auto w-full max-w-md px-4 ${
          bottomNav ? "pb-28" : "pb-12"
        } ${className ?? ""}`}
        contentContainerStyle={{ paddingTop: insets.top + 24 }}
      >
        {children}
      </ScrollView>
      {/* El nav es hermano flex tras el ScrollView: queda fijo abajo y siempre
          visible. min-h-svh de la web → flex:1 del contenedor. */}
      {bottomNav}
    </View>
  );
}

type NavKey = "me" | "general" | "mundial";

/**
 * Nav inferior de 3 tabs (Mi panel · General · Mundial). Los targets se arman
 * con el id de la quiniela y los tokens personal/join disponibles en el contexto
 * actual; para tabs sin token en props, cae al token guardado en SecureStore.
 */
export function BottomNav({
  id,
  active,
  meToken,
  joinToken,
  // Torneo de la quiniela (getMode/getTorneo): da el label del tab Vista Torneo.
  tournament,
}: {
  id: string;
  active: NavKey;
  meToken?: string | null;
  joinToken?: string | null;
  tournament?: { shortName: string } | null;
}) {
  const insets = useSafeAreaInsets();

  // Persiste los tokens que esta página conoce para que rutas sin token (Mundial)
  // puedan llegar a Mi panel / General vía el fallback de storage. Fire-and-forget:
  // los helpers no rechazan (degradan a no-op), y NO hay setState en el body, así
  // que la regla set-state-in-effect queda satisfecha.
  useEffect(() => {
    if (meToken) setToken(id, "me", meToken);
    if (joinToken) setToken(id, "join", joinToken);
  }, [id, meToken, joinToken]);

  // Fallback de tokens desde storage para los tabs cuyo token no llega por props.
  // SecureStore es async: el setState SIEMPRE ocurre DENTRO de .then, nunca en el
  // body del effect (lo prohíbe la regla set-state-in-effect). El estado guarda
  // SOLO el resultado de la lectura al Keychain; cuando el token llega por props
  // ni se lee (se deriva abajo con ?? sin tocar estado). null = no hay token.
  const [fallbackMe, setFallbackMe] = useState<string | null>(null);
  const [fallbackJoin, setFallbackJoin] = useState<string | null>(null);

  useEffect(() => {
    // Si el token llega por props, el fallback es irrelevante (no se lee el
    // Keychain ni se asienta estado): se deriva directo de la prop más abajo.
    if (meToken) return;
    let activo = true;
    getToken(id, "me").then((t) => {
      if (activo) setFallbackMe(t);
    });
    return () => {
      activo = false;
    };
  }, [id, meToken]);

  useEffect(() => {
    if (joinToken) return;
    let activo = true;
    getToken(id, "join").then((t) => {
      if (activo) setFallbackJoin(t);
    });
    return () => {
      activo = false;
    };
  }, [id, joinToken]);

  // Token efectivo por tab: el de props si llega, si no el leído de storage
  // (null mientras el fallback aún no resuelve → se trata como "sin token todavía").
  const storedMe = meToken ?? fallbackMe;
  const storedJoin = joinToken ?? fallbackJoin;

  const items: {
    key: NavKey;
    label: string;
    emoji: string;
    // Acción al pulsar un tab inactivo. null = deshabilitado (no pulsable).
    onPress: (() => void) | null;
  }[] = [
    {
      key: "me",
      label: "Mi panel",
      emoji: "👤",
      // Con token → su panel; sin token → home (rescate por link). Siempre
      // actionable, nunca deshabilitado.
      onPress: () =>
        storedMe
          ? router.push({
              pathname: "/q/[id]/me/[token]",
              params: { id, token: storedMe },
            })
          : router.push("/"),
    },
    {
      key: "general",
      label: "General",
      emoji: "📋",
      // Sin join-token no hay forma de abrir el general → deshabilitado.
      onPress: storedJoin
        ? () =>
            router.push({
              pathname: "/q/[id]/join/[token]",
              params: { id, token: storedJoin },
            })
        : null,
    },
    {
      key: "mundial",
      label: tournament?.shortName ?? "Mundial",
      emoji: "🌍",
      onPress: () => router.push({ pathname: "/q/[id]/torneo", params: { id } }),
    },
  ];

  return (
    // fixed inset-x-0 bottom-0 (web) → posición al fondo respetando el safe-area
    // inferior; columna centrada max-w-md con px-4 como la web.
    <View
      className="w-full px-4"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <GrainCard
        accessibilityRole="tablist"
        className="mx-auto w-full max-w-md flex-row rounded-2xl border border-border bg-popover/85 p-1.5"
      >
        {items.map((it) => {
          const isActive = it.key === active;
          // El tab activo se renderiza como elemento plano resaltado (no navega).
          const disabled = !isActive && it.onPress === null;
          const content = (
            <View className="relative items-center gap-0.5 rounded-xl py-2">
              {/* Pastilla de fondo del tab activo: bg-primary (el glow-primary de
                  la web no compila en uniwind → deuda conocida, como gold-ring). */}
              {isActive && (
                <View className="absolute inset-0 rounded-xl bg-primary" />
              )}
              <Text className="z-10 text-base leading-none">{it.emoji}</Text>
              <Text
                className={`z-10 font-semibold text-[0.7rem] ${
                  isActive ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {it.label}
              </Text>
            </View>
          );

          // Tab activo: View plano (no navega).
          if (isActive) {
            return (
              <View
                key={it.key}
                className="flex-1"
                accessibilityRole="tab"
                accessibilityLabel={it.label}
                accessibilityState={{ selected: true }}
              >
                {content}
              </View>
            );
          }

          // Tab deshabilitado (General sin join-token): no pulsable, opacity-60.
          if (disabled) {
            return (
              <View
                key={it.key}
                className="flex-1 opacity-60"
                accessibilityRole="tab"
                accessibilityLabel={it.label}
                accessibilityState={{ selected: false, disabled: true }}
              >
                {content}
              </View>
            );
          }

          // Tab inactivo y navegable.
          return (
            <Pressable
              key={it.key}
              className="flex-1 active:opacity-70"
              accessibilityRole="tab"
              accessibilityLabel={it.label}
              accessibilityState={{ selected: false }}
              onPress={it.onPress ?? undefined}
            >
              {content}
            </Pressable>
          );
        })}
      </GrainCard>
    </View>
  );
}
