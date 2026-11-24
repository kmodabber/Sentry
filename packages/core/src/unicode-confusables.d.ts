// unicode-confusables@0.1.1 ships its type file as "index.ts.d" instead of "index.d.ts", so
// TypeScript never finds it. Declared here to match its real exports (checked against
// node_modules/unicode-confusables/index.ts.d).
declare module "unicode-confusables" {
  export interface ConfusablePoint {
    point: string;
    similarTo?: string;
  }
  export const isConfusing: (input: string) => boolean;
  export const confusables: (input: string) => ConfusablePoint[];
  export const rectifyConfusion: (input: string) => string;
}
