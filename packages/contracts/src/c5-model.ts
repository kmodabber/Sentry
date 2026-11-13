/**
 * C5. Model file (model.json). Owners: Ethan Rajack and Mo. Doc 05, section 3.
 *
 * Written by the Python training code (ml/), read by the extension (FR-28).
 * The feature list itself lives in @sentry-ext/features (spec.ts); a model is only valid
 * for the feature list whose fingerprint matches its specHash.
 *
 * v0 (Nov 2026): the logistic regression shape is final for the Stage 2 baseline.
 * The gbdt shape is a draft until the Stage 3 model choice (FR-26).
 */

/** Maps the raw model score to a probability, so 0.8 means about 80% (doc 02). */
export type Calibration =
  | { method: "platt"; a: number; b: number } // p = 1 / (1 + exp(-(a * raw + b)))
  | { method: "isotonic"; x: number[]; y: number[] } // piecewise-linear, x ascending
  | { method: "none" };

interface ModelBase {
  /** Release date of this model, e.g. "2026-12-01". */
  version: string;
  /** SHA-256 of the feature spec the model was trained on (SPEC_HASH in @sentry-ext/features). */
  specHash: string;
  /** Human-readable data range, e.g. "PhreshPhish train, 2024-07 to 2025-08". */
  trainedOn: string;
  /** Calibrated probability at or above which the ML check reports phishing. Set on validation, never on test. */
  threshold: number;
  calibration: Calibration;
}

export interface LogRegModel extends ModelBase {
  type: "logreg";
  /** One weight per feature, in spec order. */
  weights: number[];
  intercept: number;
  /** Feature standardisation used in training: z = (x - mean) / std, one entry per feature. */
  scaler: { mean: number[]; std: number[] };
}

/** A tree node: either a split or a leaf. Children are indexes into `nodes`. */
export type GbdtNode =
  | { feature: number; threshold: number; left: number; right: number } // x[feature] <= threshold goes left
  | { leaf: number };

export interface GbdtModel extends ModelBase {
  type: "gbdt";
  /** At most 200 small trees (doc 02); the raw score is baseScore plus the sum of leaf values. */
  baseScore: number;
  trees: { nodes: GbdtNode[] }[];
}

export type ModelFile = LogRegModel | GbdtModel;
