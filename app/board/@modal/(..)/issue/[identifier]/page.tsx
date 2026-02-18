"use client";

import { useRouter } from "next/navigation";
import { useEffect, useCallback } from "react";
import IssuePageClient from "@/app/issue/[identifier]/IssuePageClient";

export default function InterceptedIssuePage() {
  const router = useRouter();
  const handleClose = useCallback(() => router.back(), [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0d0d0d]">
      <IssuePageClient isModal onClose={handleClose} />
    </div>
  );
}
