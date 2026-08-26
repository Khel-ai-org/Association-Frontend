"use client";

import React, { useState } from 'react';
import { X, User, ShieldAlert, Send, Loader2 } from 'lucide-react';

/* ─── ADD COMMENT MODAL COMPONENT ─── */
interface AddCommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  ballInfo: any;
  matchId: string | number;
  matchData?: any;
  onConfirm: (comment: string) => void;
}

export const AddCommentModal: React.FC<AddCommentModalProps> = ({ isOpen, onClose, ballInfo, matchId, onConfirm ,matchData}) => {
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
const matchDetails = Array.isArray(matchData) ? matchData[0] : matchData;
  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!commentText.trim()) return;
    const ballId = ballInfo?.id;
    if (!matchId || !ballId) {
      setError("Missing match or ball ID");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/matches/${matchId}/balls/${ballId}/mr-judgement`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ mr_comments: commentText }),
      });

      if (!res.ok) {
        throw new Error("Failed to update comment");
      }

      onConfirm(commentText);
      setCommentText("");
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to save comment. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-[440px] p-6 relative flex flex-col">
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full border border-gray-100 bg-gray-50/50 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        <div className="text-center mb-6 mt-2">
          <h3 className="text-xl font-bold text-[#0B1530] tracking-tight mb-1">Add Comment</h3>
          <p className="text-[#7384A6] text-xs font-medium">Add Comments so that other Match Officials can see it.</p>
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl text-center">
            {error}
          </div>
        )}

        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 px-1">
            <User size={14} className="text-[#FF5521]" />
            <span>{matchDetails?.referee} (Refree)</span>
          </div>

          <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-gray-500 font-medium">
            {ballInfo ? `Ball ${ballInfo.over_number || ballInfo.over} - ${ballInfo.batsman_name} vs ${ballInfo.bowler_name}` : "Ball Result here is not justified, according to video"}
          </div>

          <div className="relative">
            <input 
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write Comment Here"
              disabled={loading}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-12 text-xs font-medium text-gray-800 outline-none focus:border-[#FF5521] transition-colors"
            />
            <button 
              onClick={handleSubmit}
              disabled={loading}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6366F1] hover:text-[#4F46E5] transition-colors p-1 cursor-pointer disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3.5 bg-[#0F1117] hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : "Confirm"}
        </button>
      </div>
    </div>
  );
};

/* ─── MR JUDGEMENT MODAL COMPONENT ─── */
interface MrJudgementModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string | number;
  ballId: string | number;
  onConfirm: (judgement: string) => void;
}

export const MrJudgementModal: React.FC<MrJudgementModalProps> = ({
  isOpen,
  onClose,
  matchId,
  ballId,
  onConfirm,
}) => {
  const [judgement, setJudgement] = useState<"Correct" | "Incorrect">("Correct");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!matchId || !ballId) {
      setError("Missing match or ball ID");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/matches/${matchId}/balls/${ballId}/mr-judgement`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ mr_judgement: judgement }),
      });

      if (!res.ok) {
        throw new Error("Failed to update judgement");
      }

      onConfirm(judgement);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to save judgement. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-[440px] p-6 relative flex flex-col text-center">

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full border border-gray-100 bg-gray-50/50 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Icon */}
        <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-100 text-[#6366F1]">
          <ShieldAlert size={22} />
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-[#0B1530] tracking-tight mb-1">
          MR Judgement
        </h3>

        <p className="text-[#7384A6] text-xs font-medium mb-6">
          Select the judgement for the match
        </p>

        {error && (
          <div className="mb-4 p-2 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl text-center">
            {error}
          </div>
        )}

        {/* Judgement Tabs */}
        <div className="w-full mb-6">
          <label className="text-xs font-bold text-gray-700 block text-left px-1 mb-2">
            Judgement
          </label>

          <div className="flex w-full bg-slate-100 rounded-xl p-1 gap-1">
            {/* Correct */}
            <button
              type="button"
              disabled={loading}
              onClick={() => setJudgement("Correct")}
              className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${
                judgement === "Correct"
                  ? "bg-white text-green-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Correct
            </button>

            {/* InCorrect */}
            <button
              type="button"
              disabled={loading}
              onClick={() => setJudgement("Incorrect")}
              className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${
                judgement === "Incorrect"
                  ? "bg-white text-red-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              InCorrect
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3.5 bg-[#0F1117] hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : "Submit"}
        </button>
      </div>
    </div>
  );
};