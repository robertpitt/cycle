import * as React from "react";
import { getDesktopBridge } from "../../lib/desktopBridge.ts";

export type MacTrackpadSwipeNavigationDirection = "back" | "forward";

export type MacTrackpadSwipeNavigationInput = {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly deltaMode?: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly metaKey?: boolean;
  readonly now?: number;
  readonly shiftKey?: boolean;
};

export type MacTrackpadSwipeNavigationOptions = {
  readonly dominanceRatio?: number;
  readonly gestureEndMs?: number;
  readonly lineDeltaPx?: number;
  readonly minEventDeltaPx?: number;
  readonly pageDeltaPx?: number;
  readonly thresholdPx?: number;
};

export type MacTrackpadSwipeNavigationState = {
  readonly accumulatedX: number;
  readonly gestureHandled: boolean;
  readonly lastWheelAt?: number;
};

type UseMacTrackpadSwipeNavigationOptions = {
  readonly disabled?: boolean;
  readonly onNavigateBack: () => void;
  readonly onNavigateForward: () => void;
};

const wheelDeltaModeLine = 1;
const wheelDeltaModePage = 2;

const defaultOptions = {
  dominanceRatio: 1.5,
  gestureEndMs: 220,
  lineDeltaPx: 16,
  minEventDeltaPx: 6,
  pageDeltaPx: 800,
  thresholdPx: 90,
} satisfies Required<MacTrackpadSwipeNavigationOptions>;

const ignoredTargetSelector = [
  "input",
  "select",
  "textarea",
  "form",
  "dialog",
  "[aria-modal='true']",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[role='combobox']",
  "[role='dialog']",
  "[role='searchbox']",
  "[role='textbox']",
].join(", ");

export const initialMacTrackpadSwipeNavigationState =
  (): MacTrackpadSwipeNavigationState => ({
    accumulatedX: 0,
    gestureHandled: false,
  });

const resolveOptions = (
  options: MacTrackpadSwipeNavigationOptions | undefined,
): Required<MacTrackpadSwipeNavigationOptions> => ({
  ...defaultOptions,
  ...options,
});

const normalizeDelta = (
  value: number,
  deltaMode: number | undefined,
  options: Required<MacTrackpadSwipeNavigationOptions>,
): number => {
  if (deltaMode === wheelDeltaModeLine) return value * options.lineDeltaPx;
  if (deltaMode === wheelDeltaModePage) return value * options.pageDeltaPx;
  return value;
};

const hasModifierKey = (input: MacTrackpadSwipeNavigationInput): boolean =>
  input.altKey === true ||
  input.ctrlKey === true ||
  input.metaKey === true ||
  input.shiftKey === true;

const resetAccumulation = (
  state: MacTrackpadSwipeNavigationState,
): MacTrackpadSwipeNavigationState => ({
  ...state,
  accumulatedX: 0,
});

const releaseCompletedGestureAfterQuiet = (
  state: MacTrackpadSwipeNavigationState,
  now: number,
  options: Required<MacTrackpadSwipeNavigationOptions>,
): MacTrackpadSwipeNavigationState => {
  if (state.lastWheelAt === undefined || now - state.lastWheelAt < options.gestureEndMs) {
    return state;
  }

  return {
    accumulatedX: 0,
    gestureHandled: false,
  };
};

const observeWheelWithoutNavigation = (
  state: MacTrackpadSwipeNavigationState,
  now: number,
): MacTrackpadSwipeNavigationState =>
  resetAccumulation({
    ...releaseCompletedGestureAfterQuiet(state, now, defaultOptions),
    lastWheelAt: now,
  });

