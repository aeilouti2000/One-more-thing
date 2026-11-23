// Stands in for expo-sqlite's localStorage in `node --test`: kept in memory,
// with someone signed in so the offline cache has an owner.
const data = new Map([["omt.session", JSON.stringify({ user: { id: "test-user" } })]]);
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
  },
});
