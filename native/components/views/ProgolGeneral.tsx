// Vista mínima de la general Progol (espejo de src/routes/progol/
// ProgolGeneral.tsx): datos reales en crudo + flujo de inscripción end-to-end
// (sin foto, llega con SEN-25). SEN-26 la reemplaza por el port real.
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { Button } from "heroui-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import { FormularioUnirse } from "@/components/FormularioUnirse";
import { GrainCard } from "@/components/Grain";
import { Cargando, Pantalla } from "@/components/Pantalla";
import { getToken, setToken } from "@/lib/storage";

type Props = { quinielaId: string; joinToken: string };

export function ProgolGeneral({ quinielaId, joinToken }: Props) {
  const data = useQuery(api.progol.getGeneral, { joinToken });
  const join = useMutation(api.participants.joinQuiniela);

  // "Ya inscrito en este dispositivo" = existe token "me" en Keychain (espejo
  // del readStoredToken síncrono de la web).
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

  // Espejo del effect del BottomNav web (Shell.tsx): persistir el join token,
  // pero solo cuando la query resolvió — un token inválido no se persiste
  // (en la web el BottomNav solo monta en éxito).
  const loaded = data !== undefined;
  useEffect(() => {
    if (!loaded) return;
    void setToken(quinielaId, "join", joinToken);
  }, [loaded, quinielaId, joinToken]);

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
    <Pantalla>
      <Text className="font-heading font-bold text-2xl text-foreground">
        {quiniela.name}
      </Text>
      <Text className="mt-1 font-sans text-sm text-muted-foreground">
        {quiniela.filledCount}{" "}
        {quiniela.filledCount === 1 ? "jugador" : "jugadores"} · {statusLabel}
      </Text>

      <GrainCard className="mt-5 rounded-2xl border border-border bg-card px-4 py-3">
        <Text className="font-sans font-bold text-sm text-foreground">
          Tabla de posiciones · {data.decidedMatches} jugados
        </Text>
        {data.leaderboard.length === 0 ? (
          <Text className="mt-2 font-sans text-sm text-muted-foreground">
            Aún no se inscribe nadie.
          </Text>
        ) : (
          data.leaderboard.map((row) => (
            <View
              key={row.participantId}
              className="mt-2 flex-row items-center justify-between"
            >
              <Text className="font-sans text-sm text-foreground">
                #{row.rank} {row.name}
              </Text>
              <Text className="font-sans text-sm text-muted-foreground">
                {row.points} pts
              </Text>
            </View>
          ))
        )}
      </GrainCard>

      {/* Sección CTA — espejo del bloque !alreadyJoined de ProgolGeneral.tsx
          web; mientras el Keychain no resuelve (meToken undefined) no se
          renderiza nada. */}
      {meToken !== undefined &&
        (meToken ? (
          // Nativo aún no tiene BottomNav: sin este botón, reabrir un join
          // link ya consumido sería un callejón sin salida.
          <Button
            variant="primary"
            className="mt-6 h-12 w-full rounded-2xl"
            onPress={() =>
              router.push({
                pathname: "/q/[id]/me/[token]",
                params: { id: quinielaId, token: meToken },
              })
            }
          >
            <Button.Label className="font-sans font-bold text-base text-primary-foreground">
              Ir a Mi panel
            </Button.Label>
          </Button>
        ) : canJoin ? (
          <FormularioUnirse titulo="🎯 Unirme a la quiniela" alUnirse={unirse} />
        ) : (
          <View className="mt-6 rounded-2xl border border-border bg-card px-4 py-3.5">
            <Text className="text-center font-sans text-sm text-muted-foreground">
              Las inscripciones ya están cerradas.
            </Text>
          </View>
        ))}
    </Pantalla>
  );
}
