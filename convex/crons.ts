// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("sync active tournaments", { minutes: 5 }, internal.sync.syncMatches, {});
export default crons;
