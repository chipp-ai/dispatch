"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import CreateCustomerModal from "@/components/CreateCustomerModal";
import CustomerCard from "@/components/CustomerCard";

interface Customer {
  id: string;
  name: string;
  slug: string;
  portalToken: string;
  slackChannelId: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  issueCount: number;
  createdAt: string;
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draggedCustomer, setDraggedCustomer] = useState<Customer | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/customers");
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch customers");
      }
      const data = await res.json();
      // Sort by issue count (descending) initially - highest value first
      const sorted = (data.customers || []).sort(
        (a: Customer, b: Customer) => b.issueCount - a.issueCount
      );
      setCustomers(sorted);
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowCreateModal(true);
      }

      if (e.key === "Escape") {
        setShowCreateModal(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleDragStart(e: React.DragEvent, customer: Customer) {
    setDraggedCustomer(customer);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, targetCustomer: Customer) {
    e.preventDefault();
    if (!draggedCustomer || draggedCustomer.id === targetCustomer.id) return;

    const newCustomers = [...customers];
    const draggedIndex = newCustomers.findIndex(
      (c) => c.id === draggedCustomer.id
    );
    const targetIndex = newCustomers.findIndex(
      (c) => c.id === targetCustomer.id
    );

    if (draggedIndex !== -1 && targetIndex !== -1) {
      newCustomers.splice(draggedIndex, 1);
      newCustomers.splice(targetIndex, 0, draggedCustomer);
      setCustomers(newCustomers);
    }
  }

  function handleDragEnd() {
    setDraggedCustomer(null);
  }

  async function copyPortalLink(customer: Customer) {
    const baseUrl = window.location.origin;
    const portalUrl = `${baseUrl}/portal/${customer.slug}?token=${customer.portalToken}`;
    await navigator.clipboard.writeText(portalUrl);
    setCopiedId(customer.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleCreateCustomer(data: {
    name: string;
    slackChannelId?: string;
    brandColor?: string;
    logoUrl?: string;
  }) {
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        slackChannelId: data.slackChannelId,
        brandColor: data.brandColor,
        logoUrl: data.logoUrl,
      }),
    });

    if (!res.ok) {
      throw new Error("Failed to create customer");
    }

    await fetchCustomers();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d]">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-12 border-b border-[#252525] flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-[14px] font-semibold text-[#f5f5f5]">
              Customers
            </h1>
            <span className="text-[12px] text-[#555]">
              {customers.length} total
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-[#f5f5f5] bg-[#5e6ad2] hover:bg-[#6b74db] rounded-md transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Customer
              <kbd className="ml-1 text-[10px] text-[#a8b0e0] bg-[#4a55b5] px-1 py-0.5 rounded">
                N
              </kbd>
            </button>
          </div>
        </header>

        {/* Info bar */}
        <div className="px-4 py-2 border-b border-[#1f1f1f] bg-[#0f0f0f]">
          <p className="text-[11px] text-[#555]">
            Drag to reorder customers by priority. Highest value on the left.
          </p>
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-x-auto overflow-y-hidden p-4">
          {customers.length === 0 ? (
            <EmptyState onCreateCustomer={() => setShowCreateModal(true)} />
          ) : (
            <div className="flex gap-4 h-full pb-4">
              {customers.map((customer, index) => (
                <CustomerCard
                  key={customer.id}
                  customer={customer}
                  rank={index + 1}
                  isDragging={draggedCustomer?.id === customer.id}
                  isCopied={copiedId === customer.id}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onCopyLink={copyPortalLink}
                  onViewIssues={() =>
                    router.push(`/board?customer=${customer.id}`)
                  }
                  onViewDetails={() => router.push(`/customers/${customer.id}`)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Create Customer Modal */}
      <CreateCustomerModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateCustomer}
      />
    </div>
  );
}

function EmptyState({ onCreateCustomer }: { onCreateCustomer: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#252525] border border-[#333] flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-[#555]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </div>
      <h2 className="text-[15px] font-semibold text-[#f5f5f5] mb-1">
        No customers yet
      </h2>
      <p className="text-[13px] text-[#666] mb-4 max-w-[280px]">
        Add your first customer to start tracking their issues and providing
        them with a read-only portal.
      </p>
      <button
        onClick={onCreateCustomer}
        className="flex items-center gap-1.5 px-4 py-2 text-[13px] text-[#f5f5f5] bg-[#5e6ad2] hover:bg-[#6b74db] rounded-md transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        Add Customer
      </button>
    </div>
  );
}
