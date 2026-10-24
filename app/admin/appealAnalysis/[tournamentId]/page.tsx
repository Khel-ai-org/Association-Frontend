"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { 
  Search, 
  Play, 
  X, 
  ChevronRight, 
  FileSpreadsheet,
  Loader2,
  Send,
  MessageSquare,
  ChevronDown,
  Gavel
} from "lucide-react";
import { friendlyError } from "../../utils/friendlyError";

interface UserData {
  name: string;
  email: string;
  profileImage?: string;
}

// Customised dropdown (replaces the native <select>) for the Decision / Innings filters.
function FilterDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) || options[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 pl-3 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none cursor-pointer text-black text-left"
      >
        <span className={`truncate ${value ? 'font-medium' : ''}`}>{current.label}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 z-40 bg-white border border-slate-100 rounded-xl shadow-xl p-1 max-h-60 overflow-y-auto">
            {options.map((o) => (
              <button
                key={o.value || 'all'}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                  value === o.value ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const DECISION_OPTIONS = [
  { value: '', label: 'All Decisions' },
  { value: 'Retained', label: 'Retained' },
  { value: 'Overturned', label: 'Overturned' },
  { value: 'Stay', label: 'Stay' },
];
const DRS_OPTIONS = [
  { value: '', label: 'All DRS' },
  { value: 'yes', label: 'DRS Referred: Yes' },
  { value: 'no', label: 'DRS Referred: No' },
];
const MR_OPTIONS = [
  { value: '', label: 'All MR Judgements' },
  { value: 'Correct', label: 'Correct' },
  { value: 'Incorrect', label: 'Incorrect' },
];
const INNINGS_OPTIONS = [
  { value: '', label: 'All Innings' },
  { value: '1', label: '1st Innings' },
  { value: '2', label: '2nd Innings' },
];

// `umpire_judgement` comes back as a list of { judgement, judgementor } (empty when nobody has judged yet).
const toJudgements = (value: unknown): { judgement: string; judgementor: string }[] => {
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return list.filter((j: any) => j && j.judgement) as { judgement: string; judgementor: string }[];
};

export default function AppealAnalysisPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const tournamentId = params.tournamentId as string;
  const tournamentName = searchParams.get("name");

  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [appeals, setAppeals] = useState<any[]>([]);
  // The scoring backend identifies tournaments by its own id, not the
  // association's — resolved once from the tournament record and reused
  // for every subsequent appeal-analysis fetch (e.g. after posting a comment).
  const [externalTournamentId, setExternalTournamentId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Filter states
  const [matchFilter, setMatchFilter] = useState("");
  const [umpireFilter, setUmpireFilter] = useState("");
  const [refereeFilter, setRefereeFilter] = useState("");
  const [appealTypeFilter, setAppealTypeFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");
  const [inningsFilter, setInningsFilter] = useState("");
  const [drsFilter, setDrsFilter] = useState("");
  const [mrFilter, setMrFilter] = useState("");

  // Umpire judgement popup (Actions column)
  const [judgingAppeal, setJudgingAppeal] = useState<any>(null);
  const [judgementChoice, setJudgementChoice] = useState<"Correct" | "Incorrect" | "">("");
  const [submittingJudgement, setSubmittingJudgement] = useState(false);
  const [judgementError, setJudgementError] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/me`, {
          method: 'GET',
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setUser(data);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };
    fetchUser();
  }, []);

  const currentUserName = user?.name || "Unknown";

  // Fetches appeal analysis from the scoring backend for an already-resolved
  // scoring tournament id. `cache: 'no-store'` skips the browser's conditional
  // (304) revalidation path entirely, so this always gets a fresh 200 + body.
  const fetchAppealData = async (scoringTournamentId: string) => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/tournaments/${scoringTournamentId}/appeal-analysis`,
        {
          headers: { "ngrok-skip-browser-warning": "true" },
          cache: "no-store",
        }
      );
      if (!res.ok) throw new Error(`Failed to fetch appeal analysis (HTTP ${res.status})`);
      const json = await res.json();
      console.log("Fetched appeal-analysis:", json);
      if (!json.success) throw new Error(json.message || "Appeal analysis request was not successful");
      setAppeals(json.data || []);
    } catch (err: any) {
      console.error("Failed to fetch appeal analysis:", err);
      setLoadError(err.message || "Failed to load appeal analysis");
    } finally {
      setLoading(false);
    }
  };

  // Single orchestrated loader: resolve the association tournament id to the
  // scoring backend's own id, then fetch the analysis for it. Kept as one
  // flow (not two chained effects) so there's no race and one place to retry.
  //
  // The singular GET /tournaments/{id} endpoint doesn't return
  // externalTournamentId, so it's looked up from the operator-tournaments
  // list instead (same endpoint the tournament grid already uses), which
  // does include it per tournament.
  const loadTournamentAndAppeals = async () => {
    if (!tournamentId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/my-association`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Failed to fetch tournaments (HTTP ${res.status})`);
      const tournaments = await res.json();
      console.log("Fetched tournaments:", tournaments);
      const list = Array.isArray(tournaments)
        ? tournaments
        : tournaments?.data || tournaments?.tournaments || [];
      const matchedTournament = list.find((t: any) => t.id === tournamentId);
      const scoringTournamentId = matchedTournament?.externalTournamentId;
      if (!scoringTournamentId) throw new Error("This tournament has no linked scoring tournament id");

      setExternalTournamentId(scoringTournamentId);
      await fetchAppealData(scoringTournamentId);
    } catch (err: any) {
      console.error("Failed to resolve scoring tournament id:", err);
      setLoadError(err.message || "Failed to load tournament");
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTournamentAndAppeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const handleExport = () => {
    // The sheet's data comes from the scoring backend keyed by
    // externalTournamentId (same id used for the on-screen table) — sending
    // the association tournamentId here queries the wrong source, which is
    // why the sheet came back with headers but no rows.
    if (!externalTournamentId) return;
    setExporting(true);
    window.location.href = `${process.env.NEXT_PUBLIC_Backend_URL}/export/auth?tournamentId=${externalTournamentId}`;
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedVideo) return;

    try {
      setSubmittingComment(true);
      const appealId = selectedVideo.appealId; 

      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/appeal/${appealId}`, {
        method: "PATCH",
        headers: {
          "ngrok-skip-browser-warning": "true",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          commentor: currentUserName,
          comment: newComment.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok) {
        const newCommentEntry = {
          commentor: currentUserName,
          comment: newComment.trim(),
          created_at: new Date().toISOString(),
        };

        // Update the open modal state immediately
        setSelectedVideo((prev: any) => ({
          ...prev,
          comments: [...(prev.comments || []), newCommentEntry],
        }));

        // Also update the local appeals list instantly
        setAppeals((prevAppeals) =>
          prevAppeals.map((item) => {
            if (item.appeal_id === appealId) {
              const existingComments = Array.isArray(item.comments) ? item.comments : [];
              return {
                ...item,
                comments: [...existingComments, newCommentEntry],
              };
            }
            return item;
          })
        );

        setNewComment("");
        if (externalTournamentId) fetchAppealData(externalTournamentId);
      } else {
        alert(json.message || "Failed to post comment");
      }
    } catch (err) {
      console.error("Error posting comment:", err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleSubmitJudgement = async () => {
    if (!judgingAppeal || !judgementChoice) {
      setJudgementError("Please choose Correct or Incorrect.");
      return;
    }
    setSubmittingJudgement(true);
    setJudgementError("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/appeal/${judgingAppeal.appeal_id}`, {
        method: "PATCH",
        headers: {
          "ngrok-skip-browser-warning": "true",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Judgement only — no commentor/comment, so nothing is added to the appeal's comments.
          umpire_judgement: {
            judgement: judgementChoice,
            judgementor: currentUserName,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setJudgementError(friendlyError(json?.message || json?.error, "We couldn't save the judgement. Please try again.", res.status));
        return;
      }
      setJudgingAppeal(null);
      setJudgementChoice("");
      if (externalTournamentId) fetchAppealData(externalTournamentId);
    } catch (err) {
      console.error("Error posting umpire judgement:", err);
      setJudgementError(friendlyError("failed to fetch"));
    } finally {
      setSubmittingJudgement(false);
    }
  };

  // --- Cell renderers shared by the desktop table and the mobile cards ---
  const pillBase = "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap";

  const renderDecision = (item: any) => (
    <span className={`${pillBase} ${
      item.decision === "Overturned"
        ? "bg-red-50 text-red-600 border-red-200"
        : item.decision === "Umpire's Call"
        ? "bg-amber-50 text-amber-600 border-amber-200"
        : item.decision === "Retained"
        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
        : "bg-blue-50 text-blue-600 border-blue-200"
    }`}>
      {item.decision || "Stay"}
    </span>
  );

  const renderDrs = (item: any) => (
    <span className={`${pillBase} ${
      item.drs_referred ? "bg-indigo-50 text-indigo-600 border-indigo-200" : "bg-slate-50 text-slate-500 border-slate-200"
    }`}>
      {item.drs_referred ? "Yes" : "No"}
    </span>
  );

  const renderMr = (item: any) =>
    item.mr_judgement ? (
      <span className={`${pillBase} ${
        String(item.mr_judgement).toLowerCase() === "correct"
          ? "bg-emerald-50 text-emerald-600 border-emerald-200"
          : "bg-red-50 text-red-600 border-red-200"
      }`}>
        {item.mr_judgement}
      </span>
    ) : (
      <span className="text-slate-300">—</span>
    );

  const renderUmpireJudgements = (item: any) => {
    const list = toJudgements(item.umpire_judgement);
    if (list.length === 0) return <span className="text-slate-300">—</span>;
    return (
      <div className="flex flex-col gap-1.5">
        {list.map((j, jIdx) => (
          <div key={jIdx} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`${pillBase} ${
              j.judgement.toLowerCase() === "correct"
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-red-50 text-red-600 border-red-200"
            }`}>
              {j.judgement}
            </span>
            {j.judgementor && <span className="text-[11px] text-slate-500">by {j.judgementor}</span>}
          </div>
        ))}
      </div>
    );
  };

  const renderCameras = (item: any) => {
    const commentsList = Array.isArray(item.comments) ? item.comments : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5, 6].map((camNum) => {
          const videoUrl = item.videos?.[`cam_${camNum}`] || "";
          return (
            <button
              key={camNum}
              onClick={() => setSelectedVideo({
                matchId: item.match_id,
                overNumber: item.over_number,
                appealId: item.appeal_id,
                url: videoUrl,
                title: `Ball ${item.over_number} Analytics - Cam ${camNum}`,
                comments: commentsList
              })}
              title={videoUrl ? `Cam ${camNum}` : `Cam ${camNum} — no video`}
              className={`inline-flex items-center gap-1 px-2 py-1 border rounded-md text-xs font-medium cursor-pointer transition-colors ${
                videoUrl
                  ? "bg-white hover:bg-slate-100 border-slate-300 text-slate-700"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-400"
              }`}
            >
              <Play className={`w-3 h-3 ${videoUrl ? "text-slate-500 fill-slate-500" : "text-slate-300 fill-slate-300"}`} />
              <span>{camNum}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderComments = (item: any) => {
    const commentsList = Array.isArray(item.comments) ? item.comments : [];
    if (commentsList.length === 0) return <span className="text-xs text-slate-400 font-medium">No comments</span>;
    return (
      <button
        onClick={() => setSelectedVideo({
          matchId: item.match_id,
          overNumber: item.over_number,
          appealId: item.appeal_id,
          url: item.videos?.cam_1 || "",
          title: `Ball ${item.over_number} Analytics`,
          comments: commentsList
        })}
        className="inline-flex items-center gap-1 cursor-pointer"
      >
        <div className="flex -space-x-1.5 overflow-hidden">
          {commentsList.slice(0, 3).map((c: any, cIdx: number) => (
            <span key={cIdx} className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white bg-amber-600 border-2 border-white">
              {c.commentor ? c.commentor.charAt(0).toUpperCase() : "U"}
            </span>
          ))}
        </div>
        <span className="text-xs font-semibold text-amber-700 ml-1 whitespace-nowrap">
          {commentsList.length} {commentsList.length === 1 ? "Comment" : "Comments"}
        </span>
      </button>
    );
  };

  const renderJudgeButton = (item: any) => (
    <button
      onClick={() => {
        setJudgingAppeal(item);
        setJudgementChoice("");
        setJudgementError("");
      }}
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-xs font-semibold text-white cursor-pointer shadow-xs whitespace-nowrap transition-colors"
    >
      <Gavel className="w-3.5 h-3.5" />
      Judge
    </button>
  );

  const filteredAppeals = appeals.filter((item) => {
    const matchesMatch = matchFilter === "" || item.match_name?.toLowerCase().includes(matchFilter.toLowerCase());
    const matchesUmpire = umpireFilter === "" || item.umpire?.toLowerCase().includes(umpireFilter.toLowerCase());
    const matchesReferee = refereeFilter === "" || item.referee?.toLowerCase().includes(refereeFilter.toLowerCase());
    const matchesType = appealTypeFilter === "" || item.appeal_type?.toLowerCase().includes(appealTypeFilter.toLowerCase());
    const matchesDecision = decisionFilter === "" || (item.decision || "Stay") === decisionFilter;
    const matchesInnings = inningsFilter === "" || String(item.innings) === inningsFilter;
    const matchesDrs = drsFilter === "" || (drsFilter === "yes" ? item.drs_referred === true : item.drs_referred !== true);
    const matchesMr = mrFilter === "" || String(item.mr_judgement || "").toLowerCase() === mrFilter.toLowerCase();
    return matchesMatch && matchesUmpire && matchesReferee && matchesType && matchesDecision && matchesInnings && matchesDrs && matchesMr;
  });

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6 bg-slate-50 min-h-screen">
      {/* Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        
        <span className="cursor-pointer hover:underline" onClick={() => router.back()}>Tournament</span> 
        
        <ChevronRight className="w-4 h-4 text-slate-400" />
        <span className="text-slate-900 font-medium">Appeal Analysis</span>
      </div>

      {/* Top Banner & Export Action */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs items-center">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 flex-1 min-w-0">
            
            <div>
              <p className="text-xs text-slate-400 font-medium">Tournament</p>
              <p className="text-sm font-bold text-slate-800 truncate max-w-full">
                {tournamentName ? decodeURIComponent(tournamentName) : tournamentId}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400" />
            <div>
              <div className="relative flex items-center mt-0.5">
                <input 
                  type="text" 
                  placeholder="Search Match" 
                  value={matchFilter}
                  onChange={(e) => setMatchFilter(e.target.value)}
                  className="w-full px-2 py-1 text-sm font-bold text-slate-800 bg-transparent focus:outline-none focus:border-slate-800"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex md:justify-end gap-3">
          <button
            onClick={handleExport}
            disabled={exporting || !externalTournamentId}
            className="w-full md:w-auto justify-center px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                Export Google Sheet
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Umpire Filter */}
        <div className="min-w-0">
          <label className="block text-xs font-medium text-slate-500 mb-1">Umpire</label>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3" />
            <input 
              type="text" 
              placeholder="Search Umpire" 
              value={umpireFilter}
              onChange={(e) => setUmpireFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none text-black"
            />
          </div>
        </div>

        {/* Referee Filter */}
        <div className="min-w-0">
          <label className="block text-xs font-medium text-slate-500 mb-1">Referee</label>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3" />
            <input 
              type="text" 
              placeholder="Search Referee" 
              value={refereeFilter}
              onChange={(e) => setRefereeFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none text-black"
            />
          </div>
        </div>

        {/* Appeal Type Filter */}
        <div className="min-w-0">
          <label className="block text-xs font-medium text-slate-500 mb-1">Appeal Type</label>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3" />
            <input 
              type="text" 
              placeholder="e.g. Normal Ball" 
              value={appealTypeFilter}
              onChange={(e) => setAppealTypeFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none text-black"
            />
          </div>
        </div>

        {/* Decision Filter (Dropdown) */}
        <div className="min-w-0">
          <label className="block text-xs font-medium text-slate-500 mb-1">Decision</label>
          <FilterDropdown value={decisionFilter} options={DECISION_OPTIONS} onChange={setDecisionFilter} />
        </div>

        {/* Innings Filter (Dropdown) */}
        <div className="min-w-0">
          <label className="block text-xs font-medium text-slate-500 mb-1">Innings</label>
          <FilterDropdown value={inningsFilter} options={INNINGS_OPTIONS} onChange={setInningsFilter} />
        </div>

        {/* DRS Referred Filter */}
        <div className="min-w-0">
          <label className="block text-xs font-medium text-slate-500 mb-1">DRS Referred</label>
          <FilterDropdown value={drsFilter} options={DRS_OPTIONS} onChange={setDrsFilter} />
        </div>

        {/* MR Judgement Filter */}
        <div className="min-w-0">
          <label className="block text-xs font-medium text-slate-500 mb-1">MR Judgement</label>
          <FilterDropdown value={mrFilter} options={MR_OPTIONS} onChange={setMrFilter} />
        </div>
      </div>

      {/* Appeals Data Table (desktop) / cards (mobile & tablet) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading appeals data...</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500 gap-3">
            <p className="text-sm font-medium text-red-600">{loadError}</p>
            <button
              onClick={loadTournamentAndAppeals}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredAppeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
            <MessageSquare className="w-8 h-8 text-slate-300" />
            <p className="text-sm font-medium">No appeal records found</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                    <th className="py-3.5 pl-6 pr-3">Match</th>
                    <th className="py-3.5 px-3">Appeal</th>
                    <th className="py-3.5 px-3">Decision</th>
                    <th className="py-3.5 px-3">DRS</th>
                    <th className="py-3.5 px-3">MR Judgement</th>
                    <th className="py-3.5 px-3">Umpire Judgement</th>
                    <th className="py-3.5 px-3">Officials</th>
                    <th className="py-3.5 px-3">Cameras</th>
                    <th className="py-3.5 px-3 text-center">Comments</th>
                    <th className="py-3.5 pl-3 pr-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {filteredAppeals.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/70 transition-colors align-middle">
                      <td className="py-3.5 pl-6 pr-3">
                        <p className="font-semibold text-slate-900 leading-snug">{item.match_name || "Match"}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Innings {item.innings || "-"} · Ball <span className="font-mono">{item.over_number || "0.0"}</span>
                        </p>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className="inline-flex px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                          {item.appeal_type || "Normal Ball"}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">{renderDecision(item)}</td>
                      <td className="py-3.5 px-3">{renderDrs(item)}</td>
                      <td className="py-3.5 px-3">{renderMr(item)}</td>
                      <td className="py-3.5 px-3">{renderUmpireJudgements(item)}</td>
                      <td className="py-3.5 px-3 text-xs">
                        <p className="text-slate-800"><span className="text-slate-400">Umpire </span>{item.umpire || "-"}</p>
                        <p className="text-slate-800 mt-0.5"><span className="text-slate-400">Referee </span>{item.referee || "-"}</p>
                      </td>
                      <td className="py-3.5 px-3">{renderCameras(item)}</td>
                      <td className="py-3.5 px-3 text-center">{renderComments(item)}</td>
                      <td className="py-3.5 pl-3 pr-6 text-center">{renderJudgeButton(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & tablet cards */}
            <div className="lg:hidden divide-y divide-slate-100">
              {filteredAppeals.map((item, index) => (
                <div key={index} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 leading-snug">{item.match_name || "Match"}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Innings {item.innings || "-"} · Ball <span className="font-mono">{item.over_number || "0.0"}</span>
                      </p>
                    </div>
                    <span className="shrink-0 inline-flex px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                      {item.appeal_type || "Normal Ball"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Decision</p>
                      {renderDecision(item)}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">DRS Referred</p>
                      {renderDrs(item)}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">MR Judgement</p>
                      {renderMr(item)}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Umpire Judgement</p>
                      {renderUmpireJudgements(item)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <p className="text-slate-800"><span className="text-slate-400">Umpire </span>{item.umpire || "-"}</p>
                    <p className="text-slate-800"><span className="text-slate-400">Referee </span>{item.referee || "-"}</p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Cameras</p>
                    {renderCameras(item)}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div>{renderComments(item)}</div>
                    {renderJudgeButton(item)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Umpire Judgement Modal */}
      {judgingAppeal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex overflow-y-auto p-3 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-5 sm:p-6 m-auto relative">
            <button
              onClick={() => setJudgingAppeal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-slate-900 pr-8">Umpire Judgement</h3>
            <p className="text-xs text-slate-500 mt-1">
              {judgingAppeal.match_name} · Ball {judgingAppeal.over_number} · {judgingAppeal.appeal_type}
            </p>

            <div className="grid grid-cols-2 gap-3 mt-5">
              {(["Correct", "Incorrect"] as const).map((opt) => {
                const active = judgementChoice === opt;
                const good = opt === "Correct";
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => { setJudgementChoice(opt); setJudgementError(""); }}
                    className={`py-3 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                      active
                        ? good
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-md"
                          : "bg-red-600 border-red-600 text-white shadow-md"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-500 mt-3">
              Judged by <span className="font-semibold text-slate-700">{currentUserName}</span>
            </p>

            {judgementError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{judgementError}</div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-3 mt-5">
              <button
                onClick={() => setJudgingAppeal(null)}
                disabled={submittingJudgement}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitJudgement}
                disabled={submittingJudgement || !judgementChoice}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {submittingJudgement ? "Saving..." : "Submit Judgement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Video Player & Comment Modal */}
      {selectedVideo && (() => {
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex overflow-y-auto p-3 sm:p-4">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col m-auto">
              <div className="relative bg-slate-950 aspect-video flex items-center justify-center">
                <div className="absolute top-4 left-4 z-10 bg-slate-900/80 px-3 py-1.5 rounded-lg text-white text-xs font-medium">
                  {selectedVideo.title}
                </div>

                <button
                  onClick={() => setSelectedVideo(null)}
                  className="absolute top-4 right-4 z-10 p-2 bg-slate-900 text-white rounded-full cursor-pointer hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>

                {selectedVideo.url ? (
                  <video
                    key={selectedVideo.url}
                    controls
                    autoPlay
                    preload="auto"
                    className="w-full h-full object-contain"
                  >
                    <source src={selectedVideo.url} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Play className="w-12 h-12 text-slate-600" />
                    <p className="text-xs">
                      No video stream available for this camera
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 sm:p-6 bg-white flex flex-col max-h-[380px]">
                <h3 className="text-base font-bold text-slate-900 mb-3">
                  Comments
                </h3>

                <div className="flex-1 overflow-y-auto space-y-3 pr-2 divide-y divide-slate-100">
                  {selectedVideo.comments && selectedVideo.comments.length > 0 ? (
                    selectedVideo.comments.map((c: any, i: number) => {
                      // Format created_at date nicely if present
                      const formattedDate = c.created_at 
                        ? new Date(c.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) 
                        : "Just now";

                      return (
                        <div
                          key={i}
                          className="pt-3 first:pt-0 flex items-start gap-3"
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                            {c.commentor ? c.commentor.charAt(0).toUpperCase() : "U"}
                          </div>

                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-semibold text-sm text-slate-900">
                                {c.commentor || "Unknown"}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-600">
                                Reviewer
                              </span>
                              <span className="text-xs text-slate-400 ml-auto">
                                {formattedDate}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 mt-1">
                              {c.comment}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-400 italic py-2">
                      No comments yet. Be the first to write one!
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Write Comment Here"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                    className="flex-1 px-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none text-black"
                  />

                  <button
                    onClick={handleAddComment}
                    disabled={submittingComment || !newComment.trim()}
                    className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl cursor-pointer disabled:opacity-50 flex items-center justify-center"
                  >
                    {submittingComment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}