// Mirrors pipeline/src/vbd/project-points.ts RECENCY_WEIGHTS exactly —
// duplicated here (not imported) since this runs in the browser. Keep in
// sync if the pipeline's weighting changes.
export const RECENCY_WEIGHTS: Record<number, number[]> = {
  1: [1],
  2: [0.6, 0.4],
  3: [0.5, 0.3, 0.2],
};

export const MAX_GAMES = 17;
