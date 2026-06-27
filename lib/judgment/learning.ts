/**
 * Preference & estimation learning (FR27): calibrate effort estimates from
 * history. Given past (estimated, actual) pairs, scale a new base estimate by
 * the mean actual/estimated ratio. Pure utility; wiring to tracked actual
 * durations follows once capture records them.
 */
export interface EstimateSample {
  estimatedMin: number;
  actualMin: number;
}

export function calibrateEstimate(history: EstimateSample[], baseEstimate: number): number {
  const ratios = history
    .filter((h) => h.estimatedMin > 0 && h.actualMin > 0)
    .map((h) => h.actualMin / h.estimatedMin);
  if (ratios.length === 0) return baseEstimate;
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return Math.round(baseEstimate * avg);
}
