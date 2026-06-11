import * as React from "react";

export type ShortcutBinding = readonly string[];

export type ShortcutAction = {
  readonly allowInEditable?: boolean;
  readonly bindings: readonly ShortcutBinding[];
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
  readonly run: () => void;
};

export type ShortcutDispatchInput = {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly key: string;
  readonly metaKey?: boolean;
  readonly now?: number;
  readonly preventDefault?: () => void;
  readonly shiftKey?: boolean;
  readonly target?: EventTarget | null;
};

type ShortcutEntry = {
  readonly action: ShortcutAction;
  readonly registeredAt: number;
};

type ShortcutContextValue = {
  readonly register: (action: ShortcutAction) => () => void;
};

export const shortcutSequenceTimeoutMs = 900;

const shortcutContext = React.createContext<ShortcutContextValue | null>(null);

const ignoredKeys = new Set(["Alt", "CapsLock", "Control", "Fn", "Meta", "Shift", "Tab"]);

const normalizeBinding = (binding: ShortcutBinding): readonly string[] =>
  binding.map((key) => normalizeShortcutKey(key)).filter((key): key is string => key !== undefined);

const bindingMatches = (binding: readonly string[], sequence: readonly string[]): boolean =>
  binding.length === sequence.length && binding.every((key, index) => key === sequence[index]);

const bindingStartsWith = (binding: readonly string[], sequence: readonly string[]): boolean =>
  binding.length > sequence.length && sequence.every((key, index) => key === binding[index]);

const latestEntry = (entries: readonly ShortcutEntry[]): ShortcutEntry | undefined =>
  entries.reduce<ShortcutEntry | undefined>(
    (latest, entry) =>
      latest === undefined || entry.registeredAt > latest.registeredAt ? entry : latest,
    undefined,
  );

export const normalizeShortcutKey = (key: string): string | undefined => {
  if (!key || ignoredKeys.has(key) || key === "Dead") return undefined;
  if (key === "Esc") return "Escape";
  if (key.length === 1) return key.toLowerCase();
  return key;
};

export const isEditableShortcutTarget = (target: EventTarget | null | undefined): boolean => {
  if (target === null || target === undefined || typeof target !== "object") return false;

  const candidate = target as {
    readonly getAttribute?: (name: string) => string | null;
    readonly isContentEditable?: boolean;
    readonly tagName?: string;
    readonly closest?: (selector: string) => unknown;
  };
  const tagName = candidate.tagName?.toLowerCase();

  if (candidate.isContentEditable) return true;
  if (tagName === "input" || tagName === "select" || tagName === "textarea") return true;

  const role = candidate.getAttribute?.("role")?.toLowerCase();
  if (role === "textbox" || role === "combobox" || role === "searchbox") return true;

  return Boolean(candidate.closest?.("[contenteditable='true'], [role='textbox']"));
};

export class ShortcutRegistry {
  private entries = new Map<string, ShortcutEntry>();
  private nextRegisteredAt = 1;
  private sequence: readonly string[] = [];
  private sequenceUpdatedAt = 0;

  register(action: ShortcutAction): () => void {
    const registeredAt = this.nextRegisteredAt;
    this.nextRegisteredAt += 1;
    this.entries.set(action.id, {
      action,
      registeredAt,
    });

    return () => {
      const current = this.entries.get(action.id);
      if (current?.registeredAt === registeredAt) {
        this.entries.delete(action.id);
      }
    };
  }

  dispatch(input: ShortcutDispatchInput): string | undefined {
    if (input.altKey || input.ctrlKey || input.metaKey) {
      this.resetSequence();
      return undefined;
    }

    const key = normalizeShortcutKey(input.key);
    if (!key) return undefined;

    const now = input.now ?? Date.now();
    if (this.sequence.length > 0 && now - this.sequenceUpdatedAt > shortcutSequenceTimeoutMs) {
      this.resetSequence();
    }

    const editable = isEditableShortcutTarget(input.target);
    const candidates = this.activeEntries(editable);
    const attemptedSequence = [...this.sequence, key];
    const resolved = this.resolveSequence(candidates, attemptedSequence);

    if (resolved.exact) {
      input.preventDefault?.();
      this.resetSequence();
      resolved.exact.action.run();
      return resolved.exact.action.id;
    }

    if (resolved.partial) {
      input.preventDefault?.();
      this.sequence = attemptedSequence;
      this.sequenceUpdatedAt = now;
      return undefined;
    }

    const fresh = this.resolveSequence(candidates, [key]);
    if (fresh.exact) {
      input.preventDefault?.();
      this.resetSequence();
      fresh.exact.action.run();
      return fresh.exact.action.id;
    }

    if (fresh.partial) {
      input.preventDefault?.();
      this.sequence = [key];
      this.sequenceUpdatedAt = now;
      return undefined;
    }

    this.resetSequence();
    return undefined;
  }

  private activeEntries(editable: boolean): readonly ShortcutEntry[] {
    return Array.from(this.entries.values()).filter(
      (entry) =>
        entry.action.disabled !== true && (!editable || entry.action.allowInEditable === true),
    );
  }

  private resolveSequence(
    entries: readonly ShortcutEntry[],
    sequence: readonly string[],
  ): { readonly exact?: ShortcutEntry; readonly partial: boolean } {
    const exactEntries: ShortcutEntry[] = [];
    let partial = false;

    for (const entry of entries) {
      for (const binding of entry.action.bindings.map(normalizeBinding)) {
        if (binding.length === 0) continue;
        if (bindingMatches(binding, sequence)) {
          exactEntries.push(entry);
        } else if (bindingStartsWith(binding, sequence)) {
          partial = true;
        }
      }
    }

    return {
      exact: latestEntry(exactEntries),
      partial,
    };
  }

  private resetSequence(): void {
    this.sequence = [];
    this.sequenceUpdatedAt = 0;
  }
}

export const ShortcutProvider = ({ children }: { readonly children: React.ReactNode }) => {
  const registryRef = React.useRef<ShortcutRegistry | null>(null);
  registryRef.current ??= new ShortcutRegistry();

  const register = React.useCallback((action: ShortcutAction) => {
    if (!registryRef.current) return () => {};
    return registryRef.current.register(action);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      registryRef.current?.dispatch({
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        key: event.key,
        metaKey: event.metaKey,
        now: performance.now(),
        preventDefault: () => event.preventDefault(),
        shiftKey: event.shiftKey,
        target: event.target,
      });
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <shortcutContext.Provider
      value={{
        register,
      }}
    >
      {children}
    </shortcutContext.Provider>
  );
};

export const useShortcutAction = (action: ShortcutAction): void => {
  const context = React.useContext(shortcutContext);

  React.useEffect(() => {
    if (!context) return undefined;
    return context.register(action);
  }, [action, context]);
};
