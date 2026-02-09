"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import GuideContent from "@/components/GuideContent";

export default function GuidePage() {
  const router = useRouter();

  // Auth check
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/issues?limit=1");
        if (res.status === 401) {
          router.push("/login");
        }
      } catch {
        // Network error -- let the page render anyway
      }
    }
    checkAuth();
  }, [router]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-12 border-b border-[#252525] flex items-center px-4 flex-shrink-0">
          <h1 className="text-[14px] font-semibold text-[#f5f5f5]">
            Documentation
          </h1>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-hidden">
          <GuideContent />
        </main>
      </div>
    </div>
  );
}
