// convex/types.ts
export type PlayerStatus = "alive" | "out" | "champion" | "pending";

// How a quiniela hands out teams:
//   on_join   → each player draws their teams the moment they join (default)
//   on_reveal → nobody gets teams until the admin clicks "repartir" (manual, never automatic)
export type AssignMode = "on_join" | "on_reveal";

// Cómo se define el premio:
//   fixed      → texto libre (prizeText), como hasta ahora (default / legacy)
//   per_person → cuota por persona (entryFee); el bote crece con los inscritos
export type PrizeMode = "fixed" | "per_person";

export type PrizeView = {
  mode: PrizeMode;
  text: string;            // fixed: prizeText. per_person: "".
  entryFee: number | null; // per_person: la cuota. fixed: null.
  pool: number | null;     // per_person: entryFee * contributors. fixed: null.
  contributors: number;    // filledCount (relevante en per_person).
};

export type OverviewData = {
  quiniela: { name: string; photoUrl: string | null; prize: PrizeView;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished";
              assignMode: AssignMode };
  players: { participantId: string; name: string; photoUrl: string | null;
             aliveCount: number; totalCount: number; status: PlayerStatus }[];
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
  groups: { group: string;
            rows: { team: TeamLite; points: number; gd: number; gf: number;
                    ownerName: string; ownerPhotoUrl: string | null; alive: boolean }[] }[];
  bracket: { stage: string; label: string;
             matches: { home: { team: TeamLite; owner: string } | null;
                        away: { team: TeamLite; owner: string } | null;
                        homeScore: number | null; awayScore: number | null;
                        winnerTeamId: string | null; status: string }[] }[];
};

export type AdminData = {
  quiniela: { name: string; photoUrl: string | null; prize: PrizeView;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished";
              joinToken: string; assignMode: AssignMode };
  participants: { name: string; personalToken: string; teamCount: number }[];
  matches: { externalId: string; stage: string; label: string;
             homeTeam: TeamLite | null; awayTeam: TeamLite | null;
             homeExternalId: string | null; awayExternalId: string | null;
             homeScore: number | null; awayScore: number | null;
             status: string; winnerExternalId: string | null; manualOverride: boolean }[];
};

export type TeamLite = { code: string; name: string; flag: string; group: string };
