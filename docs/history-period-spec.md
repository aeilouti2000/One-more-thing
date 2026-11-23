# History period: spec

Status: ready to implement. Written 2026-11-24, after release 2.9.3.
Mockup: `docs/history-period-mockup.html`.

## 1. What this is

Each home chooses how long its History is kept: **3, 6 or 12 months**. The host chooses; everyone in the home shares the choice. The default is **3 months**. There is no "Never".

Until now the period came only from the home's plan (`PLANS.early.historyMonths = 12`, `backend/src/modules/plans/plans.ts`). The plan stays as the **upper limit**: a home can choose any offered period up to what its plan allows.

"N months" keeps the meaning the plan already has: **the current month and the N months before it**, in the home's time zone. Older months lose their purchases and keep only their saved totals (`home_months`, `home_month_categories`), exactly as the clean-up job does today.

Never deleted, whatever the period: items still to buy, pins, sets, lists, products (suggestions and last prices), month totals.

## 2. Decisions

| # | Decision | Why |
| --- | --- | --- |
| E1 | Options 3, 6, 12 months; default 3. Options above the plan's `historyMonths` are not offered and are refused by the server. | Owner's choice. The phone holds this month and last month, so nothing below 3 is offered. |
| E2 | **Existing homes also move to 3 months**, but only after a 30-day notice period starting at the deploy. During those 30 days they keep 12 months, and the app shows a notice with the date. | Owner: "the default will be 3 months". Nobody loses data without 30 days to change it. |
| E3 | **Shortening never deletes at once.** For 30 days after a change to a shorter period the old, longer period stays in force. The host can go back at any time in those 30 days and nothing is lost. | Deleting is the one step that cannot be undone. |
| E4 | Lengthening takes effect at once and cancels a pending shortening. Purchases already deleted do not come back. | |
| E5 | What History shows and what the job deletes use the **same** period (the one in force). | A month must never be hidden while its rows still exist, or shown after they are gone. |
| E6 | Host only, like the cost and trip settings. Other members see the choice, locked. | Existing rule for shared home settings. |

If the owner changes E2 to "existing homes stay on 12 months, only new homes start on 3": in migration 033 set `history_months = 12` for existing rows and leave the two pending columns null. Nothing else changes.

## 3. Database: migration 033 `HistoryPeriod`

File `backend/src/database/migrations/1740000000033-HistoryPeriod.ts`, added to `MIGRATIONS` in `index.ts`.

```sql
alter table homes
  add column history_months smallint not null default 3
    constraint homes_history_months_check check (history_months in (3, 6, 12)),
  add column history_months_before smallint
    constraint homes_history_months_before_check check (history_months_before in (3, 6, 12)),
  add column history_months_changed_at timestamptz;

-- E2: homes that exist today keep 12 months for the notice period.
update homes set history_months_before = 12, history_months_changed_at = now();
```

Run the `update` with `set local omt.skip_sync = 'on'` if the home triggers would otherwise bump every home's version (check `omt_bump_home` / the triggers of migration 025; a bump is harmless but not needed, since every phone gets the home again with its next answer anyway. Decide by reading the trigger, and say which in `build-progress.md`).

`down`: drop the three columns.

Entity `Home` (`backend/src/modules/homes/entities/home.entity.ts`): `historyMonths`, `historyMonthsBefore`, `historyMonthsChangedAt`.

## 4. Backend

### 4.1 One function decides the period

New file `backend/src/modules/plans/history-period.ts` (pure, unit tested):

