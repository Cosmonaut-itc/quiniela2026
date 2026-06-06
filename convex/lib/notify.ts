import type { MatchRow, TeamState } from "./tournament";

export type Audience = "participant" | "admin";

export type NotifyIntent = {
  quinielaId: string;
  audience: Audience;
  participantId: string | null;
  type: string;
  title: string;
  body: string;
  matchId: string | null;
  teamId: string | null;
  dedupeKey: string;
};

/** Clave determinista de emite-una-vez. `ref` distingue por partido/equipo; `recipient`
 *  por destinatario ("admin" si es del admin). */
export function dedupeKey(quinielaId: string, type: string, ref: string | null, recipient: string | null): string {
  return `${quinielaId}:${type}:${ref ?? ""}:${recipient ?? "admin"}`;
}

type TeamLite = { id: string; name: string; flag: string };

export type SyncInput = {
  quinielaId: string;
  now: number;
  soonMs: number;
  tournamentStarted: boolean;
  teamById: Map<string, TeamLite>;
  effMatches: MatchRow[];
  states: Map<string, TeamState>;
  ownerByTeam: Map<string, string>; // teamId -> participantId
  participants: { id: string; teamCount: number }[];
};

export function detectSyncEvents(input: SyncInput): NotifyIntent[] {
  const { quinielaId: q, now, soonMs, tournamentStarted, teamById, effMatches, states, ownerByTeam, participants } = input;
  const out: NotifyIntent[] = [];
  const label = (id: string | null) => {
    const t = id ? teamById.get(id) : undefined;
    return t ? `${t.flag} ${t.name}` : "tu equipo";
  };

  if (tournamentStarted) {
    for (const p of participants) {
      out.push({
        quinielaId: q, audience: "participant", participantId: p.id, type: "tournament_started",
        title: "¡Arrancó el Mundial! ⚽", body: "Sigue a tus equipos en tu panel.",
        matchId: null, teamId: null, dedupeKey: dedupeKey(q, "tournament_started", null, p.id),
      });
    }
  }

  for (const mt of effMatches) {
    const pairs: [string | null, string | undefined][] = [
      [mt.homeTeamId, mt.homeTeamId ? ownerByTeam.get(mt.homeTeamId) : undefined],
      [mt.awayTeamId, mt.awayTeamId ? ownerByTeam.get(mt.awayTeamId) : undefined],
    ];

    if (mt.status !== "finished" && mt.kickoffAt >= now && mt.kickoffAt <= now + soonMs) {
      for (const [teamId, owner] of pairs) {
        if (!teamId || !owner) continue;
        const oppId = teamId === mt.homeTeamId ? mt.awayTeamId : mt.homeTeamId;
        out.push({
          quinielaId: q, audience: "participant", participantId: owner, type: "match_soon",
          title: `Pronto juega ${label(teamId)}`, body: `vs ${label(oppId)}`,
          matchId: mt._id, teamId, dedupeKey: dedupeKey(q, "match_soon", `${mt._id}:${teamId}`, owner),
        });
      }
    }

    if (mt.status === "finished" && mt.homeScore != null && mt.awayScore != null) {
      for (const [teamId, owner] of pairs) {
        if (!teamId || !owner) continue;
        const verb = mt.winnerTeamId === teamId ? "ganó" : mt.winnerTeamId ? "perdió" : "empató";
        out.push({
          quinielaId: q, audience: "participant", participantId: owner, type: "match_result",
          title: `${label(teamId)} ${verb}`, body: `Marcador: ${mt.homeScore}–${mt.awayScore}`,
          matchId: mt._id, teamId, dedupeKey: dedupeKey(q, "match_result", `${mt._id}:${teamId}`, owner),
        });
      }
    }
  }

  let championOwner: string | null = null;
  for (const [teamId, st] of states) {
    if (st.currentStage === "champion") {
      const owner = ownerByTeam.get(teamId);
      if (owner) {
        championOwner = owner;
        out.push({
          quinielaId: q, audience: "participant", participantId: owner, type: "champion_won",
          title: "🏆 ¡Ganaste!", body: `${label(teamId)} es campeón. ¡El premio es tuyo!`,
          matchId: null, teamId, dedupeKey: dedupeKey(q, "champion_won", null, owner),
        });
      }
    }
  }

  for (const [teamId, owner] of ownerByTeam) {
    const st = states.get(teamId);
    if (st && !st.alive && st.currentStage === "out") {
      out.push({
        quinielaId: q, audience: "participant", participantId: owner, type: "team_eliminated",
        title: `${label(teamId)} quedó eliminado`, body: "Salió del torneo.",
        matchId: null, teamId, dedupeKey: dedupeKey(q, "team_eliminated", teamId, owner),
      });
    }
  }

  for (const p of participants) {
    if (p.id === championOwner) continue;
    const myTeams = [...ownerByTeam.entries()].filter(([, o]) => o === p.id).map(([t]) => t);
    if (myTeams.length === 0) continue;
    const anyAlive = myTeams.some((t) => states.get(t)?.alive);
    if (!anyAlive) {
      out.push({
        quinielaId: q, audience: "participant", participantId: p.id, type: "disqualified",
        title: "Quedaste fuera 😕", body: "Todos tus equipos salieron del torneo.",
        matchId: null, teamId: null, dedupeKey: dedupeKey(q, "disqualified", null, p.id),
      });
    }
  }

  return out;
}

export function teamsAssignedNotice(quinielaId: string, participantId: string, teamCount: number): NotifyIntent {
  return {
    quinielaId, audience: "participant", participantId, type: "teams_assigned",
    title: "¡Ya tienes tus equipos! 🎲",
    body: `Te tocaron ${teamCount} ${teamCount === 1 ? "equipo" : "equipos"}. Míralos en tu panel.`,
    matchId: null, teamId: null, dedupeKey: dedupeKey(quinielaId, "teams_assigned", null, participantId),
  };
}

export function quinielaClosedNotice(quinielaId: string, participantId: string): NotifyIntent {
  return {
    quinielaId, audience: "participant", participantId, type: "quiniela_closed",
    title: "La quiniela se cerró 🔒", body: "Ya están repartidos todos los equipos. ¡Suerte!",
    matchId: null, teamId: null, dedupeKey: dedupeKey(quinielaId, "quiniela_closed", null, participantId),
  };
}

export function playerJoinedNotice(quinielaId: string, joinerName: string, participantId: string): NotifyIntent {
  return {
    quinielaId, audience: "admin", participantId: null, type: "player_joined",
    title: "Nuevo participante 👋", body: `${joinerName} se unió a tu quiniela.`,
    matchId: null, teamId: null, dedupeKey: dedupeKey(quinielaId, "player_joined", participantId, null),
  };
}

export function readyToDistributeNotice(quinielaId: string): NotifyIntent {
  return {
    quinielaId, audience: "admin", participantId: null, type: "ready_to_distribute",
    title: "¡Ya están todos! ✅", body: "Tu quiniela está llena; puedes repartir o cerrar.",
    matchId: null, teamId: null, dedupeKey: dedupeKey(quinielaId, "ready_to_distribute", null, null),
  };
}
