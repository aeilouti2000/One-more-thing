/**
 * The value every item has in common, or undefined when they differ (or there
 * are no items). Used to highlight the current choice for a multi-selection.
 */
export function sharedValue<T, V>(
  items: readonly T[],
  pick: (item: T) => V,
): V | undefined {
  if (items.length === 0) return undefined;
  const first = pick(items[0]);
  return items.every((item) => pick(item) === first) ? first : undefined;
}

/** True when every one of these ids is already selected (and there is at least one). */
export function allSelected(
  ids: readonly string[],
  selected: ReadonlySet<string>,
) {
  return ids.length > 0 && ids.every((id) => selected.has(id));
}
