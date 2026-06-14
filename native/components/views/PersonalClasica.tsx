// Port nativo del panel personal clásico — "Mi panel" (SEN-25, Tarea F).
// Espejo de la rama Clásica de src/routes/Personal.tsx (la rama Progol y los
// skeletons de LoadingState NO se portan aquí). Una columna read-only: header
// con avatar + nombre + estado + banner de premio, "Jugando ahora / pronto",
// "Mis equipos", y el link al torneo.
//
// Salvedades del port nativo (decididas en el spec):
//   - bg-pitch (rayas blancas tenues, repeating-linear-gradient) NO se porta:
//     uniwind no compila repeating-linear-gradient → deuda decorativa aceptada
//     (como glow-primary). El grano sí va, vía GrainCard.
//   - header-safe (bleed superior PWA iOS) → se omite: el Shell ya aplica el
//     inset superior del safe-area. El header sigue sangrando horizontal (-mx-4 px-4).
//   - animate-rise / animate-pulse → se omiten (uniwind no compila animate-*).
//     El punto "En vivo" queda estático.
//   - Toda cadena va en <Text> con su clase de fuente explícita (no hay cascada
//     en RN). Una <Image> de bandera NO puede vivir dentro de <Text>: las filas
//     que la web embebe inline se componen como filas flex de piezas.
//
// Persistencia (invariante de identidad): la dueña del token es el BottomNav
// (persiste meToken/joinToken en su propio effect). El BottomNav vive en el JSX
// del camino feliz, así que solo monta cuando getPersonalPanel resolvió SIN
// lanzar — un token inválido lanza durante el render y el BottomNav nunca monta,
// preservando "un token inválido nunca se persiste" sin un gate aparte. Esta
// vista NO añade una segunda ruta de persistencia.
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { PersonalData } from "@convex/types";
import { prizeBanner, whenLabel } from "@shared/format";
import { EditableAvatar } from "@/components/EditableAvatar";
import { SectionHeading, PrizeBanner, EmptyTile } from "@/components/bits";
import { GradientFill, GrainCard, gradients } from "@/components/Grain";
import { Cargando } from "@/components/Pantalla";
import { Shell, BottomNav } from "@/components/Shell";
import { StatusBadge } from "@/components/StatusBadge";
import { TeamCard, TeamFlag } from "@/components/TeamCard";

type Props = { quinielaId: string; personalToken: string };

