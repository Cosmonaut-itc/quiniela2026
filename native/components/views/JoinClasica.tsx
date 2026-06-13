// Port nativo de la vista Join / General clásica (SEN-25, Tarea G). Espejo de la
// rama Clásica de src/routes/Join.tsx (la rama Progol, los skeletons de
// LoadingState y el Dialog/Input/Label de la web NO se portan aquí). Una columna
// read-only: header con foto + nombre + estado + banner de premio, notas, banner
// de sorteo en vivo, tabla de jugadores, próximos duelos, link al torneo, y el
// CTA de inscripción.
//
// Salvedades del port nativo (decididas en el spec):
//   - bg-pitch / header-safe / glow-primary NO se portan: uniwind no compila
//     repeating-linear-gradient ni los box-shadow del glow → deuda decorativa
//     aceptada (el grano sí va, vía GrainCard; el Shell ya aplica el inset
//     superior del safe-area). El header sigue sangrando horizontal (-mx-4 px-4).
//   - El Dialog web de inscripción → FormularioUnirse inline (presentacional;
//     name-only, sin foto → fuera de SEN-25).
//   - Toda cadena va en <Text> con su clase de fuente explícita (no hay cascada
//     en RN). La foto de la quiniela es <Image> de expo-image (width/height
//     explícitos: no hay size-14 implícito en RN).
//
// CTA — decisión clave vs. la web: la web oculta el CTA por completo cuando ya
// estás inscrito en este dispositivo (alreadyJoined). El stub previo, sin
// BottomNav, ponía un botón "Ir a Mi panel" para no dejar un callejón sin salida;
// ahora el BottomNav ya navega a "Mi panel" vía su fallback de storage, así que
// ese botón es redundante y se ELIMINA: con token "me" guardado no se renderiza
// nada (fiel a la web). Tri-estado del CTA atado a la lectura async del Keychain.
//
// Persistencia (invariante de identidad): la dueña del join token es el BottomNav
// (lo persiste en su propio effect). El BottomNav vive en el JSX del camino feliz,
// así que solo monta cuando getOverview resolvió SIN lanzar — un token inválido
// lanza durante el render y el BottomNav nunca monta, preservando "un token
// inválido nunca se persiste" sin un gate aparte. Esta vista NO añade una segunda
// ruta de persistencia (se quitó el setToken(id,"join") del stub).
import { useMutation, useQuery } from "convex/react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { prizeBanner } from "@shared/format";
import { SectionHeading, PrizeBanner } from "@/components/bits";
import { DuelRow } from "@/components/DuelRow";
import { FormularioUnirse } from "@/components/FormularioUnirse";
import { GrainCard } from "@/components/Grain";
import { Cargando } from "@/components/Pantalla";
import { PlayersTable } from "@/components/PlayersTable";
import { Shell, BottomNav } from "@/components/Shell";
import { getToken, setToken } from "@/lib/storage";

type Props = { quinielaId: string; joinToken: string };

