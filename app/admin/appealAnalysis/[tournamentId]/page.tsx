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
  ChevronDown
} from "lucide-react";

interface UserData {
  name: string;
  email: string;
  profileImage?: string;
}

export default function AppealAnalysisPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const tournamentId = params.tournamentId as string;
  const tournamentName = searchParams.get("name");

  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [appeals, setAppeals] = useState<any[]>([]);
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

  useEffect(() => {
    fetchAppealData();
  }, [tournamentId]);

  const fetchAppealData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/export/tournaments/${tournamentId}/appeal-analysis`, {
        credentials: "include",
      });
      const json = await res.json();
      console.log("Fetched appeal analysis data:", json);
      if (json.success) {
        setAppeals(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch appeal analysis:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    setExporting(true);
    window.location.href = `${process.env.NEXT_PUBLIC_Backend_URL}/export/auth?tournamentId=${tournamentId}`;
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
        fetchAppealData();
      } else {
        alert(json.message || "Failed to post comment");
      }
    } catch (err) {
      console.error("Error posting comment:", err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const filteredAppeals = appeals.filter((item) => {
    const matchesMatch = matchFilter === "" || item.match_name?.toLowerCase().includes(matchFilter.toLowerCase());
    const matchesUmpire = umpireFilter === "" || item.umpire?.toLowerCase().includes(umpireFilter.toLowerCase());
    const matchesReferee = refereeFilter === "" || item.referee?.toLowerCase().includes(refereeFilter.toLowerCase());
    const matchesType = appealTypeFilter === "" || item.appeal_type?.toLowerCase().includes(appealTypeFilter.toLowerCase());
    const matchesDecision = decisionFilter === "" || item.decision === decisionFilter;
    const matchesInnings = inningsFilter === "" || String(item.innings) === inningsFilter;
    return matchesMatch && matchesUmpire && matchesReferee && matchesType && matchesDecision && matchesInnings;
  });

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        
        <span className="cursor-pointer hover:underline" onClick={() => router.back()}>Tournament</span> 
        
        <ChevronRight className="w-4 h-4 text-slate-400" />
        <span className="text-slate-900 font-medium">Appeal Analysis</span>
      </div>

      {/* Top Banner & Export Action */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs items-center">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 flex-1">
            
            <div>
              <p className="text-xs text-slate-400 font-medium">Tournament</p>
              <p className="text-sm font-bold text-slate-800 truncate max-w-full">
                {tournamentName ? decodeURIComponent(tournamentName) : tournamentId}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 flex-1">
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
        <div className="flex justify-end gap-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-xs cursor-pointer disabled:opacity-50"
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
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-4">
        {/* Umpire Filter */}
        <div className="flex-1 min-w-[160px]">
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
        <div className="flex-1 min-w-[160px]">
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
        <div className="flex-1 min-w-[160px]">
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
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Decision</label>
          <div className="relative flex items-center">
            <select 
              value={decisionFilter}
              onChange={(e) => setDecisionFilter(e.target.value)}
              className="w-full pl-3 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none appearance-none cursor-pointer text-black"
            >
              <option value="">All Decisions</option>
              <option value="Stay">Stay</option>
              <option value="Overturned">Overturned</option>
              <option value="Umpire's Call">Umpire's Call</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
          </div>
        </div>

        {/* Innings Filter (Dropdown) */}
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Innings</label>
          <div className="relative flex items-center">
            <select 
              value={inningsFilter}
              onChange={(e) => setInningsFilter(e.target.value)}
              className="w-full pl-3 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none appearance-none cursor-pointer text-black"
            >
              <option value="">All Innings</option>
              <option value="1">1st Innings</option>
              <option value="2">2nd Innings</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Appeals Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading appeals data...</span>
          </div>
        ) : filteredAppeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
            <MessageSquare className="w-8 h-8 text-slate-300" />
            <p className="text-sm font-medium">No appeal records found</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase bg-slate-50/50">
                <th className="py-4 px-6">Match</th>
                <th className="py-4 px-4">Ball</th>
                <th className="py-4 px-4">Appeal</th>
                <th className="py-4 px-4">Decision</th>
                <th className="py-4 px-4">Umpire</th>
                <th className="py-4 px-4">Referee</th>
                <th className="py-4 px-4">Innings</th>
                <th className="py-4 px-6 text-center">Cameras</th>
                <th className="py-4 px-6 text-center">Comments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredAppeals.map((item, index) => {
                const commentsList = Array.isArray(item.comments) ? item.comments : [];

                return (
                  <tr key={index} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-6 font-medium text-slate-900">{item.match_name || "Match"}</td>
                    <td className="py-4 px-4 font-mono">{item.over_number || "0.0"}</td>
                    <td className="py-4 px-4">{item.appeal_type || "Normal Ball"}</td>
                    <td className="py-4 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        item.decision === "Stay" 
                          ? "bg-blue-50 text-blue-600 border-blue-200" 
                          : "bg-emerald-50 text-emerald-600 border-emerald-200"
                      }`}>
                        {item.decision || "Stay"}
                      </span>
                    </td>
                    <td className="py-4 px-4">{item.umpire || "-"}</td>
                    <td className="py-4 px-4">{item.referee || "-"}</td>
                    <td className="py-4 px-4">{item.innings || "-"}</td>
                    <td className="py-4 px-6">
                      <div className="grid grid-cols-3 gap-1.5 max-w-[280px] mx-auto">
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
                              className="flex items-center justify-center gap-1 px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-md text-xs font-medium text-slate-600 cursor-pointer shadow-2xs"
                            >
                              <Play className="w-3 h-3 text-slate-400 fill-slate-400" />
                              <span>Cam {camNum}</span>
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center">
                      {commentsList.length === 0 ? (
                        <span className="text-xs text-slate-400 font-medium">No Comment</span>
                      ) : (
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
                          <span className="text-xs font-semibold text-amber-700 ml-1">
                            {commentsList.length} {commentsList.length === 1 ? "Comment" : "Comments"}
                          </span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Camera Video Player & Comment Modal */}
      {selectedVideo && (() => {
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col my-8">
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

              <div className="p-6 bg-white flex flex-col max-h-[380px]">
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
                            <div className="flex items-center gap-2">
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