export const omitUndefinedProperties = <A extends Readonly<Record<string, unknown>>>(
  input: A,
): { readonly [K in keyof A]?: Exclude<A[K], undefined> } =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as {
    readonly [K in keyof A]?: Exclude<A[K], undefined>;
  };
