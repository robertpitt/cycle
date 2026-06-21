import { describe, expect, it } from "vitest";
import {
  canScrollHorizontallyInWheelDirection,
  initialMacTrackpadSwipeNavigationState,
  isIgnoredMacTrackpadSwipeNavigationTarget,
  updateMacTrackpadSwipeNavigation,
  type MacTrackpadSwipeNavigationOptions,
  type MacTrackpadSwipeNavigationState,
} from "../src/renderer/screens/workspace/macTrackpadSwipeNavigation.ts";

const testOptions = {
  gestureEndMs: 200,
  thresholdPx: 80,
} satisfies MacTrackpadSwipeNavigationOptions;

const applyWheel = (
  state: MacTrackpadSwipeNavigationState,
  input: Parameters<typeof updateMacTrackpadSwipeNavigation>[1],
) => updateMacTrackpadSwipeNavigation(state, input, testOptions);

const horizontalTarget = ({
  clientWidth = 100,
  parentElement = null,
  scrollLeft = 0,
  scrollWidth = 200,
}: {
  readonly clientWidth?: number;
  readonly parentElement?: unknown;
  readonly scrollLeft?: number;
  readonly scrollWidth?: number;
} = {}): EventTarget =>
  ({
    clientWidth,
    closest: () => null,
    parentElement,
    scrollLeft,
    scrollWidth,
  }) as unknown as EventTarget;

describe("mac trackpad swipe navigation", () => {
  it("accepts an accumulated negative horizontal gesture as back", () => {
    let state = initialMacTrackpadSwipeNavigationState();

    let result = applyWheel(state, {
      deltaX: -45,
      deltaY: 5,
      now: 0,
    });
    expect(result.direction).toBeUndefined();
    expect(result.state.accumulatedX).toBe(-45);

    state = result.state;
    result = applyWheel(state, {
      deltaX: -40,
      deltaY: 4,
      now: 10,
    });

    expect(result.direction).toBe("back");
    expect(result.state).toEqual({
      accumulatedX: 0,
      gestureHandled: true,
      lastWheelAt: 10,
    });
    expect(result.consumed).toBe(true);
  });

  it("accepts an accumulated positive horizontal gesture as forward", () => {
    let state = initialMacTrackpadSwipeNavigationState();

    let result = applyWheel(state, {
      deltaX: 50,
      deltaY: 8,
      now: 0,
    });
    expect(result.direction).toBeUndefined();

    state = result.state;
    result = applyWheel(state, {
      deltaX: 35,
      deltaY: 2,
      now: 12,
    });

    expect(result.direction).toBe("forward");
    expect(result.consumed).toBe(true);
  });

  it("rejects diagonal gestures and clears pending accumulation", () => {
    let result = applyWheel(initialMacTrackpadSwipeNavigationState(), {
      deltaX: -45,
      deltaY: 3,
      now: 0,
    });
    expect(result.state.accumulatedX).toBe(-45);

    result = applyWheel(result.state, {
      deltaX: -90,
      deltaY: 75,
      now: 10,
    });

    expect(result.direction).toBeUndefined();
    expect(result.state.accumulatedX).toBe(0);
  });

  it("keeps one navigation per continuous inertial swipe", () => {
    let result = applyWheel(initialMacTrackpadSwipeNavigationState(), {
      deltaX: -90,
      deltaY: 0,
      now: 0,
    });
    expect(result.direction).toBe("back");
    expect(result.consumed).toBe(true);

    for (const now of [150, 300, 450, 600, 750]) {
      result = applyWheel(result.state, {
        deltaX: -200,
        deltaY: 0,
        now,
      });
      expect(result.direction).toBeUndefined();
      expect(result.consumed).toBe(true);
    }

    result = applyWheel(result.state, {
      deltaX: -90,
      deltaY: 0,
      now: 951,
    });
    expect(result.direction).toBe("back");
  });

  it("normalizes line-mode wheel deltas before thresholding", () => {
    const result = updateMacTrackpadSwipeNavigation(
      initialMacTrackpadSwipeNavigationState(),
      {
        deltaMode: 1,
        deltaX: 3,
        deltaY: 0,
        now: 0,
      },
      {
        lineDeltaPx: 16,
        thresholdPx: 40,
      },
    );

    expect(result.direction).toBe("forward");
  });

  it("ignores modifier-assisted wheel events", () => {
    const result = applyWheel(initialMacTrackpadSwipeNavigationState(), {
      deltaX: -90,
      deltaY: 0,
      metaKey: true,
      now: 0,
    });

    expect(result.direction).toBeUndefined();
    expect(result.state.accumulatedX).toBe(0);
  });

  it("resets accumulation when the gesture reverses direction", () => {
    let result = applyWheel(initialMacTrackpadSwipeNavigationState(), {
      deltaX: 50,
      deltaY: 0,
      now: 0,
    });
    expect(result.state.accumulatedX).toBe(50);

    result = applyWheel(result.state, {
      deltaX: -45,
      deltaY: 0,
      now: 10,
    });
    expect(result.direction).toBeUndefined();
    expect(result.state.accumulatedX).toBe(-45);
  });

  it("detects editable and dialog targets as ignored", () => {
    expect(
      isIgnoredMacTrackpadSwipeNavigationTarget({
        closest: () => null,
        isContentEditable: true,
      } as unknown as EventTarget),
    ).toBe(true);

    expect(
      isIgnoredMacTrackpadSwipeNavigationTarget({
        closest: (selector: string) => (selector.includes("dialog") ? {} : null),
        isContentEditable: false,
      } as unknown as EventTarget),
    ).toBe(true);
  });

  it("keeps horizontal scrolling available until the scrollable edge", () => {
    expect(
      canScrollHorizontallyInWheelDirection(horizontalTarget({ scrollLeft: 25 }), -10),
    ).toBe(true);
    expect(
      canScrollHorizontallyInWheelDirection(horizontalTarget({ scrollLeft: 0 }), -10),
    ).toBe(false);

    expect(
      canScrollHorizontallyInWheelDirection(horizontalTarget({ scrollLeft: 25 }), 10),
    ).toBe(true);
    expect(
      canScrollHorizontallyInWheelDirection(horizontalTarget({ scrollLeft: 100 }), 10),
    ).toBe(false);
  });
});
