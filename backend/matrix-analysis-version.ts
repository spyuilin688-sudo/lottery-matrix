export function analysisVersionForDrawPeriod(drawPeriod?: string) {
  return drawPeriod === undefined ? undefined : `${drawPeriod}:matrix-v3`;
}
