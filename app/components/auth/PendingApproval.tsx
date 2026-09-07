"use client";

import { useState } from "react";
import { Loader2, Clock3 } from "lucide-react";

interface PendingApprovalProps {
  // Which role the user submitted — decides who's approving them and which
  // approval flag to poll for.
  role: string | null;
  onApproved: () => void;
}

export default function PendingApproval({ role, onApproved }: PendingApprovalProps) {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");

  const approverLabel = role === "admin" ? "The Business Admin" : "Your Association's Admin";

  const handleCheckStatus = async () => {
    setChecking(true);
    setMessage("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/me`, {
        method: "GET",
        credentials: "include",
      });

      if (res.ok) {
        const user = await res.json();
        const approved =
          user.role === "admin" ? !!user.isApprovedByBusinessAdmin : !!user.isApprovedByAssociation;

        if (approved) {
          onApproved();
          return;
        }
        setMessage("Still waiting for approval. Please check back later.");
      } else {
        setMessage("Could not check status. Please try again.");
      }
    } catch {
      setMessage("Could not check status. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
        <Clock3 className="text-amber-500" size={28} />
      </div>

      <h2 className="text-xl font-bold text-[#0D0D12] mb-2">Awaiting Approval</h2>
      <p className="text-gray-500 text-sm mb-6">
        Your profile has been submitted. {approverLabel} needs to approve your account before you can
        access the dashboard. You&apos;ll be notified once that happens.
      </p>

      {message && <p className="text-xs text-gray-500 mb-4">{message}</p>}

      <button
        onClick={handleCheckStatus}
        disabled={checking}
        className="w-full bg-[#0D0D12] text-white py-3 rounded-lg font-medium hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {checking ? <Loader2 className="animate-spin" size={18} /> : "Check Status"}
      </button>
    </div>
  );
}
