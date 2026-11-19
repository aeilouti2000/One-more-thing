/** "milk, bread\neggs" → ["milk", "bread", "eggs"], at most ten. */
export function splitNames(text: string) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of text.split(/[,،;\n]+/)) {
    const name = part.trim().replace(/\s+/g, " ").slice(0, 120);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length === 10) break;
  }
  return names;
}
