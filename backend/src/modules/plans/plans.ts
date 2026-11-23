import { SET_LIMIT } from "../items/entities/item-set.entity";
import { PIN_LIMIT } from "../items/entities/pin.entity";

/**
 * What each plan allows. A home's plan is a row value (homes.plan), so a
 * billing service can change it later without any code change; the server
 * checks every limit itself and sends the limits to the app to show locks.
 *
 * Until billing exists every home is on "early": 12 months of history and the
 * limits the app had before plans, so no current user meets a new limit.
 */
export type PlanLimits = {
  /** Months of purchases kept before the current one; older months keep only their totals. */
  historyMonths: number;
  /** Item photos per home; null: no limit. */
  photosPerHome: number | null;
  /** Uploaded icon images per home (emoji icons are not limited). */
  iconImages: number;
  sets: number;
  pinsPerList: number;
};

export const PLANS = {
  early: { historyMonths: 12, photosPerHome: null, iconImages: 100, sets: SET_LIMIT, pinsPerList: PIN_LIMIT },
} as const satisfies Record<string, PlanLimits>;

export type PlanId = keyof typeof PLANS;

/** The plan a home falls back to when its plan is unknown or has ended. */
export const DEFAULT_PLAN: PlanId = "early";

export type HomePlan = { id: PlanId; until: Date | null; limits: PlanLimits };

export function planOf(home: { plan?: string | null; planUntil?: Date | null }, now = new Date()): HomePlan {
  const known = home.plan && home.plan in PLANS ? (home.plan as PlanId) : DEFAULT_PLAN;
  const ended = home.planUntil && home.planUntil.getTime() <= now.getTime();
  const id = ended ? DEFAULT_PLAN : known;
  return { id, until: ended ? null : (home.planUntil ?? null), limits: PLANS[id] };
}
