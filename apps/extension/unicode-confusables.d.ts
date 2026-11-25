// Duplicated from packages/core/src/unicode-confusables.d.ts: apps/extension's tsc program
// doesn't include packages/core/src files, only resolve them as imports, so an ambient
// declaration there has no effect here. unicode-confusables@0.1.1 ships its type file as
// "index.ts.d" instead of "index.d.ts", so TypeScript never finds it on its own.
declare module "unicode-confusables" {
  export interface ConfusablePoint {
    point: string;
    similarTo?: string;
  }
  export const isConfusing: (input: string) => boolean;
  export const confusables: (input: string) => ConfusablePoint[];
  export const rectifyConfusion: (input: string) => string;
}