export function JoinClasica({ quinielaId, joinToken }: Props) {
  // Solo alimenta tournament al BottomNav. La ruta ya tiene esta misma
  // suscripción cacheada, así que resuelve de inmediato; el BottomNav tolera
  // undefined (→ "Mundial").
  const mode = useQuery(api.quinielas.getMode, { id: quinielaId as Id<"quinielas"> });
  const data = useQuery(api.quinielas.getOverview, { joinToken });
  const join = useMutation(api.participants.joinQuiniela);

  // "Ya inscrito en este dispositivo" = existe token "me" en Keychain (espejo
  // del readStoredToken síncrono de la web → alreadyJoined).
  //
  // Estado derivado: guardamos la lectura como { id, token } para atar el
  // resultado a la quinielaId que lo generó. Si quinielaId cambia (p. ej. por
  // un deep link que pushea una instancia nueva), meToken se recalcula a
  // undefined (= pendiente) en lugar de mostrar el token de la quiniela
  // anterior. ESLint prohíbe setState síncrono en effects, por eso no
  // reseteamos el state dentro del effect al cambiar quinielaId; en su lugar
  // la derivación lo hace sin efecto secundario.
  //
  // Tri-estado: undefined = lectura en curso (se oculta el CTA para evitar
  // parpadeo); null = no hay token; string = ya inscrito.
  const [lectura, setLectura] = useState<
    { id: string; token: string | null } | undefined
  >(undefined);
  useEffect(() => {
    let activo = true;
    void getToken(quinielaId, "me").then((t) => {
      if (activo) setLectura({ id: quinielaId, token: t });
    });
    return () => {
      activo = false;
    };
  }, [quinielaId]);
  // Derivado: solo se usa el token si pertenece a la quinielaId actual.
  const meToken = lectura?.id === quinielaId ? lectura.token : undefined;

  if (data === undefined) return <Cargando />;

  const { quiniela } = data;
  const canJoin = quiniela.status === "open" && data.freeSlots > 0;
  const statusLabel =
    quiniela.status === "open"
      ? "Inscripciones abiertas"
      : quiniela.status === "locked"
        ? "Inscripciones cerradas"
        : "Mundial finalizado";

  const b = prizeBanner(quiniela.prize, quiniela.status, " al campeón");

  async function unirse(nombre: string) {
    const res = await join({ joinToken, name: nombre });
    await setToken(quinielaId, "me", res.personalToken);
    // replace y no push (la web usa nav()): deliberado — volver atrás a un
    // form ya consumido es confuso en nativo.
    router.replace({
      pathname: "/q/[id]/me/[token]",
      params: { id: quinielaId, token: res.personalToken },
    });
  }

  return (
    <Shell
      bottomNav={
        <BottomNav
          id={quinielaId}
          active="general"
          joinToken={joinToken}
          tournament={mode?.tournament}
        />
      }
    >
      {/* Header (web <header className="grain bg-pitch header-safe …">). El
          -mx-4 px-4 lo sangra hasta el borde del Shell; bg-pitch / header-safe
          se omiten (ver cabecera del archivo). */}
      <GrainCard className="-mx-4 rounded-b-3xl border-b border-border px-4 pb-6">
        <View className="flex-row items-center gap-3.5">
          {quiniela.photoUrl ? (
            <Image
              source={{ uri: quiniela.photoUrl }}
              contentFit="cover"
              style={{ width: 56, height: 56 }}
              className="shrink-0 rounded-2xl"
            />
          ) : (
            <View className="size-14 shrink-0 items-center justify-center rounded-2xl bg-secondary">
              <Text className="font-sans text-3xl">🏟️</Text>
            </View>
          )}
          <View className="min-w-0 flex-1">
            <Text
              numberOfLines={1}
              className="font-heading text-2xl font-extrabold text-foreground"
            >
              {quiniela.name}
            </Text>
            <Text
              numberOfLines={1}
              className="font-sans text-sm text-muted-foreground"
            >
              {quiniela.filledCount} de {quiniela.numParticipants} lugares ·{" "}
              {statusLabel}
            </Text>
          </View>
        </View>
        {b ? <PrizeBanner title={b.title} subline={b.subline} /> : null}
      </GrainCard>

      {quiniela.notes ? (
        <>
          <SectionHeading>Notas</SectionHeading>
          {/* RN <Text> preserva \n nativamente → no hace falta whitespace-pre-wrap. */}
          <GrainCard className="rounded-2xl border border-border bg-card px-4 py-3">
            <Text className="font-sans text-sm text-foreground/90">
              {quiniela.notes}
            </Text>
          </GrainCard>
        </>
      ) : null}

      {quiniela.assignMode === "on_reveal" && quiniela.status === "open" ? (
        <GrainCard className="mt-6 flex-row items-center gap-2.5 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
          <Text className="font-sans text-lg leading-none">🎲</Text>
          <Text className="flex-shrink font-sans text-sm text-foreground/90">
            Sorteo en vivo: los equipos se reparten cuando el organizador dé
            inicio.
          </Text>
        </GrainCard>
      ) : null}

      {/* PlayersTable ya renderiza la tile de lugares libres → no se duplica. */}
      <PlayersTable players={data.players} freeSlots={data.freeSlots} />

      {data.upcomingDuels.length > 0 ? (
        <>
          <SectionHeading>Próximos duelos entre ustedes</SectionHeading>
          <View className="gap-2.5">
            {/* Las filas de duelo no tienen id → key={i} es la convención
                establecida (igual que las vistas de torneo). */}
            {data.upcomingDuels.map((d, i) => (
              <DuelRow key={i} d={d} />
            ))}
          </View>
        </>
      ) : null}

      {/* Link al torneo (web /q/:id/mundial → nativo /q/[id]/torneo). */}
      <Pressable
        className="mt-6 flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-70"
        accessibilityRole="link"
        accessibilityLabel="Ver grupos y bracket del Mundial"
        onPress={() =>
          router.push({ pathname: "/q/[id]/torneo", params: { id: quinielaId } })
        }
      >
        <View className="flex-row items-center gap-2">
          <Text className="font-sans text-lg">🌍</Text>
          <Text className="font-sans font-semibold text-sm text-foreground">
            Ver grupos y bracket del Mundial
          </Text>
        </View>
        <Text className="font-sans text-sm text-muted-foreground">→</Text>
      </Pressable>

      {/* CTA — espejo del bloque !alreadyJoined de Join.tsx. Mientras el Keychain
          no resuelve (meToken undefined) no se renderiza nada (evita parpadeo).
          Con token "me" (ya inscrito) tampoco: la web oculta el CTA y el
          BottomNav ya navega a "Mi panel" (ver cabecera). */}
      {meToken === null ? (
        canJoin ? (
          <FormularioUnirse titulo="⚽ Unirme a la quiniela" alUnirse={unirse} />
        ) : (
          <View className="mt-6 rounded-2xl border border-border bg-card px-4 py-3.5">
            <Text className="text-center font-sans text-sm text-muted-foreground">
              {quiniela.status === "open"
                ? "No quedan lugares disponibles."
                : "Las inscripciones ya están cerradas."}
            </Text>
          </View>
        )
      ) : null}
    </Shell>
  );
}
