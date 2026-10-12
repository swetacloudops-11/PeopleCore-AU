/**
 * Safely narrow a string (typically from a URL query param) to one of a Prisma
 * enum's values. Returns `undefined` for anything that isn't a real member, so
 * a crafted query string can never reach Prisma and trigger a runtime error.
 */
export function parseEnum<T extends Record<string, string>>(
  enumObject: T,
  value: string | undefined | null
): T[keyof T] | undefined {
  if (!value || value === "ALL") return undefined;
  const values = Object.values(enumObject) as string[];
  return values.includes(value) ? (value as T[keyof T]) : undefined;
}
