# Performance refactor: implementation handoff

You are picking up a fully specified project. The design is finished and approved; your job is to build it. This file tells you what to read, the rules to work by, and the plan step by step.

## 1. The job in one paragraph

One More Thing is a shared shopping-list app: a NestJS and Postgres backend (`backend/`) and an Expo app (`frontend/`). Today the phone downloads every item a home ever had, on every read, and re-downloads it every few seconds on trip screens. The refactor makes the server send only what a screen shows and only what changed, moves photos out of the database, adds history clean-up tied to a plan, and redesigns the History screens. The backend deploys first and keeps the old endpoints; the app side ships once, as APK version **2.9.3**.

## 2. Read these first, in this order

| File | What it is | How to use it |
| --- | --- | --- |
| `docs/performance-refactor-spec.md` | **The spec.** Every migration with its SQL, every endpoint, the app changes, the tests. | It is the source of truth. Build what it says. |
| `docs/history-redesign-mockup.html` | The approved History and Invoices design, animated. | Open it in a browser. It is the reference for layout, motion and states. |
| `docs/icons-mockup.html` | The icon design for categories and shops: where icons show and the sheet that changes one. | Open it in a browser. |
| `docs/performance-refactor-decisions.md` | Why each decision was made, with measurements. | Read a section when you need the reason behind a rule, or before proposing a change to it. |
| `docs/perf-lab/README.md` | A local test database with 5 million items. | Use it to check query plans (step 12). |
| `frontend/AGENTS.md` | Says to read the Expo SDK 58 docs before writing app code. | Follow it: https://docs.expo.dev/versions/v58.0.0/ |

If the spec and the code disagree about how something works today, the code is right: tell the owner, then fix the spec before building on it.

## 3. What is already approved

- The whole spec, including the ten choices in its section 2.
- Three new backend packages: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `thumbhash`. Any other new package, backend or app, needs the owner's approval first: say what you would add and why.
- Cloudflare R2 on its free tier for photos.
- Reference phone for measurements: Samsung Galaxy A52.

Not approved, do not do: buying anything, moving the server to another region, adding a custom domain, adding billing or a paywall. These are deferred (spec section 11).

## 4. Working rules

1. **Never commit or push** unless the owner asks in that message.
2. **Never run a deploy, an EAS build or an EAS update** unless the owner asks in that message. Steps 20 to 24 each wait for that.
3. **Production is off limits by default.** Read-only queries on the production database are allowed. Anything that changes production (a deploy, an environment variable, a database setting) is asked first.
4. **Secrets never enter the chat, a file in the repository, or a commit.** The owner types the R2 keys into Render personally (spec section 12). Build and test photos with the `fs` storage driver.
5. **After every code change run the checks** and report the real result, including failures:
   - `backend`: `npm test` and `npm run typecheck`
   - `frontend`: `npm run test`, `npm run lint` and `npm run typecheck`
6. **The emulator that is already running belongs to other projects.** Test on a throwaway headless AVD.
7. **Animations:** existing default motion stays untouched. New motion is written as `motionOff ? instant : animated` with `useMotionOff`. React Compiler is on. Cold-start test with Animations on and off.
8. **Version numbers** go up by one per release: this one is 2.9.3, `versionCode` 51.
9. **Backend before app.** The live server rejects fields it does not know, and version 2.9.2 must keep working after every backend change.
10. **Additive only.** Do not remove or change an existing endpoint, column or response field before step 25.
11. **Explain as you go.** The owner is learning database and architecture from this project. When a step introduces a new idea (a trigger, a cursor, an advisory lock), explain it in plain words with a link to real documentation. Reply in English, short and direct.
12. **If something in the spec turns out wrong or unworkable, stop and say so.** Propose the change, get a yes, update the spec, then build. Do not quietly build something different.

## 5. Before you start

- The working tree was clean at commit `6f31097`, except for the files in `docs/`. Check `git status` and tell the owner if there is anything else.
- The local stack runs in Docker: `backend/docker-compose.yml` (Postgres 16 on port 5432, API on 3000). Production is Postgres 18 on Render.
- The lab database `omt_perf` still has experimental columns and indexes from the design phase. Drop and recreate it from the README before step 12, after the migrations exist in the development database.
- Step 1 needs the owner and the Samsung A52. Ask for it at the start; you can do steps 2 to 12 while waiting.

## 6. The plan

Work in this order. A step is done when its "done when" is true and the checks in rule 5 pass. Tell the owner at the end of each step: what changed, the test result, and anything that differed from the spec.

### A. Measure and guard

| # | Step | Spec | Done when |
| --- | --- | --- | --- |
| 1 | Record the app baseline on 2.9.2 on the A52: cold start, tick an item, scroll History, redraws on an idle trip screen. | 8 | Four numbers are written into the decision log. |
| 2 | Request log interceptor, slow-query logging, health check that queries the database, advisory lock on the pins scheduler, `slow-routes` script. | 4.8 | Tests cover the health check failing and the lock letting only one run through. |
| 3 | Wake-up schedule to every 5 minutes. Ask the owner to set up the uptime monitor. | 4.8, 12 | The workflow file is changed; the owner has the monitor steps. |

### B. Database

| # | Step | Spec | Done when |
| --- | --- | --- | --- |
| 4 | Migrations 025 to 029, registered in `app.module.ts`. Run them against a local copy of production data before anything else. | 3.1 to 3.5 | The trigger tests pass; every bought item has a trip; every bought name has a product row; the existing test suites still pass. |
| 5 | The name-key function on the server, with the shared list of test names in both test suites. | 3.4 | Server and app give the same key for every name in the list, Arabic with and without diacritics included. |

