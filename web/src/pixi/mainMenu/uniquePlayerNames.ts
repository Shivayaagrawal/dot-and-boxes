/**
 * Duplicate display names become "Name", then "Name(2)", "Name(3)" — stable UX for lobby slots.
 */
export function assignUniqueDisplayNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((raw) => {
    const base = raw.trim() || "Player";
    const next = (seen.get(base) ?? 0) + 1;
    seen.set(base, next);
    if (next === 1) return base;
    return `${base}(${next})`;
  });
}