```ts
export const HISTORY_PERIODS = [3, 6, 12] as const;
export const DEFAULT_HISTORY_MONTHS = 3;
export const HISTORY_NOTICE_DAYS = 30;   // maintenance's GRACE_DAYS should read this, one number

export type HistoryPeriod = {
  /** What the host chose. */
  chosen: number;
  /** In force now: what History shows and what the job keeps. */
  months: number;
  /** A shorter period waiting for its date; null when none. */
  pending: { months: number; from: Date } | null;
  /** What this home may choose (the offered periods up to the plan's limit). */
  options: number[];
};

export function historyPeriodOf(home: {
  historyMonths: number;
  historyMonthsBefore: number | null;
  historyMonthsChangedAt: Date | null;
}, planMonths: number, now = new Date()): HistoryPeriod
```

Rules:

- `options` = `HISTORY_PERIODS` filtered to `<= planMonths` (if that is empty, `[planMonths]`).
- `chosen` = `min(home.historyMonths, planMonths)`.
- Waiting = `historyMonthsBefore` is set, `historyMonthsChangedAt` is set, `min(before, planMonths) > chosen`, and `now < changedAt + 30 days`.
- Waiting: `months = min(before, planMonths)`, `pending = { months: chosen, from: changedAt + 30 days }`.
- Otherwise: `months = chosen`, `pending = null`.

Every place that reads `plan.limits.historyMonths` to cut or clean history now uses `historyPeriodOf(...).months`:

- `HistoryService.access()` (`backend/src/modules/history/history.service.ts`) and whatever builds `cutoffMonth` for the months list.
- `MaintenanceService.cleanHome()` (`backend/src/modules/maintenance/maintenance.service.ts`): add the three columns to the home rows it loads. The existing rule "skip the home for 30 days after `plan_changed_at`" stays as it is.
- Grep for `historyMonths` to find any other reader. `PlanLimits.historyMonths` itself stays (it is the limit).

### 4.2 The home answer

The home view (`typeorm-homes.repository.ts`, where `plan: planOf(home)` is built; type in `homes.repository.ts`) gains:

```json
"history": { "chosen": 3, "months": 12, "pending": { "months": 3, "from": "2026-12-24T…Z" }, "options": [3, 6, 12] }
```

It therefore also arrives in the changes answer's `home`. Old apps ignore it.

### 4.3 Changing it

`PATCH /api/homes/:homeId/history-settings`, body `{ "historyMonths": 3 | 6 | 12 }` (`UpdateHistorySettingsDto`, `@IsIn(HISTORY_PERIODS)`). Returns the home, like the other settings routes. Service method `HomesService.updateHistorySettings`:

- Not the host: 403 `ONLY_HOST_CAN_UPDATE_HISTORY`.
- Value above the plan's limit: refuse with the code the plan limits already use for "your plan does not allow this" (follow `SET_LIMIT` in `sets.service.ts`; name it `HISTORY_PERIOD_LIMIT`).
- Let `inForce = historyPeriodOf(home).months` and `next` the new value.
  - `next` equals the value already chosen: change nothing.
  - `next < inForce`: `history_months = next`, `history_months_before = inForce`, `history_months_changed_at = now()`.
  - `next >= inForce`: `history_months = next`, `history_months_before = null`, `history_months_changed_at = null`.

Because the period in force during a notice is never more than the plan's limit, changing back and forth can delay a clean-up but can never keep more than the plan allows.

The change must reach the other members the same way a cost-settings change does (check how `updateCostSettings` gets into the next changes answer and do the same).

### 4.4 Tests

Unit (`history-period.spec.ts`): default; waiting and after the date; lengthening; plan limit below the choice; plan limit below `before`; options list.

Database (`npm run test:db`):

- `history-settings`: host only; value validation; refused above the plan limit; shorten sets the pending fields; lengthen clears them; same value changes nothing; the answer carries `history`.
- Clean-up (`maintenance.db-spec.ts`): a home on 3 months with purchases 2, 4 and 7 months old loses the 4 and 7 month ones and keeps their totals; a home that shortened 12 → 3 less than 30 days ago loses nothing younger than 12 months; after 30 days it does.
- History (`history.db-spec.ts`): months list marks months older than the period in force as `archived`; purchases of such a month are not listed; during a notice the older months are still `live`.
- Migration: existing homes get `history_months = 3`, `before = 12`, a change date; a home created afterwards gets 3 and no pending.

