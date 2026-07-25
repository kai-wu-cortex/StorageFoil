export function shouldPublishImeInput(
  compositionActive: boolean,
  nativeEventIsComposing: boolean,
): boolean {
  return !compositionActive && !nativeEventIsComposing;
}
