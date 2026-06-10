// convex/types.ts
export type PlayerStatus = "alive" | "out" | "champion" | "pending";

// How a quiniela hands out teams:
//   on_join   → each player draws their teams the moment they join (default)
//   on_reveal → nobody gets teams until the admin clicks "repartir" (manual, never automatic)
export type AssignMode = "on_join" | "on_reveal";

// Modo de juego de una quiniela:
//   clasica → se reparten los 48 equipos; gana el dueño del campeón (default / legacy)
//   progol  → cada jugador pronostica 1/X/2 por partido; gana quien más acierte
export type GameMode = "clasica" | "progol";

// Pronóstico de un partido: local / empate / visitante (1 / X / 2).
export type Pick = "home" | "draw" | "away";

// Cómo se define el premio:
//   fixed      → texto libre (prizeText), como hasta ahora (default / legacy)
//   per_person → cuota por persona (entryFee); el bote crece con los inscritos
export type PrizeMode = "fixed" | "per_person";

export type PrizeView = {
  mode: PrizeMode;
  text: string;            // fixed: prizeText. per_person: "".
  entryFee: number | null; // per_person: la cuota. fixed: null.
  pool: number | null;     // per_person: entryFee * contributors. fixed: null.
  contributors: number;    // per_person: cuántos han PAGADO (definen el bote). fixed: irrelevante.
};

export type OverviewData = {
  quiniela: { name: string; photoUrl: string | null; prize: PrizeView;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished";
              assignMode: AssignMode; notes: string | null };
  players: { participantId: string; name: string; photoUrl: string | null;
             aliveCount: number; totalCount: number; status: PlayerStatus;
             teams: PlayerTeam[] }[];
  freeSlots: number;
  upcomingDuels: { homeOwner: string; homeTeam: TeamLite; awayOwner: string;
                   awayTeam: TeamLite; kickoffAt: number }[];
};

export type PersonalData = {
  quinielaId: string;
  quinielaName: string;
  prize: PrizeView;
  status: "open" | "locked" | "finished";
  joinToken: string;
  me: { name: string; photoUrl: string | null; status: PlayerStatus;
        aliveCount: number; totalCount: number };
  playingNow: { myTeam: TeamLite; opponent: TeamLite; opponentOwner: string;
                kickoffAt: number; status: "live" | "scheduled" }[];
  teams: { team: TeamLite; alive: boolean; group: string;
           nextMatch: { opponent: TeamLite; opponentOwner: string; kickoffAt: number } | null;
           lastResult: string | null }[];
};

export type MundialData = {
  showOwners: boolean;
  groups: { group: string;
            rows: { team: TeamLite; points: number; gd: number; gf: number;
                    ownerName: string; ownerPhotoUrl: string | null; alive: boolean }[] }[];
  bracket: { stage: string; label: string;
             matches: { home: { team: TeamLite; owner: string } | null;
                        away: { team: TeamLite; owner: string } | null;
                        homeScore: number | null; awayScore: number | null;
                        winnerTeamId: string | null; status: string }[] }[];
};

// El torneo de una quiniela, para que la UI adapte vista y labels.
export type TournamentInfo = { code: string; shortName: string; format: "eliminatorio" | "liga" };

// Vista Torneo adaptativa (CONTEXT.md): brackets en eliminatorios, tabla en ligas.
export type TorneoData =
  | ({ kind: "brackets"; tournament: TournamentInfo } & MundialData)
  | { kind: "league"; tournament: TournamentInfo;
      standings: { team: TeamLite; points: number; played: number; gd: number; gf: number }[] };

export type AdminMatchView = {
  externalId: string; stage: string; label: string;
  homeTeam: TeamLite | null; awayTeam: TeamLite | null;
  homeExternalId: string | null; awayExternalId: string | null;
  homeScore: number | null; awayScore: number | null;
  status: string; winnerExternalId: string | null; manualOverride: boolean;
};

export type AdminData = {
  quiniela: { name: string; photoUrl: string | null; prize: PrizeView;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished";
              joinToken: string; assignMode: AssignMode; notes: string | null;
              methodCounts: { efectivo: number; transferencia: number } };
  participants: { id: string; name: string; personalToken: string; teamCount: number; paid: boolean;
                  paymentMethod: "efectivo" | "transferencia" | null }[];
  matches: AdminMatchView[];
};

export type TeamLite = { code: string; name: string; flag: string; group: string };
export type PlayerTeam = { team: TeamLite; alive: boolean };

export type ProgolLeaderRow = {
  participantId: string; name: string; photoUrl: string | null;
  points: number; correct: number; played: number; rank: number;
};

export type ProgolGeneralData = {
  mode: "progol";
  quiniela: { name: string; photoUrl: string | null; prize: PrizeView;
              status: "open" | "locked" | "finished"; filledCount: number; notes: string | null };
  leaderboard: ProgolLeaderRow[];
  decidedMatches: number;
  winnerParticipantIds: string[];
};

export type ProgolMatchView = {
  matchId: string; stage: string; label: string;
  home: TeamLite | null; away: TeamLite | null; kickoffAt: number;
  state: "pending" | "predictable" | "locked" | "finished";
  pick: Pick | null;       // pick del DUEÑO de la tarjeta (mío en getPersonal, suyo en getCard)
  result: Pick | null;     // si finished
  correct: boolean | null; // si finished y había pick
  homeScore: number | null; awayScore: number | null;
};

export type ProgolCardData = {
  mode: "progol";
  quinielaId: string; quinielaName: string; joinToken: string; prize: PrizeView;
  status: "open" | "locked" | "finished";
  who: { participantId: string; name: string; photoUrl: string | null;
         points: number; rank: number; correct: number; played: number };
  stages: { stage: string; label: string; matches: ProgolMatchView[] }[];
};

export type ProgolAdminData = {
  quiniela: { name: string; photoUrl: string | null; prize: PrizeView;
              status: "open" | "locked" | "finished"; joinToken: string; notes: string | null;
              filledCount: number; methodCounts: { efectivo: number; transferencia: number } };
  participants: { id: string; name: string; personalToken: string;
                  points: number; played: number; paid: boolean;
                  paymentMethod: "efectivo" | "transferencia" | null }[];
  matches: AdminMatchView[];
};

export type NotificationItem = {
  id: string; type: string; title: string; body: string; createdAt: number; read: boolean;
};
export type NotificationsData = { items: NotificationItem[]; unreadCount: number };
