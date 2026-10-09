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