export const updateMacTrackpadSwipeNavigation = (
  state: MacTrackpadSwipeNavigationState,
  input: MacTrackpadSwipeNavigationInput,
  options?: MacTrackpadSwipeNavigationOptions,
): {
  readonly consumed: boolean;
  readonly direction?: MacTrackpadSwipeNavigationDirection;
  readonly state: MacTrackpadSwipeNavigationState;
} => {
  const resolvedOptions = resolveOptions(options);
  const now = input.now ?? Date.now();
  const activeState = releaseCompletedGestureAfterQuiet(state, now, resolvedOptions);
  const stateWithWheelTime = {
    ...activeState,
    lastWheelAt: now,
  };

  if (hasModifierKey(input)) {
    return {
      consumed: false,
      state: resetAccumulation(stateWithWheelTime),
    };
  }

  const deltaX = normalizeDelta(input.deltaX, input.deltaMode, resolvedOptions);
  const deltaY = normalizeDelta(input.deltaY, input.deltaMode, resolvedOptions);
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (
    absX < resolvedOptions.minEventDeltaPx ||
    absX < absY * resolvedOptions.dominanceRatio
  ) {
    return {
      consumed: false,
      state: resetAccumulation(stateWithWheelTime),
    };
  }

  if (activeState.gestureHandled) {
    return {
      consumed: true,
      state: resetAccumulation(stateWithWheelTime),
    };
  }

  const nextAccumulatedX =
    activeState.accumulatedX === 0 || Math.sign(activeState.accumulatedX) === Math.sign(deltaX)
      ? activeState.accumulatedX + deltaX
      : deltaX;

  if (Math.abs(nextAccumulatedX) < resolvedOptions.thresholdPx) {
    return {
      consumed: false,
      state: {
        ...stateWithWheelTime,
        accumulatedX: nextAccumulatedX,
      },
    };
  }

  return {
    consumed: true,
    direction: nextAccumulatedX < 0 ? "back" : "forward",
    state: {
      accumulatedX: 0,
      gestureHandled: true,
      lastWheelAt: now,
    },
  };
};

const elementFromEventTarget = (target: EventTarget | null | undefined): Element | undefined => {
  if (target === null || target === undefined || typeof target !== "object") return undefined;

  const candidate = target as {
    readonly closest?: unknown;
    readonly nodeType?: number;
    readonly parentElement?: Element | null;
  };

  if (candidate.nodeType === 3) return candidate.parentElement ?? undefined;
  if (typeof candidate.closest === "function") return target as Element;

  return candidate.parentElement ?? undefined;
};

export const isIgnoredMacTrackpadSwipeNavigationTarget = (
  target: EventTarget | null | undefined,
): boolean => {
  const element = elementFromEventTarget(target);
  if (!element) return false;

  if ((element as HTMLElement).isContentEditable) return true;

  return Boolean(element.closest(ignoredTargetSelector));
};

const allowsHorizontalScroll = (element: Element): boolean => {
  const overflowX = element.ownerDocument?.defaultView?.getComputedStyle(element).overflowX;
  if (!overflowX) return true;

  return overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay";
};

export const canScrollHorizontallyInWheelDirection = (
  target: EventTarget | null | undefined,
  deltaX: number,
): boolean => {
  let element = elementFromEventTarget(target);

  while (element) {
    if (allowsHorizontalScroll(element) && element.scrollWidth > element.clientWidth + 1) {
      if (deltaX < 0 && element.scrollLeft > 1) return true;
      if (deltaX > 0 && element.scrollLeft + element.clientWidth < element.scrollWidth - 1) {
        return true;
      }
    }

    element = element.parentElement ?? undefined;
  }

  return false;
};

const currentTime = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();

export const useMacTrackpadSwipeNavigation = ({
  disabled = false,
  onNavigateBack,
  onNavigateForward,
}: UseMacTrackpadSwipeNavigationOptions): void => {
  const onNavigateBackRef = React.useRef(onNavigateBack);
  const onNavigateForwardRef = React.useRef(onNavigateForward);
  const stateRef = React.useRef<MacTrackpadSwipeNavigationState>(
    initialMacTrackpadSwipeNavigationState(),
  );

  React.useEffect(() => {
    onNavigateBackRef.current = onNavigateBack;
    onNavigateForwardRef.current = onNavigateForward;
  }, [onNavigateBack, onNavigateForward]);

  React.useEffect(() => {
    stateRef.current = initialMacTrackpadSwipeNavigationState();

    if (disabled || getDesktopBridge()?.platform !== "darwin" || typeof window === "undefined") {
      return undefined;
    }

    const handleWheel = (event: WheelEvent): void => {
      const now = currentTime();

      if (
        isIgnoredMacTrackpadSwipeNavigationTarget(event.target) ||
        canScrollHorizontallyInWheelDirection(event.target, event.deltaX)
      ) {
        stateRef.current = observeWheelWithoutNavigation(stateRef.current, now);
        return;
      }

      const result = updateMacTrackpadSwipeNavigation(stateRef.current, {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        metaKey: event.metaKey,
        now,
        shiftKey: event.shiftKey,
      });

      stateRef.current = result.state;

      if (result.consumed) event.preventDefault();
      if (!result.direction) return;

      if (result.direction === "back") {
        onNavigateBackRef.current();
      } else {
        onNavigateForwardRef.current();
      }
    };

    window.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });

    return () => {
      window.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, [disabled]);
};
