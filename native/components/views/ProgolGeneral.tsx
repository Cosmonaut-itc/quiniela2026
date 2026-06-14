// Port nativo de la vista General/Invitación Progol (SEN-26). Espejo de
// src/routes/progol/ProgolGeneral.tsx (el usePhotoUpload y el Dialog de
// inscripción de la web NO se portan: la foto es SEN-27, el form es
// FormularioUnirse). Gemela Progol de JoinClasica: misma estructura
// (Shell+BottomNav, header GrainCard, notas, link al torneo, CTA tri-estado),
// más la tabla de posiciones (Leaderboard) y la tarjeta ajena (ViewCard).
//
// Salvedades del port nativo (decididas en el spec):
//   - bg-pitch / header-safe / glow-primary NO se portan: uniwind no los compila
//     → deuda decorativa aceptada (el grano sí va vía GrainCard; el Shell aplica
//     el inset del safe-area). El header sigue sangrando horizontal (-mx-4 px-4).
//   - El Dialog web de inscripción → FormularioUnirse inline (name-only, sin foto).
//   - El ViewCardDialog web → ViewCard, montado en el PRIMER <Modal> nativo.
//   - Progol NO tiene tope de lugares (a diferencia de Clásica): el subtítulo es
//     "{n} jugadores · {estado}" (sin "X de Y lugares") y canJoin = status open.
//   - Toda cadena va en <Text> con su clase de fuente explícita (no hay cascada
//     en RN). La foto de la quiniela es <Image> de expo-image; el fallback es el
//     emoji 🎯 (como la web; Clásica usa 🏟️).
//
// Persistencia (invariante de identidad): la dueña del join token es el BottomNav
// (lo persiste en su propio effect). Vive en el JSX del camino feliz, así que solo
// monta cuando getGeneral resolvió SIN lanzar — un token inválido lanza en render
// y el BottomNav nunca monta, preservando "un token inválido nunca se persiste"
// sin un gate aparte. Esta vista NO añade una segunda ruta de persistencia del
// join token (se quitó el setToken(id,"join") del stub previo). El setToken(id,
// "me",…) dentro de unirse SÍ va: es escritura post-inscripción en un handler, no
// persistencia del join token (igual que JoinClasica).
import { useMutation, useQuery } from "convex/react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { prizeBanner } from "@shared/format";
import { SectionHeading, PrizeBanner } from "@/components/bits";
import { FormularioUnirse } from "@/components/FormularioUnirse";
import { GrainCard } from "@/components/Grain";
import { Leaderboard } from "@/components/Leaderboard";
import { Cargando } from "@/components/Pantalla";
import { Shell, BottomNav } from "@/components/Shell";
import { ViewCard } from "@/components/ViewCard";
import { getToken, setToken } from "@/lib/storage";

type Props = { quinielaId: string; joinToken: string };

export function ProgolGeneral({ quinielaId, joinToken }: Props) {
  // Solo alimenta tournament al BottomNav y el label condicional del link al
  // torneo (liga vs eliminatorio). La ruta ya tiene esta misma suscripción
  // cacheada, así que resuelve de inmediato; el BottomNav tolera undefined.
  const mode = useQuery(api.quinielas.getMode, { id: quinielaId as Id<"quinielas"> });
  const data = useQuery(api.progol.getGeneral, { joinToken });
  const join = useMutation(api.participants.joinQuiniela);

  // Tarjeta ajena: id del participante seleccionado en el Leaderboard (null =
  // ninguna abierta). Espejo del estado `viewing` de la web.
  const [viewing, setViewing] = useState<string | null>(null);

  // "Ya inscrito en este dispositivo" = existe token "me" en Keychain (espejo
  // del readStoredToken síncrono de la web → alreadyJoined). Estado derivado:
  // guardamos la lectura como { id, token } para atarla a la quinielaId que la
  // generó; si quinielaId cambia, meToken se recalcula a undefined (pendiente)
  // sin un setState en el body del effect (lo prohíbe set-state-in-effect).
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
  // Progol no tiene tope de lugares: basta status open (igual que la web).
  const canJoin = quiniela.status === "open";
  const statusLabel =
    quiniela.status === "open"
      ? "Inscripciones abiertas"
      : quiniela.status === "locked"
        ? "Inscripciones cerradas"
        : "Mundial finalizado";

  const b = prizeBanner(quiniela.prize, quiniela.status, " al líder");
  const linkLabel =
    mode?.tournament.format === "liga"
      ? "Ver tabla de posiciones del torneo"
      : "Ver grupos y bracket del Mundial";

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
              <Text className="font-sans text-3xl">🎯</Text>
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
              {quiniela.filledCount}{" "}
              {quiniela.filledCount === 1 ? "jugador" : "jugadores"} ·{" "}
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

      {/* Tabla de posiciones. El sufijo "{decidedMatches} jugados" va como <Text>
          anidado dentro del SectionHeading (que ya es un <Text>): en RN anidar
          <Text> compone inline como el <span> web. */}
      <SectionHeading>
        Tabla de posiciones{" "}
        <Text className="font-sans text-foreground/40">
          {data.decidedMatches} jugados
        </Text>
      </SectionHeading>
      <Leaderboard rows={data.leaderboard} onSelect={setViewing} />

      {/* Link al torneo (web /q/:id/torneo → nativo /q/[id]/torneo). Label
          condicional por formato (liga vs eliminatorio). */}
      <Pressable
        className="mt-6 flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-70"
        accessibilityRole="link"
        accessibilityLabel={linkLabel}
        onPress={() =>
          router.push({ pathname: "/q/[id]/torneo", params: { id: quinielaId } })
        }
      >
        <View className="flex-row items-center gap-2">
          <Text className="font-sans text-lg">🌍</Text>
          <Text className="font-sans font-semibold text-sm text-foreground">
            {linkLabel}
          </Text>
        </View>
        <Text className="font-sans text-sm text-muted-foreground">→</Text>
      </Pressable>

      {/* CTA — espejo del bloque !alreadyJoined de ProgolGeneral.tsx web. Mientras
          el Keychain no resuelve (meToken undefined) no se renderiza nada (evita
          parpadeo). Con token "me" (ya inscrito) tampoco: la web oculta el CTA y
          el BottomNav ya navega a "Mi panel". Progol solo tiene UN mensaje de
          cierre (no hay caso "no quedan lugares"). */}
      {meToken === null ? (
        canJoin ? (
          <FormularioUnirse titulo="🎯 Unirme a la quiniela" alUnirse={unirse} />
        ) : (
          <View className="mt-6 rounded-2xl border border-border bg-card px-4 py-3.5">
            <Text className="text-center font-sans text-sm text-muted-foreground">
              Las inscripciones ya están cerradas.
            </Text>
          </View>
        )
      ) : null}

      <ViewCard
        joinToken={joinToken}
        participantId={viewing}
        onClose={() => setViewing(null)}
      />
    </Shell>
  );
}
