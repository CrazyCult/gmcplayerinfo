/** SQLite treats ?1/?2 as named parameters; D1 accepts a positional array. */
export function sqliteBindings(query: string, args: unknown[]): never[] {
  const names = [...new Set(query.match(/\?\d+/g) ?? [])];
  return (
    names.length
      ? [
          Object.fromEntries(
            names.map((name) => [name, args[Number(name.slice(1)) - 1]]),
          ),
        ]
      : args
  ) as never[];
}
