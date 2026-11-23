/**
 * Loads every file that defines a kind of change (see `defineChange`), so a
 * change saved on the phone by an earlier run always finds the code that sends
 * it. Import this wherever the app starts: the root layout and the widget's
 * background run.
 */
import "@/features/homes/api/homes";
import "@/features/items/api/categories";
import "@/features/items/api/items";
import "@/features/items/api/lists";
import "@/features/items/api/pins";
import "@/features/items/api/sets";
import "@/features/notifications/api/preferences";
import { emitListChanged } from "@/features/items/utils/list-sync";
import { onOutboxEvent, resumeOutbox } from "@/features/offline/outbox";

// The waiting changes were sent (or the connection is back): every screen
// showing a list loads the server's version.
onOutboxEvent((event) => {
  if (event.type === "settled") emitListChanged();
});

// Changes left from the last run start going out now.
resumeOutbox();
