export type MatrixStatusName = "啟動" | "聚合" | "共振" | "臨界";
export type MatrixStatusPosition = 1 | 2 | 3 | 4;

export const MATRIX_STATUS_ARTWORK: Record<
  MatrixStatusName,
  Record<MatrixStatusPosition, string>
> = {
  啟動: {
    1: "/assets/matrix-status/active-position-1.png",
    2: "/assets/matrix-status/active-position-2.png",
    3: "/assets/matrix-status/active-position-3.png",
    4: "/assets/matrix-status/active-position-4.png",
  },
  聚合: {
    1: "/assets/matrix-status/focus-position-1.png",
    2: "/assets/matrix-status/focus-position-2.png",
    3: "/assets/matrix-status/focus-position-3.png",
    4: "/assets/matrix-status/focus-position-4.png",
  },
  共振: {
    1: "/assets/matrix-status/resonance-position-1.png",
    2: "/assets/matrix-status/resonance-position-2.png",
    3: "/assets/matrix-status/resonance-position-3.png",
    4: "/assets/matrix-status/resonance-position-4.png",
  },
  臨界: {
    1: "/assets/matrix-status/critical-position-1.png",
    2: "/assets/matrix-status/critical-position-2.png",
    3: "/assets/matrix-status/critical-position-3.png",
    4: "/assets/matrix-status/critical-position-4.png",
  },
};

export function getMatrixStatusArtwork(
  status: MatrixStatusName,
  position: MatrixStatusPosition,
): string {
  return MATRIX_STATUS_ARTWORK[status][position];
}
