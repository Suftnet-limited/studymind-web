/** Up to two initials from a display name ("Abel Aghorighor" -> "AA", "Abel" -> "AB"); empty when the name is unknown. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : parts[0][1] ?? '')).toUpperCase();
}
