// convex/types.ts
export type PlayerStatus = "alive" | "out" | "champion";

export type OverviewData = {
  quiniela: { name: string; photoUrl: string | null; prizeText: string;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished" };
  players: { participantId: string; name: string; photoUrl: string | null;
             aliveCount: number; totalCount: number; status: PlayerStatus }[];
  freeSlots: number;
  upcomingDuels: { homeOwner: string; homeTeam: TeamLite; awayOwner: string;
                   awayTeam: TeamLite; kickoffAt: number }[];
};

export type PersonalData = {
  quinielaId: string;
  quinielaName: string;
  prizeText: string;
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
  quiniela: { name: string; photoUrl: string | null; prizeText: string;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished";
              joinToken: string };
  participants: { name: string; personalToken: string; teamCount: number }[];
  matches: { externalId: string; stage: string; label: string;
             homeTeam: TeamLite | null; awayTeam: TeamLite | null;
             homeScore: number | null; awayScore: number | null;
             status: string; manualOverride: boolean }[];
};

export type TeamLite = { code: string; name: string; flag: string; group: string };
