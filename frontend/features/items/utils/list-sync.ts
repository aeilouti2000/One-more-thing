type Listener = () => void;

const listeners = new Set<Listener>();

export function onListChanged(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitListChanged() {
  for (const listener of listeners) listener();
}

type FocusListener = (homeId: string, listId: string) => void;

const focusListeners = new Set<FocusListener>();

/** Ask the Items screen to show a list (opened from a notification). */
export function onFocusList(listener: FocusListener) {
  focusListeners.add(listener);
  return () => {
    focusListeners.delete(listener);
  };
}

export function emitFocusList(homeId: string, listId: string) {
  for (const listener of focusListeners) listener(homeId, listId);
}
