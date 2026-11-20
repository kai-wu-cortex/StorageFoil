export const HORIZONTAL_DRAG_THRESHOLD = 4;

export function getHorizontalWheelDelta({
  deltaX,
  deltaY,
}: {
  deltaX: number;
  deltaY: number;
}) {
  return Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY;
}

export function hasHorizontalDragStarted(startX: number, currentX: number) {
  return Math.abs(currentX - startX) >= HORIZONTAL_DRAG_THRESHOLD;
}