export function PersonalClasica({ quinielaId, personalToken }: Props) {
  // Solo alimenta tournament al BottomNav. La ruta ya tiene esta misma
  // suscripción cacheada, así que resuelve de inmediato; el BottomNav tolera
  // undefined (→ "Mundial").
  const mode = useQuery(api.quinielas.getMode, { id: quinielaId as Id<"quinielas"> });
  const data = useQuery(api.participants.getPersonalPanel, { personalToken });
  const updatePhoto = useMutation(api.participants.updateParticipantPhoto);
  // Se deja propagar el error: EditableAvatar lo registra y revierte el preview
  // optimista (si tragáramos aquí, el avatar mostraría una foto que no se guardó).
  async function onChangePhoto(photoId: Id<"_storage">) {
    await updatePhoto({ personalToken, photoId });
  }

  if (data === undefined) return <Cargando />;

  const { me } = data;
  const statusLabel =
    me.status === "pending"
      ? "En espera del sorteo"
      : me.status === "champion"
        ? "Campeón"
        : me.status === "out"
          ? "Fuera"
          : `Vivo · ${me.aliveCount} ${me.aliveCount === 1 ? "equipo" : "equipos"}`;

  const banner = prizeBanner(data.prize, data.status, " — para el dueño del campeón");

  return (
    <Shell
      bottomNav={
        <BottomNav
          id={quinielaId}
          active="me"
          meToken={personalToken}
          joinToken={data.joinToken}
          tournament={mode?.tournament}
        />
      }
    >
      {/* Header (web <header className="grain bg-pitch header-safe …">). El
          -mx-4 px-4 lo sangra hasta el borde del Shell; bg-pitch / header-safe
          se omiten (ver cabecera del archivo). */}
      <GrainCard className="-mx-4 rounded-b-3xl border-b border-border px-4 pb-6">
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1 flex-row items-center gap-3">
            {/* Anillo de campeón: EditableAvatar lo recibe como ringClassName. */}
            <EditableAvatar
              name={me.name}
              url={me.photoUrl}
              size={48}
              ringClassName={me.status === "champion" ? "rounded-full border-2 border-gold" : undefined}
              onUploaded={onChangePhoto}
            />
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="font-heading text-2xl font-extrabold text-foreground"
              >
                {me.name}
              </Text>
              <Text
                numberOfLines={1}
                className="font-sans text-sm text-muted-foreground"
              >
                {data.quinielaName}
              </Text>
            </View>
          </View>
          <View className="shrink-0 self-start">
            <StatusBadge status={me.status} label={statusLabel} />
          </View>
        </View>
        {banner ? <PrizeBanner title={banner.title} subline={banner.subline} /> : null}
      </GrainCard>

      {me.status === "pending" && (
        <GrainCard className="mt-6 items-center rounded-3xl border border-border bg-card px-5 py-8">
          <Text className="font-sans text-4xl">🎲</Text>
          <Text className="mt-2 font-heading text-lg font-extrabold text-foreground">
            El sorteo aún no empieza
          </Text>
          <Text className="mt-1.5 text-center font-sans text-sm text-muted-foreground">
            Tus equipos aparecerán aquí en cuanto el organizador haga el reparto.
            ¡Prepárate!
          </Text>
        </GrainCard>
      )}

      {me.status !== "pending" && (
        <>
          {/* Jugando ahora / pronto */}
          {data.playingNow.length > 0 && (
            <>
              <SectionHeading>Jugando ahora / pronto</SectionHeading>
              <View className="gap-2.5">
                {data.playingNow.map((g) => (
                  // code es estable y único en playingNow (un equipo juega un
                  // solo partido a la vez), a diferencia de las filas sin id de
                  // las vistas de torneo (que sí usan key={i}).
                  <PlayingNowCard key={g.myTeam.code} g={g} />
                ))}
              </View>
            </>
          )}

          {/* Mis equipos */}
          <SectionHeading>
            Mis equipos{" "}
            <Text className="font-sans font-medium text-foreground/40">
              {me.aliveCount}/{me.totalCount} vivos
            </Text>
          </SectionHeading>
          <View className="gap-2.5">
            {data.teams.length === 0 ? (
              <EmptyTile>Aún no tienes equipos asignados.</EmptyTile>
            ) : (
              data.teams.map((t) => <TeamCard key={t.team.code} t={t} />)
            )}
          </View>
        </>
      )}

      {/* Link al torneo (web /q/:id/mundial → nativo /q/[id]/torneo) */}
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
    </Shell>
  );
}

/**
 * Una tarjeta de "Jugando ahora / pronto". Live: borde alive + el mismo
 * degradado que la web inlinea (gradients.aliveCard, primer hijo). Scheduled:
 * borde/bg planos sin degradado. La web embebe la bandera del rival inline en
 * un <span>; aquí cada fila es una fila flex de piezas (una <Image> no va dentro
 * de <Text>).
 */
function PlayingNowCard({ g }: { g: PersonalData["playingNow"][number] }) {
  const live = g.status === "live";
  return (
    <GrainCard
      className={
        live
          ? "rounded-2xl border border-alive/40 px-3.5 py-3"
          : "rounded-2xl border border-border bg-card px-3.5 py-3"
      }
    >
      {live && <GradientFill {...gradients.aliveCard} />}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <TeamFlag flag={g.myTeam.flag} name={g.myTeam.name} className="text-2xl leading-none" />
          <Text className="font-heading font-bold text-foreground">
            Tu {g.myTeam.name}
          </Text>
        </View>
        {live ? (
          <View className="flex-row items-center gap-1.5">
            <View className="size-1.5 rounded-full bg-alive" />
            <Text className="font-sans text-[0.7rem] font-bold tracking-wide text-alive uppercase">
              En vivo
            </Text>
          </View>
        ) : (
          <Text className="font-sans text-[0.7rem] text-muted-foreground">
            {whenLabel(g.kickoffAt)}
          </Text>
        )}
      </View>
      <View className="mt-1.5 flex-row items-center gap-2">
        <TeamFlag flag={g.opponent.flag} name={g.opponent.name} className="text-lg leading-none" />
        <Text className="flex-shrink font-sans text-sm text-muted-foreground">
          {g.opponent.name} — de{" "}
          <Text className="font-sans font-semibold text-foreground/80">
            {g.opponentOwner}
          </Text>
        </Text>
        <Text className="ml-auto font-sans text-sm text-muted-foreground">⚔️</Text>
      </View>
    </GrainCard>
  );
}