### C. Backend features

| # | Step | Spec | Done when |
| --- | --- | --- | --- |
| 6 | The changes endpoint and the `sync` module. | 4.1 | Its tests pass, including "nothing changed", a deletion, and a full copy below `sync_floor`. |
| 7 | Mark bought, undo and price change: attach to a trip, keep `home_products` right. Remove the release-on-read code. | 4.3 | Trip and product tests pass; old endpoints behave as before. |
| 8 | History endpoints: purchases, trips, one trip, month totals, months list, export. | 4.2 | Paging, filter, search and timezone tests pass; month totals match the app's `summarizeSpend` cases. |
| 9 | Plans: the limits table, limits in the home response, sets and pins read their limit from it. | 4.4 | Every home reports the `early` plan with 12 months. |
| 10 | The clean-up job, its endpoint and its daily workflow. | 4.5 | A test home with old data is archived then cleaned; the grace period holds; products are untouched. |
| 11 | Storage layer with `fs` and `s3` drivers, two photo sizes, `thumbhash`, the redirect, migration 030, the copy endpoint. | 3.6, 4.6 | Upload, replace, delete and copy tests pass with the `fs` driver. |
| 11b | Icons for categories and shops on the server: migration 031 and the four endpoints. | 3.7, 4.7 | For both kinds, an emoji and an image can be set, replaced and reset; the old file is deleted; the home's counter moves. |
| 12 | A lab file per new query in `docs/perf-lab/`, then the load test with the Postman CLI against the local API and the lab database. | 8 | Page counts match the spec's measurements; no errors and 95% of requests under 200 ms, recorded in the decision log. |

### D. App

| # | Step | Spec | Done when |
| --- | --- | --- | --- |
| 13 | The sync engine. Remove the full refresh, the lock poll and the asks poll. | 5.1 | Two phones in one home see each other's changes; an idle trip screen makes no redraws; an empty answer leaves the cache untouched. |
| 14 | Suggestions and last prices from products; summary, forecast and recap card from month totals; recap screen loads its two months. | 5.1 | Suggestions and prices match today's results on the same data. |
| 15 | The History and Invoices screens. | 5.2, mockup | Every state in the mockup works: month change, filters, paging, search, trip detail, cleaned month, offline, dark, right-to-left, Animations off, fold layout. |
| 15b | Icons in the app: the icon component, every place it shows, the change sheet, for categories and for shops. | 5.4, mockup | An icon changed on one phone appears on another after a sync; emoji works offline; a deleted category falls back to the default; a shop icon shows on every trip with that name. |
| 16 | Photos: thumbnails in rows, full size in detail, placeholder, cache key. | 5.3 | Photos show from both `db` and `object` storage; the redirect is cached on a device (check this, see spec). |
| 17 | Split the context into data and actions; first screen from the saved copy; fonts embedded. | 5.5 | Ticking an item no longer redraws unrelated components. |
| 18 | Measure again on the A52. | 8 | The four numbers are recorded beside the baseline. Tell the owner which targets are met. |
| 19 | **Cut line.** SQLite tables on the phone. | 5.6 | Its tests pass and offline mode works end to end. If it is not stable, stop, tell the owner, and ship 2.9.3 without it. |

### E. Release 2.9.3

Each of these waits for the owner to ask.

| # | Step | Spec |
| --- | --- | --- |
| 20 | Deploy the backend through the Render API. Confirm the migrations ran and `/api/health` is healthy. Check that 2.9.2 still works against it. | 9 |
| 21 | Owner adds the storage variables in Render; deploy again; call the copy endpoint until none remain; check a photo from a 2.9.2 phone. | 4.6, 12 |
| 22 | Version 2.9.3, `versionCode` 51, and the "What's new" text from spec section 6. | 6 |
| 23 | Build the APK. Test on a throwaway emulator and the A52, Animations on and off. | 9 |
| 24 | Point `APP_LATEST_VERSION` and `APP_DOWNLOAD_URL` at the new APK. | 9 |

### F. Afterwards

| # | Step | Spec |
| --- | --- | --- |
| 25 | When 2.9.2 requests have stopped for two weeks, or the owner decides: raise `APP_MIN_VERSION`, remove the old endpoints, run the `CleanUp` migration. | 3.8, 10 |

## 7. Things the spec asks you to check during the build

- Whether a scanned receipt leaves any trace in the database. If not, the "Scanned" tag is dropped from the receipt card.
- Whether `expo-image` follows the redirect and caches under the `cacheKey`. If not, use the fallback in spec section 5.3.
- That `create index concurrently` runs outside a transaction in the TypeORM migration.
- The real values of `SET_LIMIT` and `PIN_LIMIT` for the plan table.
- That `DATABASE_URL` in Render is the internal address, before the owner closes the database to the internet.

## 8. Known facts that save time

- Render does not deploy on `git push`; deploys are triggered through the Render API or connector (service id `srv-daqkcbvlot8c73evonpg`).
- An EAS update ignores the build environment in `eas.json`: `EXPO_PUBLIC_API_URL` must be passed inline, or phones call localhost.
- The free Render server sleeps after 15 idle minutes and takes about 22 seconds to wake; a test request that seems to hang is probably that.
- Production is small: 25 users, 18 homes, 399 items, 8 photos, 10 MB. Migrations there take seconds.
