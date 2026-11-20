import { useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import {
  getHorizontalWheelDelta,
  hasHorizontalDragStarted,
} from '../lib/horizontalScroll';

type DragState = {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  didDrag: boolean;
} | null;

export function useHorizontalScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const dragStateRef = useRef<DragState>(null);
  const [isDragging, setIsDragging] = useState(false);

  const onWheel = (event: ReactWheelEvent<T>) => {
    const element = ref.current;
    if (!element || element.scrollWidth <= element.clientWidth) return;

    const delta = getHorizontalWheelDelta(event);
    if (delta === 0) return;

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, element.scrollLeft + delta));
    if (nextScrollLeft === element.scrollLeft) return;

    event.preventDefault();
    element.scrollLeft = nextScrollLeft;
  };

  const onPointerDown = (event: ReactPointerEvent<T>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !event.isPrimary) return;

    const element = ref.current;
    if (!element || element.scrollWidth <= element.clientWidth) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: element.scrollLeft,
      didDrag: false,
    };
    element.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<T>) => {
    const element = ref.current;
    const dragState = dragStateRef.current;
    if (!element || !dragState || dragState.pointerId !== event.pointerId) return;

    if (!dragState.didDrag && hasHorizontalDragStarted(dragState.startX, event.clientX)) {
      dragState.didDrag = true;
      setIsDragging(true);
    }

    if (!dragState.didDrag) return;
    event.preventDefault();
    element.scrollLeft = dragState.startScrollLeft - (event.clientX - dragState.startX);
  };

  const finishPointerDrag = (event: ReactPointerEvent<T>) => {
    const element = ref.current;
    const dragState = dragStateRef.current;
    if (!element || !dragState || dragState.pointerId !== event.pointerId) return;

    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  const onClickCapture = (event: ReactMouseEvent<T>) => {
    const dragState = dragStateRef.current;
    dragStateRef.current = null;
    if (!dragState?.didDrag) return;

    event.preventDefault();
    event.stopPropagation();
  };

  return {
    ref,
    isDragging,
    scrollProps: {
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointerDrag,
      onPointerCancel: finishPointerDrag,
      onLostPointerCapture: finishPointerDrag,
      onClickCapture,
      onDragStart: (event: ReactMouseEvent<T>) => event.preventDefault(),
    },
  };
}
