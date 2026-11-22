"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

export type NoticeContent = { text: string; href?: string; linkText?: string };

const NOTICE_MS = 5000;

/** A brief confirmation that fades out on its own; showing a new one replaces the old. */
export function useNotice() {
  const [notice, setNotice] = useState<(NoticeContent & { key: number }) | null>(null);
  const show = useCallback((n: NoticeContent) => setNotice({ ...n, key: Date.now() }), []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [notice]);
  return { notice, show };
}

export function Notice({ notice }: { notice: NoticeContent | null }) {
  return (
    <div className="notice-slot" role="status" aria-live="polite">
      {notice && (
        <p className="notice">
          {notice.text}
          {notice.href && <Link href={notice.href}>{notice.linkText ?? "Open"}</Link>}
        </p>
      )}
    </div>
  );
}
