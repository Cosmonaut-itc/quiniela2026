/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as lib_distribution from "../lib/distribution.js";
import type * as lib_footballData from "../lib/footballData.js";
import type * as lib_matchSelect from "../lib/matchSelect.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_perQuiniela from "../lib/perQuiniela.js";
import type * as lib_push from "../lib/push.js";
import type * as lib_resolve from "../lib/resolve.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_tournament from "../lib/tournament.js";
import type * as lib_view from "../lib/view.js";
import type * as matches from "../matches.js";
import type * as mundial from "../mundial.js";
import type * as notifications from "../notifications.js";
import type * as participants from "../participants.js";
import type * as progol from "../progol.js";
import type * as push from "../push.js";
import type * as quinielas from "../quinielas.js";
import type * as seed from "../seed.js";
import type * as sync from "../sync.js";
import type * as types from "../types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  "lib/distribution": typeof lib_distribution;
  "lib/footballData": typeof lib_footballData;
  "lib/matchSelect": typeof lib_matchSelect;
  "lib/notify": typeof lib_notify;
  "lib/perQuiniela": typeof lib_perQuiniela;
  "lib/push": typeof lib_push;
  "lib/resolve": typeof lib_resolve;
  "lib/tokens": typeof lib_tokens;
  "lib/tournament": typeof lib_tournament;
  "lib/view": typeof lib_view;
  matches: typeof matches;
  mundial: typeof mundial;
  notifications: typeof notifications;
  participants: typeof participants;
  progol: typeof progol;
  push: typeof push;
  quinielas: typeof quinielas;
  seed: typeof seed;
  sync: typeof sync;
  types: typeof types;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
