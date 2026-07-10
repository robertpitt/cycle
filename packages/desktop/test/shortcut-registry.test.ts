import { describe, expect, it } from "vitest";
import {
  isEditableShortcutTarget,
  shortcutSequenceTimeoutMs,
  ShortcutRegistry,
} from "../src/renderer/shortcuts/ShortcutProvider.tsx";

const editableTarget = (tagName: string) =>
  ({
    tagName,
  }) as unknown as EventTarget;

describe("ShortcutRegistry", () => {
  it("runs exact single-key bindings", () => {
    const registry = new ShortcutRegistry();
    let count = 0;
    let prevented = 0;

    registry.register({
      bindings: [["Escape"]],
      id: "navigation.goBack",
      label: "Go back",
      run: () => {
        count += 1;
      },
    });

    expect(
      registry.dispatch({
        key: "Escape",
        preventDefault: () => {
          prevented += 1;
        },
      }),
    ).toBe("navigation.goBack");
    expect(count).toBe(1);
    expect(prevented).toBe(1);
  });

  it("matches multi-key sequences", () => {
    const registry = new ShortcutRegistry();
    let destination = "";

    registry.register({
      bindings: [["g", "r", "h"]],
      id: "navigation.repositoryHistory",
      label: "Repository history",
      run: () => {
        destination = "history";
      },
    });

    expect(registry.dispatch({ key: "g", now: 1 })).toBeUndefined();
    expect(registry.dispatch({ key: "r", now: 2 })).toBeUndefined();
    expect(registry.dispatch({ key: "h", now: 3 })).toBe("navigation.repositoryHistory");
    expect(destination).toBe("history");
  });

  it("toggles the sidebar with Cmd+B only without conflicting with navigation shortcuts", () => {
    const registry = new ShortcutRegistry();
    const runs: string[] = [];
    let prevented = 0;

    registry.register({
      bindings: [["g", "i"]],
      id: "navigation.issues",
      label: "Open issues",
      run: () => runs.push("issues"),
    });
    registry.register({
      bindings: [["b"]],
      id: "layout.toggleSidebar",
      label: "Toggle sidebar",
      modifiers: { metaKey: true },
      run: () => runs.push("sidebar"),
    });

    expect(registry.dispatch({ key: "b" })).toBeUndefined();
    expect(registry.dispatch({ ctrlKey: true, key: "b" })).toBeUndefined();
    expect(registry.dispatch({ key: "b", metaKey: true, shiftKey: true })).toBeUndefined();
    expect(registry.dispatch({ key: "s" })).toBeUndefined();
    expect(registry.dispatch({ key: "b" })).toBeUndefined();
    expect(
      registry.dispatch({
        key: "b",
        metaKey: true,
        preventDefault: () => {
          prevented += 1;
        },
      }),
    ).toBe("layout.toggleSidebar");
    expect(runs).toEqual(["sidebar"]);
    expect(prevented).toBe(1);

    expect(
      registry.dispatch({
        key: "b",
        metaKey: true,
        target: editableTarget("textarea"),
      }),
    ).toBeUndefined();
    expect(runs).toEqual(["sidebar"]);

    registry.dispatch({ key: "g" });
    expect(registry.dispatch({ key: "i" })).toBe("navigation.issues");
    expect(runs).toEqual(["sidebar", "issues"]);
  });

  it("resets stale sequences after the timeout", () => {
    const registry = new ShortcutRegistry();
    let count = 0;

    registry.register({
      bindings: [["g", "i"]],
      id: "navigation.issues",
      label: "Issues",
      run: () => {
        count += 1;
      },
    });

    registry.dispatch({ key: "g", now: 1 });
    expect(
      registry.dispatch({
        key: "i",
        now: 1 + shortcutSequenceTimeoutMs + 1,
      }),
    ).toBeUndefined();
    expect(count).toBe(0);
  });

  it("guards shortcuts in editable targets unless explicitly allowed", () => {
    const registry = new ShortcutRegistry();
    const runs: string[] = [];

    registry.register({
      bindings: [["g", "i"]],
      id: "navigation.issues",
      label: "Issues",
      run: () => {
        runs.push("issues");
      },
    });
    registry.register({
      allowInEditable: true,
      bindings: [["Escape"]],
      id: "dialog.close",
      label: "Close dialog",
      run: () => {
        runs.push("close");
      },
    });

    registry.dispatch({
      key: "g",
      target: editableTarget("input"),
    });
    registry.dispatch({
      key: "i",
      target: editableTarget("input"),
    });
    expect(runs).toEqual([]);

    expect(
      registry.dispatch({
        key: "Escape",
        target: editableTarget("textarea"),
      }),
    ).toBe("dialog.close");
    expect(runs).toEqual(["close"]);
  });

  it("ignores disabled actions", () => {
    const registry = new ShortcutRegistry();
    let count = 0;

    registry.register({
      bindings: [["g", "i"]],
      disabled: true,
      id: "navigation.issues",
      label: "Issues",
      run: () => {
        count += 1;
      },
    });

    registry.dispatch({ key: "g" });
    expect(registry.dispatch({ key: "i" })).toBeUndefined();
    expect(count).toBe(0);
  });

  it("uses the latest registered action when bindings conflict", () => {
    const registry = new ShortcutRegistry();
    const runs: string[] = [];

    registry.register({
      bindings: [["g", "i"]],
      id: "first",
      label: "First",
      run: () => {
        runs.push("first");
      },
    });
    registry.register({
      bindings: [["g", "i"]],
      id: "second",
      label: "Second",
      run: () => {
        runs.push("second");
      },
    });

    registry.dispatch({ key: "g" });
    expect(registry.dispatch({ key: "i" })).toBe("second");
    expect(runs).toEqual(["second"]);
  });
});

describe("isEditableShortcutTarget", () => {
  it("detects editable form and role targets structurally", () => {
    expect(isEditableShortcutTarget(editableTarget("input"))).toBe(true);
    expect(isEditableShortcutTarget(editableTarget("select"))).toBe(true);
    expect(
      isEditableShortcutTarget({
        getAttribute: (name: string) => (name === "role" ? "textbox" : null),
        tagName: "div",
      } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isEditableShortcutTarget({
        isContentEditable: true,
        tagName: "div",
      } as unknown as EventTarget),
    ).toBe(true);
    expect(isEditableShortcutTarget(editableTarget("button"))).toBe(false);
  });
});
