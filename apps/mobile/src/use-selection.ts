import { useCallback, useEffect, useState } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";

export interface Selection {
  /** True while select mode is on (it can be on with nothing selected). */
  active: boolean;
  /** Selected media ids. Held outside the gallery window, so paging and jumps keep it. */
  ids: ReadonlySet<string>;
  /** Enter select mode, optionally with a first item selected (the long-pressed tile). */
  start(id?: string): void;
  toggle(id: string): void;
  /** Unselect these ids (they were removed or are gone); select mode stays on. */
  drop(ids: Iterable<string>): void;
  /** Leave select mode and clear the selection. */
  exit(): void;
}

/**
 * Select mode for the gallery (the mobile twin of web's useSelection). Leaving the screen exits and
 * clears it, and Android's back button exits it before it would leave the screen.
 */
export function useSelection(): Selection {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  const start = useCallback((id?: string) => {
    setActive(true);
    setIds(id ? new Set([id]) : new Set());
  }, []);
  const exit = useCallback(() => {
    setActive(false);
    // Keep the same empty set when there is nothing to clear (every blur calls this).
    setIds((prev) => (prev.size === 0 ? prev : new Set()));
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

  // Leaving the screen (push, back, swipe) ends select mode: the cleanup runs on blur and unmount.
  useFocusEffect(useCallback(() => exit, [exit]));

  // Android back: the Escape equivalent. A Modal on top (the picker) gets the press first.
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      exit();
      return true;
    });
    return () => sub.remove();
  }, [active, exit]);

  return { active, ids, start, toggle, drop, exit };
}
