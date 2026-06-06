// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("sync world cup matches", { minutes: 5 }, internal.sync.syncMatches, {});
export default crons;
