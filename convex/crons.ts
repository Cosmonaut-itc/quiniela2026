// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("sync active tournaments", { minutes: 5 }, internal.sync.syncMatches, {});
crons.interval("sync live lineups", { minutes: 5 }, internal.lineups.syncLineups, {});
export default crons;
