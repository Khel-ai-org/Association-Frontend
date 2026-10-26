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
  Video,
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  Plus
} from "lucide-react";
import { friendlyError } from "../../utils/friendlyError";
import { decisionLabel } from "../../utils/appealDecision";

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
        <ChevronDown className={`w-4 h-4 text-slate-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
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

// Exactly the backend's three decisions; "Overturned" is shown as "Lost".
const DECISION_OPTIONS = [
  { value: '', label: 'All Decisions' },
  { value: "Umpire's Call", label: "Umpire's Call" },
  { value: 'Retained', label: 'Retained' },
  { value: 'Overturned', label: decisionLabel('Overturned') },
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

const PAGE_SIZE = 100;

// Umpire icon: a standing official behind a bench (matches the design reference).
function UmpireIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="5.2" r="2.6" />
      <path d="M7.5 12.2c0-1.7 1.4-3 3.1-3h2.8c1.7 0 3.1 1.3 3.1 3v3.3H7.5v-3.3z" />
      <path d="M5.5 15.5h13" />
      <path d="M7.2 15.5v4.8M16.8 15.5v4.8M5 20.3h14" />
    </svg>
  );
}

// Short team name: 2+ words -> first letter of each word ("Rajasthan Royals" -> "RR");
// a single word -> its first three letters ("Mumbai" -> "MUM").
const shortTeamName = (name?: string | null) => {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").toUpperCase();
};

const initials = (name?: string | null) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

const ordinal = (n: number | string) => {
  const v = Number(n);
  if (!v) return String(n ?? "-");
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
  return `${v}${["th", "st", "nd", "rd"][v % 10 > 3 ? 0 : v % 10]}`;
};

// "Today, 19:45" / "Yesterday, 08:10" / "24 Oct 2026, 19:45"
const formatWhen = (iso?: string) => {
  if (!iso) return "Just now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Just now";
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  const day = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${day}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

const AVATAR_COLORS = ["bg-emerald-600", "bg-amber-500", "bg-indigo-500", "bg-rose-500", "bg-sky-500"];

// All playable clips of an appeal: the six cameras, then any appeal clips (appeal: { video1: url }).
const getClips = (item: any) => {
  const cams = [1, 2, 3, 4, 5, 6].map((n) => ({
    key: `cam_${n}`,
    label: `Camera ${n}`,
    url: (item?.videos?.[`cam_${n}`] as string) || "",
    group: "camera" as const,
  }));
  const appeal = Object.entries((item?.appeal || {}) as Record<string, string | null>)
    .filter(([, url]) => !!url)
    .map(([k, url]) => ({ key: `appeal:${k}`, label: `Appeal ${k.replace(/^video/i, "")}`.trim(), url: url as string, group: "appeal" as const }));
  return { cams, appeal, all: [...cams, ...appeal] };
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
  // Popups work off the appeal's id so they always show the latest data after a refresh.
  const [videoAppealId, setVideoAppealId] = useState<number | string | null>(null);
  const [activeClip, setActiveClip] = useState<string>("cam_1");
  const [judgementsAppealId, setJudgementsAppealId] = useState<number | string | null>(null);
  // Per-umpire stats from the appeal-analysis response; shown through the "Umpire Report" button.
  const [umpirePerformance, setUmpirePerformance] = useState<any[]>([]);
  const [showUmpireReport, setShowUmpireReport] = useState(false);
  const [page, setPage] = useState(1);
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
      setUmpirePerformance(Array.isArray(json.umpire_performance) ? json.umpire_performance : []);
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
    if (!newComment.trim() || videoAppealId === null) return;

    try {
      setSubmittingComment(true);
      const appealId = videoAppealId;

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

      const json = await res.json().catch(() => null);
      if (res.ok) {
        const newCommentEntry = {
          commentor: currentUserName,
          comment: newComment.trim(),
          created_at: new Date().toISOString(),
        };

        // Show the comment instantly, then reload from the server.
        setAppeals((prevAppeals) =>
          prevAppeals.map((item) =>
            item.appeal_id === appealId
              ? { ...item, comments: [...(Array.isArray(item.comments) ? item.comments : []), newCommentEntry] }
              : item
          )
        );

        setNewComment("");
        if (externalTournamentId) fetchAppealData(externalTournamentId);
      } else {
        alert(json?.message || "Failed to post comment");
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

  const filteredAppeals = appeals.filter((item) => {
    const matchesMatch = matchFilter === "" || item.match_name?.toLowerCase().includes(matchFilter.toLowerCase());
    const matchesUmpire = umpireFilter === "" || item.umpire?.toLowerCase().includes(umpireFilter.toLowerCase());
    const matchesReferee = refereeFilter === "" || item.referee?.toLowerCase().includes(refereeFilter.toLowerCase());
    const matchesType = appealTypeFilter === "" || item.appeal_type?.toLowerCase().includes(appealTypeFilter.toLowerCase());
    const matchesDecision = decisionFilter === "" || item.decision === decisionFilter;
    const matchesInnings = inningsFilter === "" || String(item.innings) === inningsFilter;
    const matchesDrs = drsFilter === "" || (drsFilter === "yes" ? item.drs_referred === true : item.drs_referred !== true);
    const matchesMr = mrFilter === "" || String(item.mr_judgement || "").toLowerCase() === mrFilter.toLowerCase();
    return matchesMatch && matchesUmpire && matchesReferee && matchesType && matchesDecision && matchesInnings && matchesDrs && matchesMr;
  });

  // 100 appeals per page; filters always go back to page 1.
  useEffect(() => {
    setPage(1);
  }, [matchFilter, umpireFilter, refereeFilter, appealTypeFilter, decisionFilter, inningsFilter, drsFilter, mrFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAppeals.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedAppeals = filteredAppeals.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Umpires whose name matches what was typed in the Umpire search.
  const matchedUmpires = umpireFilter.trim()
    ? umpirePerformance.filter((u) => String(u.name || "").toLowerCase().includes(umpireFilter.trim().toLowerCase()))
    : [];

  const videoAppeal = videoAppealId !== null ? appeals.find((a) => a.appeal_id === videoAppealId) : null;
  const judgementsAppeal = judgementsAppealId !== null ? appeals.find((a) => a.appeal_id === judgementsAppealId) : null;

  const openJudge = (item: any) => {
    setJudgingAppeal(item);
    setJudgementChoice("");
    setJudgementError("");
  };
  const openVideos = (item: any) => {
    const clips = getClips(item);
    setActiveClip((clips.all.find((c) => c.url) || clips.cams[0]).key);
    setNewComment("");
    setVideoAppealId(item.appeal_id);
  };

  // --- Cell pieces shared by the desktop table and the mobile cards ---
  const pill = "inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap";

  const renderMatch = (item: any) => {
    const [teamA, teamB] = String(item.match_name || "Match").split(/\s+vs\.?\s+/i);
    return (
      <div className="min-w-0">
        <p className="font-bold text-slate-900 leading-snug" title={item.match_name || undefined}>
          {shortTeamName(teamA)}
          {teamB && (
            <>
              {" "}<span className="text-slate-600 font-medium">vs</span> {shortTeamName(teamB)}
            </>
          )}
        </p>
        <p className="text-[11px] text-slate-700 mt-1">{ordinal(item.innings)} Innings</p>
        <p className="text-[11px] text-slate-700">Over {item.over_number || "0.0"}</p>
      </div>
    );
  };

  const renderAppealType = (item: any) => (
    <span className={`${pill} bg-slate-100 text-slate-600`}>{item.appeal_type || "Normal Ball"}</span>
  );

  const renderReview = (item: any) => {
    const mr = String(item.mr_judgement || "");
    const decisionBox =
      item.decision === "Overturned"
        ? { cls: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="w-4 h-4" /> }
        : item.decision === "Umpire's Call"
        ? { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <CheckCircle2 className="w-4 h-4" /> }
        : item.decision
        ? { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-4 h-4" /> }
        : { cls: "bg-slate-50 text-slate-700 border-slate-200", icon: <Clock className="w-4 h-4" /> };
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <span className={`${pill} ${item.drs_referred ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-700"}`}>
            DRS: {item.drs_referred ? "Yes" : "No"}
          </span>
          {mr && (
            <span className={`${pill} ${mr.toLowerCase() === "correct" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              MR Judgement: {mr}
            </span>
          )}
        </div>
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${decisionBox.cls}`}>
          {decisionBox.icon}
          Final decision: {item.decision ? decisionLabel(item.decision) : "Pending"}
        </div>
      </div>
    );
  };

  const renderOfficials = (item: any) => (
    <div className="space-y-2 text-xs">
      {[
        { role: "Umpire", name: item.umpire },
        { role: "Match Referee", name: item.referee },
      ].map((o) => (
        <div key={o.role} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-[11px] text-slate-600">{o.role}</span>
          {o.name ? (
            <span className="font-semibold text-slate-800 truncate">{o.name}</span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </div>
      ))}
    </div>
  );

  const renderVideosAndComments = (item: any) => {
    const videoCount = getClips(item).all.filter((c) => c.url).length;
    const commentCount = Array.isArray(item.comments) ? item.comments.length : 0;
    return (
      <button
        onClick={() => openVideos(item)}
        className="w-full max-w-[210px] flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-left cursor-pointer transition-colors"
      >
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Video className="w-3.5 h-3.5 text-slate-700" /> Videos ({videoCount})
          </p>
          <p className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <MessageSquare className="w-3.5 h-3.5 text-slate-700" /> Comments ({commentCount})
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
      </button>
    );
  };

  const renderJudgements = (item: any) => {
    const count = toJudgements(item.umpire_judgement).length;
    return (
      <div className="space-y-2">
        <button
          onClick={() => setJudgementsAppealId(item.appeal_id)}
          className="w-full max-w-[190px] flex items-center justify-between gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 cursor-pointer transition-colors"
        >
          <span className="flex items-center gap-2">
            <UmpireIcon className="w-4 h-4 text-slate-700" /> Judgements({count})
          </span>
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
        <button
          onClick={() => openJudge(item)}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Judgement
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6 bg-slate-50 min-h-screen">
      {/* Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        
        <span className="cursor-pointer hover:underline" onClick={() => router.back()}>Tournament</span> 
        
        <ChevronRight className="w-4 h-4 text-slate-600" />
        <span className="text-slate-900 font-medium">Appeal Analysis</span>
      </div>

      {/* Top Banner & Export Action */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs items-center">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 flex-1 min-w-0">
            
            <div>
              <p className="text-xs text-slate-600 font-medium">Tournament</p>
              <p className="text-sm font-bold text-slate-800 truncate max-w-full">
                {tournamentName ? decodeURIComponent(tournamentName) : tournamentId}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-600" />
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
          <label className="block text-xs font-medium text-slate-700 mb-1">Umpire</label>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-600 absolute left-3" />
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
          <label className="block text-xs font-medium text-slate-700 mb-1">Referee</label>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-600 absolute left-3" />
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
          <label className="block text-xs font-medium text-slate-700 mb-1">Appeal Type</label>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-600 absolute left-3" />
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
          <label className="block text-xs font-medium text-slate-700 mb-1">Decision</label>
          <FilterDropdown value={decisionFilter} options={DECISION_OPTIONS} onChange={setDecisionFilter} />
        </div>

        {/* Innings Filter (Dropdown) */}
        <div className="min-w-0">
          <label className="block text-xs font-medium text-slate-700 mb-1">Innings</label>
          <FilterDropdown value={inningsFilter} options={INNINGS_OPTIONS} onChange={setInningsFilter} />
        </div>

        {/* DRS Referred Filter */}
        <div className="min-w-0">
          <label className="block text-xs font-medium text-slate-700 mb-1">DRS Referred</label>
          <FilterDropdown value={drsFilter} options={DRS_OPTIONS} onChange={setDrsFilter} />
        </div>

        {/* MR Judgement Filter */}
        <div className="min-w-0">
          <label className="block text-xs font-medium text-slate-700 mb-1">MR Judgement</label>
          <FilterDropdown value={mrFilter} options={MR_OPTIONS} onChange={setMrFilter} />
        </div>

        {/* Umpire Report — always visible, enabled once the Umpire search matches someone */}
        <div className="min-w-0">
          <label className="block text-xs font-medium text-transparent mb-1 select-none" aria-hidden="true">Report</label>
          <button
            onClick={() => setShowUmpireReport(true)}
            disabled={matchedUmpires.length === 0}
            title={matchedUmpires.length === 0 ? "Search an umpire's name to view their report" : undefined}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-900"
          >
            <UmpireIcon className="w-4 h-4" />
            Umpire Report{matchedUmpires.length > 1 ? ` (${matchedUmpires.length})` : ""}
          </button>
        </div>
      </div>

      {/* Appeals Data Table (desktop) / cards (mobile & tablet) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-600 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading appeals data...</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-700 gap-3">
            <p className="text-sm font-medium text-red-600">{loadError}</p>
            <button
              onClick={loadTournamentAndAppeals}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredAppeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-600 gap-2">
            <MessageSquare className="w-8 h-8 text-slate-400" />
            <p className="text-sm font-medium">No appeal records found</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50/70">
                    <th className="py-3.5 pl-6 pr-3">Match</th>
                    <th className="py-3.5 px-3">Appeal</th>
                    <th className="py-3.5 px-3">DRS Review &amp; Final Decision</th>
                    <th className="py-3.5 px-3">Officials</th>
                    <th className="py-3.5 px-3">Cameras &amp; Comments</th>
                    <th className="py-3.5 pl-3 pr-6">Umpire Judgements</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {pagedAppeals.map((item) => (
                    <tr key={item.appeal_id} className="hover:bg-slate-50/60 transition-colors align-top">
                      <td className="py-4 pl-6 pr-3">{renderMatch(item)}</td>
                      <td className="py-4 px-3">{renderAppealType(item)}</td>
                      <td className="py-4 px-3">{renderReview(item)}</td>
                      <td className="py-4 px-3">{renderOfficials(item)}</td>
                      <td className="py-4 px-3">{renderVideosAndComments(item)}</td>
                      <td className="py-4 pl-3 pr-6">{renderJudgements(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile & tablet cards */}
            <div className="lg:hidden divide-y divide-slate-100">
              {pagedAppeals.map((item) => (
                <div key={item.appeal_id} className="p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    {renderMatch(item)}
                    <div className="shrink-0">{renderAppealType(item)}</div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1.5">DRS Review &amp; Final Decision</p>
                    {renderReview(item)}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1.5">Officials</p>
                    {renderOfficials(item)}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-600 uppercase mb-1.5">Cameras &amp; Comments</p>
                      {renderVideosAndComments(item)}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-600 uppercase mb-1.5">Umpire Judgements</p>
                      {renderJudgements(item)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination — 100 appeals per page */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                <p className="text-xs text-slate-700">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredAppeals.length)} of {filteredAppeals.length} appeals
                </p>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Back
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`w-8 h-8 text-xs font-semibold rounded-lg cursor-pointer ${
                        n === currentPage ? "bg-slate-900 text-white" : "text-slate-600 bg-white border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setPage(currentPage + 1)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Umpire performance report */}
      {showUmpireReport && matchedUmpires.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex overflow-y-auto p-3 sm:p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 m-auto overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <UmpireIcon className="w-4.5 h-4.5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Umpire Report</h3>
                  <p className="text-xs text-slate-700 mt-0.5">Appeal performance across this tournament.</p>
                </div>
              </div>
              <button
                onClick={() => setShowUmpireReport(false)}
                className="p-1.5 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-5 sm:p-6 space-y-5">
              {matchedUmpires.map((u: any, i: number) => {
                const accuracy = Math.max(0, Math.min(100, Number(u.accuracy) || 0));
                const stats = [
                  { label: "Matches Officiated", value: u.matches_officiated },
                  { label: "Appeals Faced", value: u.appeals_faced },
                  { label: "Retained", value: u.retained },
                  { label: decisionLabel("Overturned"), value: u.overturned },
                  { label: "Umpire's Call", value: u.umpires_call },
                ];
                return (
                  <div key={`${u.name}-${i}`} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-10 h-10 shrink-0 rounded-full bg-slate-900 text-white text-sm font-bold flex items-center justify-center">
                          {initials(u.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{u.name}</p>
                          <p className="text-[11px] text-slate-700">{u.role || "Umpire"}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold text-slate-900 leading-none">{accuracy}%</p>
                        <p className="text-[11px] text-slate-700 mt-1">Accuracy</p>
                      </div>
                    </div>

                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-4">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${accuracy}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {stats.map((st) => (
                        <div key={st.label} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
                          <p className="text-lg font-bold text-slate-900">{st.value ?? 0}</p>
                          <p className="text-[10px] font-semibold text-slate-700 mt-0.5">{st.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Umpire Judgements list popup */}
      {judgementsAppeal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex overflow-y-auto p-3 sm:p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 m-auto overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <UmpireIcon className="w-4.5 h-4.5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Umpire Judgements</h3>
                  <p className="text-xs text-slate-700 mt-0.5">View and manage official adjudications for this protocol incident.</p>
                </div>
              </div>
              <button
                onClick={() => setJudgementsAppealId(null)}
                className="p-1.5 rounded-full text-slate-600 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100">
              {toJudgements(judgementsAppeal.umpire_judgement).length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-slate-600 italic">No judgements recorded yet.</p>
              ) : (
                toJudgements(judgementsAppeal.umpire_judgement).map((j: any, i: number) => {
                  const correct = j.judgement.toLowerCase() === "correct";
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-9 h-9 shrink-0 rounded-full text-xs font-bold flex items-center justify-center ${correct ? "bg-indigo-50 text-indigo-600" : "bg-rose-50 text-rose-600"}`}>
                          {initials(j.judgementor)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{j.judgementor || "Unknown"}</p>
                          <p className="text-[11px] text-slate-700">Submitted {formatWhen((j as any).created_at)}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold ${correct ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                        {correct ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {j.judgement}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/60">
              <button
                onClick={() => openJudge(judgementsAppeal)}
                className="inline-flex items-center gap-1 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Judgement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Judgement popup */}
      {judgingAppeal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex overflow-y-auto p-3 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 m-auto overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <UmpireIcon className="w-4.5 h-4.5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Add Judgement</h3>
                  <p className="text-xs text-slate-700 mt-0.5">
                    {judgingAppeal.match_name} · Over {judgingAppeal.over_number} · {judgingAppeal.appeal_type}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setJudgingAppeal(null)}
                className="p-1.5 rounded-full text-slate-600 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 sm:px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                {(["Correct", "Incorrect"] as const).map((opt) => {
                  const active = judgementChoice === opt;
                  const good = opt === "Correct";
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => { setJudgementChoice(opt); setJudgementError(""); }}
                      className={`inline-flex items-center justify-center gap-1.5 py-3 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                        active
                          ? good
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-md"
                            : "bg-red-600 border-red-600 text-white shadow-md"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {good ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {opt}
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-slate-700 mt-4">
                Judged by <span className="font-semibold text-slate-700">{currentUserName}</span>
              </p>

              {judgementError && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{judgementError}</div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/60">
              <button
                onClick={() => setJudgingAppeal(null)}
                disabled={submittingJudgement}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
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

      {/* Videos (six cameras + appeal clips) & comments popup — dark, compact */}
      {videoAppeal && (() => {
        const clips = getClips(videoAppeal);
        const active = clips.all.find((c) => c.key === activeClip) || clips.cams[0];
        const comments: any[] = Array.isArray(videoAppeal.comments) ? videoAppeal.comments : [];
        const clipButton = (c: { key: string; label: string; url: string }) => (
          <button
            key={c.key}
            onClick={() => setActiveClip(c.key)}
            className={`shrink-0 w-28 lg:w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-lg border transition-all cursor-pointer ${
              active.key === c.key
                ? "bg-slate-700 border-indigo-400 ring-1 ring-indigo-400/40"
                : "bg-slate-800 border-slate-700 hover:border-slate-500"
            }`}
          >
            <span className={`w-6 h-6 shrink-0 rounded-full bg-slate-900 flex items-center justify-center ${c.url ? "text-slate-100" : "text-slate-600"}`}>
              <Play className="w-3 h-3 fill-current" />
            </span>
            <span className={`text-[11px] font-bold truncate ${c.url ? "text-slate-100" : "text-slate-500"}`}>{c.label}</span>
          </button>
        );
        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex overflow-y-auto p-2 sm:p-4">
            <div className="bg-slate-900 w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-700 m-auto p-2.5 sm:p-3 space-y-2.5">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_160px] gap-2.5">
                <div className="relative bg-black rounded-xl overflow-hidden aspect-video max-h-[52vh] w-full flex items-center justify-center">
                  <div className="absolute top-2.5 left-2.5 z-10 bg-white/20 backdrop-blur px-3 py-1 rounded-lg text-white text-xs font-bold">
                    Over - {videoAppeal.over_number}
                  </div>
                  <div className="absolute bottom-2.5 left-2.5 z-10 bg-black/60 px-2 py-0.5 rounded-md text-white text-[10px] font-semibold pointer-events-none">
                    {active.label}
                  </div>
                  <button
                    onClick={() => setVideoAppealId(null)}
                    className="absolute top-2.5 right-2.5 z-10 p-1.5 bg-black/60 text-white rounded-full cursor-pointer hover:bg-black"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  {active.url ? (
                    <video key={active.url} controls autoPlay preload="auto" className="w-full h-full object-contain">
                      <source src={active.url} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-500 gap-1.5">
                      <Play className="w-9 h-9 text-slate-600" />
                      <p className="text-[11px]">No video available for {active.label}</p>
                    </div>
                  )}
                </div>

                <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-y-auto lg:max-h-[52vh] pb-1 lg:pb-0 [scrollbar-width:thin]">
                  {clips.cams.map(clipButton)}
                  {clips.appeal.length > 0 && (
                    <>
                      <p className="hidden lg:block text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-1">Appeal Video</p>
                      {clips.appeal.map(clipButton)}
                    </>
                  )}
                </div>
              </div>

              <div className="bg-slate-800/70 border border-slate-700 rounded-xl overflow-hidden">
                <h3 className="px-4 py-2 text-sm font-bold text-slate-100 border-b border-slate-700">Comments ({comments.length})</h3>
                <div className="max-h-[170px] overflow-y-auto divide-y divide-slate-700/60 px-4 [scrollbar-width:thin]">
                  {comments.length === 0 ? (
                    <p className="py-3 text-xs text-slate-500 italic">No comments yet. Be the first to write one!</p>
                  ) : (
                    comments.map((c: any, i: number) => {
                      const when = c.created_at ? new Date(c.created_at) : null;
                      const validWhen = when && !Number.isNaN(when.getTime()) ? when : null;
                      return (
                        <div key={i} className="py-2 flex items-start gap-2.5">
                          <span className={`w-7 h-7 shrink-0 rounded-full text-white text-xs font-bold flex items-center justify-center ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                            {c.commentor ? c.commentor.charAt(0).toUpperCase() : "U"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                              <span className="text-xs font-bold text-slate-100">{c.commentor || "Unknown"}</span>
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                <Calendar className="w-3 h-3" />
                                {validWhen ? formatWhen(validWhen.toISOString()).split(",")[0] : "Just now"}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                <Clock className="w-3 h-3" />
                                {validWhen ? validWhen.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 mt-0.5 break-words">{c.comment}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="p-2 border-t border-slate-700">
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3">
                    <input
                      type="text"
                      placeholder="Write Comment Here"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                      className="flex-1 bg-transparent py-2 text-xs focus:outline-none text-slate-100 placeholder:text-slate-500"
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={submittingComment || !newComment.trim()}
                      className="p-1.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      aria-label="Send comment"
                    >
                      {submittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}