## 5. App

Type `Household` (`frontend/features/homes/types/household.ts`) gains `history: { chosen: number; months: number; pending: { months: number; from: string } | null; options: number[] }`. A server that does not send it (older backend) means: hide the setting.

### 5.1 Home settings row

`home-settings-screen.tsx`: a new `SettingsLinkCard` after "Shopping trips": icon `time-outline`, title "History", body "Keeps 3 months" (or, while a change waits, "Keeps 12 months · 3 months from 24 Dec"). Opens `/settings/history`.

### 5.2 History settings screen

New route `frontend/app/(tabs)/settings/history.tsx` and `features/settings/components/history-settings-screen.tsx`, built like `trips-settings-screen.tsx` (same `Screen`, `ScreenHeader`, `SettingsSection`, `CardBlock`, `HostOnly`, `HostLockPill`, `ToastMessage`; register it wherever the settings stack and the tablet split list its screens).

- Card "Keep history for": three radio chips from `history.options` ("3 months", "6 months", "12 months"), the chosen one filled. Under them: "This month and the 3 months before it. Older months keep only their totals."
- Card "What is never removed": items still to buy, pins and sets, suggestions and last prices, month totals.
- While a change waits: a notice card "From 24 Dec, History keeps 3 months. Purchases before 1 September will be removed." with a button "Keep 12 months" (host), which sends the old value back.
- Choosing a **shorter** period opens a confirmation sheet first: "Keep 3 months?" / "Purchases before 1 September will be removed on 24 December. Month totals stay. You can change this back until then." / buttons "Keep 3 months" and "Cancel". Choosing a longer one saves at once.
- Not the host: chips disabled, `HostLockPill`, the existing "only the host" behaviour of `HostOnly`.
- The date a period removes from: first day of (the month of `from`, minus `months`), shown in the home's own month names (reuse the History month formatting). Put this in a small pure helper with tests.

Saving: a new change `home.historySettings` beside `home.tripSettings` in `features/homes/api/homes.ts` (`defineChange`, so it also waits in the outbox when offline), with the same optimistic update of the household the other settings do. Optimistic rule on the phone: mirror 4.3 so the screen is right before the answer arrives.

### 5.3 Notice in History

`history-screen.tsx` / `purchases-page.tsx`: while `history.pending` is set, show one `HistoryNote`-style card at the top of the Purchases page: "From 24 Dec, History keeps 3 months. Older purchases will be removed; month totals stay." with "Change" (host: opens `/settings/history`) or "Only the host can change this" (others). It can be closed; closing is remembered on the phone per `pending.from`, so a new change shows it again.

In `MonthArchiveCard`, when the home could keep more (`history.chosen` is below the largest option) and the user is the host, add a small link "Keep more months" to the same screen.

### 5.4 Texts

All new texts in `constants/i18n.ts`, English and Arabic. Add the feature to `features/settings/data/about-content.ts` (features list, `since` = the release version) and one "What's new" line. No on/off switch: the setting is the feature.

### 5.5 Tests

Unit tests for the date helper and the optimistic rule; the existing suites (`npm run test`, `npm run lint`, `npm run typecheck`) stay clean.

## 6. Release

1. Backend first: migration 033 and the new route are invisible to 2.9.2 and 2.9.3 (they ignore the new field). Rehearse the migration on a fresh private copy of production (delete `push_tokens` in the copy before starting a server on it).
2. App: JavaScript only, no new native module, so it can go out as an OTA update or inside the next APK. Version 2.9.4, versionCode 52.
3. The 30 days of E2 start when migration 033 runs. Users who have not updated the app by then see no notice, so ship the app update close to the backend deploy.

Nothing in section 6 is done without the owner asking for it in that message.
