"use client";
import { useCallback, useEffect, useState } from "react";

export interface Selection {
  /** True while select mode is on (it can be on with nothing selected yet). */
  active: boolean;
  /** Selected media ids. Held outside the gallery window, so paging and jumps keep it. */
  ids: ReadonlySet<string>;
  start(): void;
  toggle(id: string): void;
  /** Unselect these ids (they were removed or are gone); select mode stays on. */
  drop(ids: Iterable<string>): void;
  /** Leave select mode and clear the selection. */
  exit(): void;
}

/**
 * Select mode for the gallery. Escape exits (and clears) unless `escapeBlocked` is set, e.g. while
 * a dialog opened from the selection is up and owns Escape itself.
 */
export function useSelection(escapeBlocked = false): Selection {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  const start = useCallback(() => setActive(true), []);
  const exit = useCallback(() => {
    setActive(false);
    setIds(new Set());
  }, []);
  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const drop = useCallback((gone: Iterable<string>) => {
    setIds((prev) => {
      const next = new Set(prev);
      for (const id of gone) next.delete(id);
      return next.size === prev.size ? prev : next;
    });
  }, []);

  useEffect(() => {
    if (!active || escapeBlocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, escapeBlocked, exit]);

  return { active, ids, start, toggle, drop, exit };
}
