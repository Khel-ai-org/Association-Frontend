"use client";

import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Search, Trash2, Eye, Edit2, Play, ChevronDown, Send, Loader2, RotateCcw } from 'lucide-react';
import { uploadCocVideoPipeline, formatFileSize, CocVideoItem, deleteCocVideoClip } from '@/lib/cocVideoService';
import { fetchBallDetails, flattenBallVideos, FlattenedBallVideo } from '@/lib/ballDetailsService';

interface RefereeActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  ballInfo: any;
  onSaveAction: (action: any) => void;
  matchData?: any; // Scorecard data passed from parent
}

export const RefereeActionModal: React.FC<RefereeActionModalProps> = ({ 
  isOpen, 
  onClose, 
  matchId, 
  ballInfo, 
  onSaveAction,
  matchData,
}) => {
  const [activeTab, setActiveTab] = useState<'coc' | 'appeal' | 'suspected' | 'key_moment' | 'upload_video'>('coc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Extract Teams from matchData (Scorecard)
  const matchDetails = Array.isArray(matchData) ? matchData[0] : matchData;
  const homeTeam = matchDetails?.homeTeam || matchDetails?.innings_1?.team_name || 'Home Team';
  const awayTeam = matchDetails?.awayTeam || matchDetails?.innings_2?.team_name || 'Away Team';
  const teamOptions = [homeTeam, awayTeam].filter(Boolean);

  // Dynamic Innings & Batting/Bowling Teams based on ballInfo or default 1st innings
  const innings = ballInfo?.innings || 1;
  const battingTeam = innings === 1 ? (matchDetails?.innings_1?.team_name || homeTeam) : (matchDetails?.innings_2?.team_name || awayTeam);
  const bowlingTeam = innings === 1 ? (matchDetails?.innings_2?.team_name || awayTeam) : (matchDetails?.innings_1?.team_name || homeTeam);

  const umpire1 = matchDetails?.umpire1 || 'Umpire 1';
  const umpire2 = matchDetails?.umpire2 || 'Umpire 2';

  // Form states for COC
  const [cocTeam, setCocTeam] = useState('');
  const [cocPlayer, setCocPlayer] = useState('');
  const [playerOptions, setPlayerOptions] = useState<string[]>([]);
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  const [isPlayerDropdownOpen, setIsPlayerDropdownOpen] = useState(false);

  const [isCocCategoryOpen, setIsCocCategoryOpen] = useState(false);
  const [cocCategory, setCocCategory] = useState('');
  const [customCocOther, setCustomCocOther] = useState('');
  const [isCocLevelOpen, setIsCocLevelOpen] = useState(false);
  const [cocLevel, setCocLevel] = useState('');
  const [cocDesc, setCocDesc] = useState('');

  // Fetch squad template players when COC team is selected
  useEffect(() => {
    if (!cocTeam) {
      setPlayerOptions([]);
      setCocPlayer('');
      return;
    }

    const targetUrl = `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/teams/template/${encodeURIComponent(cocTeam.trim())}`;
    console.log("Fetching squad template from:", targetUrl);

    fetch(targetUrl, {
      headers: { "ngrok-skip-browser-warning": "true" }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`No template found (Status: ${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (data.found && data.players && data.players.length > 0) {
          const names = data.players.map((p: any) => p.name || "").filter(Boolean);
          setPlayerOptions(names);
        } else {
          // Fallback to matchData players if template not found
          const teamInnings = matchDetails?.innings_1?.team_name === cocTeam ? matchDetails?.innings_1 : matchDetails?.innings_2;
          const batsmenNames = teamInnings?.batsmen?.map((b: any) => b.name) || [];
          setPlayerOptions(batsmenNames);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch squad template:", err);
        // Fallback to matchData players
        const teamInnings = matchDetails?.innings_1?.team_name === cocTeam ? matchDetails?.innings_1 : matchDetails?.innings_2;
        const batsmenNames = teamInnings?.batsmen?.map((b: any) => b.name) || [];
        setPlayerOptions(batsmenNames);
      });
  }, [cocTeam, matchDetails]);

  // Form states for Appeal
  const [reviewTaken, setReviewTaken] = useState<boolean>(true);
  const [reviewedBy, setReviewedBy] = useState<'Player' | 'Umpire'>('Player');
  const [reviewingTeam, setReviewingTeam] = useState<'Batting' | 'Bowling'>('Bowling');
  
  const [umpire, setUmpire] = useState(umpire1);

  const [appealType, setAppealType] = useState<string>('Caught');
  const [originalDecision, setOriginalDecision] = useState<string>('Not Out');
  const [finalDecision, setFinalDecision] = useState<string>('Not Out');
  const [reviewResult, setReviewResult] = useState<string>('Retained');

  const appealTypes = [
    'Caught', 'LBW', 'Bowled', 'Run Out',
    'Stumped', 'Hit Wicket', 'Obstructing Field', 'Hit Ball Twice',
    'No Ball', 'Wide Ball', 'Timed Out'
  ];

  // Form states for Suspected Insight
  const [suspectedActions, setSuspectedActions] = useState<Record<string, boolean>>({
    chucking: false,
    ballTampering: false,
    beamer: false,
    timeWasting: false,
    dangerousDelivery: false,
    others: false,
  });
  const [suspectedDesc, setSuspectedDesc] = useState('');

  // Form states for Key Moment / Celebrations
  const [keyMomentDesc, setKeyMomentDesc] = useState('');
  const [isVideoPreviewOpen, setIsVideoPreviewOpen] = useState(false);

  // Form states for Upload Video (Tab 5)
  // `videoItems` only tracks THIS session's in-flight uploads (pending/uploading/error).
  // Once a file finishes uploading it's dropped here and re-fetched from the server,
  // which is the persistent source of truth for "already uploaded" videos.
  const [videoItems, setVideoItems] = useState<CocVideoItem[]>([]);
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [previewVideoTitle, setPreviewVideoTitle] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [serverVideos, setServerVideos] = useState<FlattenedBallVideo[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [videosLoadError, setVideosLoadError] = useState('');

  const loadBallVideos = async () => {
    const ballId = ballInfo?.id;
    if (!matchId || !ballId) return;

    setIsLoadingVideos(true);
    setVideosLoadError('');
    try {
      const ball = await fetchBallDetails(matchId, ballId);
      setServerVideos(flattenBallVideos(ball.videos || []));
    } catch (err: any) {
      console.error('[ball videos fetch error]', err);
      setVideosLoadError(err.message || 'Failed to load uploaded videos');
    } finally {
      setIsLoadingVideos(false);
    }
  };

  // Load previously uploaded videos for this ball whenever the modal opens for it,
  // so the list survives a refresh instead of living only in local state.
  useEffect(() => {
    if (isOpen && matchId && ballInfo?.id) {
      loadBallVideos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, matchId, ballInfo?.id]);

  // Clean up object URLs when unmounting
  useEffect(() => {
    return () => {
      videoItems.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const startUploadForItem = async (item: CocVideoItem) => {
    if (!matchId) {
      setError("Match ID is required for video upload");
      return;
    }

    setVideoItems(prev => prev.map(v => v.id === item.id ? { ...v, status: 'uploading', progress: 0, error: undefined } : v));

    try {
      const overNum = ballInfo?.over_number ? String(ballInfo.over_number) : '0.1';
      await uploadCocVideoPipeline(
        matchId,
        overNum,
        Number(innings) || 1,
        item.file,
        (progressPct) => {
          setVideoItems(prev => prev.map(v => v.id === item.id ? { ...v, progress: progressPct } : v));
        }
      );

      // Uploaded & confirmed on the backend now — drop from local in-flight
      // state and refresh from the server, which is the source of truth.
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      setVideoItems(prev => prev.filter(v => v.id !== item.id));
      await loadBallVideos();
    } catch (err: any) {
      console.error("[video upload error]", err);
      setVideoItems(prev => prev.map(v => v.id === item.id ? {
        ...v,
        status: 'error',
        error: err.message || 'Upload failed',
      } : v));
    }
  };

  const handleFilesSelected = (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(f.name));
    if (fileArray.length === 0) {
      setError("Please select valid video files (MP4, MOV, AVI, MKV, WebM)");
      return;
    }

    const newItems: CocVideoItem[] = fileArray.map(file => {
      const previewUrl = URL.createObjectURL(file);
      const id = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      return {
        id,
        file,
        previewUrl,
        name: file.name,
        sizeFormatted: formatFileSize(file.size),
        progress: 0,
        status: 'pending',
      };
    });

    setVideoItems(prev => [...prev, ...newItems]);
    // Auto-trigger upload pipeline
    newItems.forEach(item => startUploadForItem(item));
  };

  const handleDeleteVideoItem = (id: string) => {
    setVideoItems(prev => {
      const target = prev.find(i => i.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter(i => i.id !== id);
    });
  };

  const handleOpenPreview = (item: CocVideoItem) => {
    setPreviewVideoUrl(item.previewUrl);
    setPreviewVideoTitle(item.name);
    setIsVideoPreviewOpen(true);
  };

  const handleOpenServerPreview = (video: FlattenedBallVideo) => {
    setPreviewVideoUrl(video.url);
    setPreviewVideoTitle(`${video.tag} · ${video.clipLabel}`);
    setIsVideoPreviewOpen(true);
  };

  const [deletingClipKeys, setDeletingClipKeys] = useState<Set<string>>(new Set());

  const handleDeleteServerVideo = async (video: FlattenedBallVideo) => {
    if (!matchId) return;
    const confirmed = window.confirm(`Delete ${video.tag} · ${video.clipLabel}? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingClipKeys(prev => new Set(prev).add(video.key));
    try {
      await deleteCocVideoClip(matchId, video.recordId, video.clipLabel);
      await loadBallVideos();
    } catch (err: any) {
      console.error('[delete video error]', err);
      setVideosLoadError(err.message || 'Failed to delete video');
    } finally {
      setDeletingClipKeys(prev => {
        const next = new Set(prev);
        next.delete(video.key);
        return next;
      });
    }
  };

  // Prefill data if available from ballInfo
  useEffect(() => {
    if (ballInfo) {
      if (ballInfo.suspect) {
        const suspectVal = String(ballInfo.suspect).toLowerCase();
        setSuspectedDesc(suspectVal);
        if (suspectVal.includes('chucking')) {
          setSuspectedActions(prev => ({ ...prev, chucking: true }));
        } else if (suspectVal.includes('ball tampering') || suspectVal.includes('ball_tampering')) {
          setSuspectedActions(prev => ({ ...prev, ballTampering: true }));
        } else if (suspectVal.includes('beamer')) {
          setSuspectedActions(prev => ({ ...prev, beamer: true }));
        } else if (suspectVal.includes('time wasting') || suspectVal.includes('time_wasting')) {
          setSuspectedActions(prev => ({ ...prev, timeWasting: true }));
        } else if (suspectVal.includes('dangerous delivery') || suspectVal.includes('dangerous_delivery')) {
          setSuspectedActions(prev => ({ ...prev, dangerousDelivery: true }));
        } else {
          setSuspectedActions(prev => ({ ...prev, others: true }));
        }
      }
      if (ballInfo.celebrations) {
        const celebrVal = Array.isArray(ballInfo.celebrations) 
          ? ballInfo.celebrations.join(", ") 
          : ballInfo.celebrations;
        setKeyMomentDesc(celebrVal);
      }
    }
  }, [ballInfo]);

  if (!isOpen) return null;

  const handleNextTab = () => {
    if (activeTab === 'coc') setActiveTab('appeal');
    else if (activeTab === 'appeal') setActiveTab('suspected');
    else if (activeTab === 'suspected') setActiveTab('key_moment');
    else if (activeTab === 'key_moment') setActiveTab('upload_video');
  };

  // Submit Code of Conduct (COC) API
  const handleCocSubmit = async () => {
    const ballId = ballInfo?.id;
    if (!matchId || !ballId) {
      setError("Missing match or ball ID");
      return;
    }

    const payload = {
      team: cocTeam,
      player: cocPlayer,
      incident_category: cocCategory === 'Others' ? customCocOther : cocCategory,
      offence_level: cocLevel,
      description: cocDesc
    };

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/matches/${matchId}/balls/${ballId}/coc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to submit Code of Conduct");

      onSaveAction({
        id: Date.now(),
        matchId: matchId,
        over: ballInfo?.over_number ? `Over ${Math.floor(Number(ballInfo.over_number)) + 1}` : "Over 12",
        ball: ballInfo?.over_number || "12.4",
        batterBowler: cocPlayer || "Unknown Player",
        actionTaken: "COC",
        details: `${cocCategory} - ${cocLevel}`,
        by: "Ranjan Madugalle",
        role: "Match Referee",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to save Code of Conduct details.");
    } finally {
      setLoading(false);
    }
  };

  // Submit Suspected Insight API
  const handleSuspectSubmit = async () => {
    const ballId = ballInfo?.id;
    if (!matchId || !ballId) {
      setError("Missing match or ball ID");
      return;
    }

    // Determine suspect payload based on active checkboxes or description for others
    const activeKey = Object.keys(suspectedActions).find(k => suspectedActions[k]);
    let suspectPayload = "";
    
    if (suspectedActions.others) {
      suspectPayload = suspectedDesc.trim().toLowerCase();
    } else if (activeKey) {
      suspectPayload = activeKey.replace(/([A-Z])/g, " $1").toLowerCase().trim();
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/matches/${matchId}/balls/${ballId}/suspect`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ suspect: suspectPayload }),
      });

      if (!res.ok) throw new Error("Failed to update suspect");

      onSaveAction({
        id: Date.now(),
        matchId: matchId,
        over: ballInfo?.over_number ? `Over ${Math.floor(Number(ballInfo.over_number)) + 1}` : "Over 12",
        ball: ballInfo?.over_number || "12.4",
        batterBowler: cocPlayer || ballInfo?.batsman_name || "Unknown Player",
        actionTaken: "SUSPECTED INSIGHT",
        details: suspectPayload || "Suspected action recorded",
        by: "Ranjan Madugalle",
        role: "Match Referee",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to save suspect details.");
    } finally {
      setLoading(false);
    }
  };

  // Submit Celebrations / Key Moment API
  const handleCelebrationsSubmit = async () => {
    const ballId = ballInfo?.id;
    if (!matchId || !ballId) {
      setError("Missing match or ball ID");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/matches/${matchId}/balls/${ballId}/celebrations`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ celebrations: [keyMomentDesc] }),
      });

      if (!res.ok) throw new Error("Failed to update celebrations");

      onSaveAction({
        id: Date.now(),
        matchId: matchId,
        over: ballInfo?.over_number ? `Over ${Math.floor(Number(ballInfo.over_number)) + 1}` : "Over 12",
        ball: ballInfo?.over_number || "12.4",
        batterBowler: cocPlayer || ballInfo?.batsman_name || "Unknown Player",
        actionTaken: "KEY MOMENT",
        details: keyMomentDesc || "Key moment recorded",
        by: "Ranjan Madugalle",
        role: "Match Referee",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to save key moment.");
    } finally {
      setLoading(false);
    }
  };

  // Submit Appeal API
  const handleAppealSubmit = async () => {
    const ballId = ballInfo?.id;
    if (!matchId || !ballId) {
      setError("Missing match or ball ID");
      return;
    }

    let statusPayload = finalDecision;
    if (reviewTaken && reviewedBy === 'Player') {
      statusPayload = reviewResult;
    }

    const payload = {
      match_id: matchId,
      innings: innings,
      drs_referred: reviewTaken,
      reviewed_by: reviewedBy,
      reviewing_team: reviewedBy === 'Player' ? reviewingTeam : null,
      appeal_type: appealType,
      status: statusPayload,
      original_decision: originalDecision,
      final_decision: finalDecision,
      over_number: ballInfo?.over_number,
      metadata: { umpire }
    };

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/matches/${matchId}/balls/${ballId}/appeal`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to submit appeal");

      onSaveAction({
        id: Date.now(),
        matchId: matchId,
        over: ballInfo?.over_number ? `Over ${Math.floor(Number(ballInfo.over_number)) + 1}` : "Over 12",
        ball: ballInfo?.over_number || "12.4",
        batterBowler: ballInfo?.batsman_name || "Unknown Player",
        actionTaken: "APPEAL",
        details: `${appealType} - ${finalDecision}`,
        by: "Ranjan Madugalle",
        role: "Match Referee",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      });
      onClose();
    } catch (error) {
      console.error("Error submitting appeal:", error);
      setError("Failed to save appeal details.");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = () => {
    const actionDetails = activeTab === 'upload_video'
      ? `${serverVideos.length} Video(s) Uploaded`
      : cocCategory || cocDesc || "Recorded via Referee Modal";

    onSaveAction({
      id: Date.now(),
      matchId: matchId,
      over: ballInfo?.over_number ? `Over ${Math.floor(Number(ballInfo.over_number)) + 1}` : "Over 12",
      ball: ballInfo?.over_number || "12.4",
      batterBowler: cocPlayer || ballInfo?.batsman_name || "Marco Jansen",
      actionTaken: activeTab.toUpperCase(),
      details: actionDetails,
      uploadedVideos: serverVideos.map(v => ({ tag: v.tag, clip: v.clipLabel, url: v.url })),
      by: "Ranjan Madugalle",
      role: "Match Referee",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    });
    onClose();
  };

  const isNoBallType = appealType === 'No Ball';
  const isWideType = appealType === 'Wide Ball';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-[850px] max-h-[95vh] overflow-y-auto p-6 md:p-8 relative flex flex-col custom-scrollbar text-black">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 w-9 h-9 flex items-center justify-center rounded-full border border-gray-100 bg-gray-50/50 hover:bg-gray-100 transition-colors cursor-pointer z-10"
        >
          <X size={18} />
        </button>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl text-center">
            {error}
          </div>
        )}

        {/* --- TABS NAVIGATION BAR --- */}
        <div className="flex items-center justify-center bg-slate-50 p-1.5 rounded-2xl border border-slate-200 mb-8 max-w-xl mx-auto w-full">
          {[
            { id: 'coc', label: 'COC' },
            { id: 'appeal', label: 'Appeal' },
            { id: 'suspected', label: 'Suspected Insight' },
            { id: 'key_moment', label: 'Key Moment' },
            { id: 'upload_video', label: 'Upload Video' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all truncate ${
                activeTab === tab.id
                  ? 'bg-[#0F1117] text-white shadow-md'
                  : 'text-slate-900 hover:text-black'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── TAB 1: CODE OF CONDUCT (COC) ─── */}
        {activeTab === 'coc' && (
  <div className="space-y-6 animate-in fade-in duration-200">
    {/* HEADER */}
    <div className="text-center">
      <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-indigo-100 text-[#6366F1]">
        ⚖️
      </div>

      <h3 className="text-xl font-bold text-black">
        Code Of Conduct
      </h3>

      <p className="text-slate-600 text-xs font-medium mt-0.5">
        Review and Record Player/ Match Officials Behaviours.
      </p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* ================= TEAM ================= */}
      <div className="relative">
        <label className="text-xs font-bold text-black block mb-1.5">
          Team
        </label>

        <div
          onClick={() => {
            setIsTeamDropdownOpen(!isTeamDropdownOpen);
            setIsPlayerDropdownOpen(false);
            setIsCocCategoryOpen(false);
            setIsCocLevelOpen(false);
          }}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold text-black flex items-center justify-between cursor-pointer"
        >
          <span className="truncate">
            {cocTeam || "Select Your Team"}
          </span>

          <ChevronDown
            size={16}
            className={`text-black shrink-0 transition-transform ${
              isTeamDropdownOpen ? "rotate-180" : ""
            }`}
          />
        </div>

        {isTeamDropdownOpen && (
          <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 max-h-60 overflow-y-auto space-y-1 text-xs font-bold text-black custom-scrollbar">
            {teamOptions.length > 0 ? (
              teamOptions.map((team) => (
                <div
                  key={team}
                  onClick={() => {
                    setCocTeam(team);
                    setCocPlayer("");
                    setIsTeamDropdownOpen(false);
                  }}
                  className={`px-3 py-2.5 rounded-xl cursor-pointer flex items-center gap-2 transition-colors ${
                    cocTeam === team
                      ? "bg-indigo-50 text-indigo-600"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      cocTeam === team
                        ? "bg-indigo-600"
                        : "bg-black"
                    }`}
                  />

                  {team}
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-slate-400 text-center">
                No teams available
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= PLAYER ================= */}
      <div className="relative">
        <label className="text-xs font-bold text-black block mb-1.5">
          Player
        </label>

        <div
          onClick={() => {
            if (!cocTeam) return;

            setIsPlayerDropdownOpen(!isPlayerDropdownOpen);
            setIsTeamDropdownOpen(false);
            setIsCocCategoryOpen(false);
            setIsCocLevelOpen(false);
          }}
          className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold text-black flex items-center justify-between ${
            cocTeam
              ? "cursor-pointer"
              : "cursor-not-allowed opacity-60"
          }`}
        >
          <span className="truncate">
            {cocPlayer || "Select Player"}
          </span>

          <ChevronDown
            size={16}
            className={`text-black shrink-0 transition-transform ${
              isPlayerDropdownOpen ? "rotate-180" : ""
            }`}
          />
        </div>

        {isPlayerDropdownOpen && (
          <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 max-h-60 overflow-y-auto space-y-1 text-xs font-bold text-black custom-scrollbar">
            {playerOptions.length > 0 ? (
              playerOptions.map((player) => (
                <div
                  key={player}
                  onClick={() => {
                    setCocPlayer(player);
                    setIsPlayerDropdownOpen(false);
                  }}
                  className={`px-3 py-2.5 rounded-xl cursor-pointer flex items-center gap-2 transition-colors ${
                    cocPlayer === player
                      ? "bg-indigo-50 text-indigo-600"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      cocPlayer === player
                        ? "bg-indigo-600"
                        : "bg-black"
                    }`}
                  />

                  {player}
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-slate-400 text-center">
                Select team first
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= INCIDENT CATEGORY ================= */}
      <div className="relative md:col-span-2">
        <label className="text-xs font-bold text-black block mb-1.5">
          Incident Category
        </label>

        <div
          onClick={() => {
            setIsCocCategoryOpen(!isCocCategoryOpen);
            setIsTeamDropdownOpen(false);
            setIsPlayerDropdownOpen(false);
            setIsCocLevelOpen(false);
          }}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold text-black flex items-center justify-between cursor-pointer"
        >
          <span
            className={`truncate ${
              cocCategory || customCocOther
                ? "text-black"
                : "text-slate-400"
            }`}
          >
            {cocCategory === "Others"
              ? customCocOther || "Others"
              : cocCategory || "Select Incident Category"}
          </span>

          <ChevronDown
            size={16}
            className={`text-black shrink-0 transition-transform ${
              isCocCategoryOpen ? "rotate-180" : ""
            }`}
          />
        </div>

        {/* CATEGORY DROPDOWN */}
        {isCocCategoryOpen && (
          <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden text-xs font-medium text-black">

            <div className="max-h-[420px] overflow-y-auto custom-scrollbar">

              {/* ================= PLAYER CONDUCT ================= */}
              <div>
                <div className="bg-[#F7F7F9] px-4 py-2.5 border-b border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">
                    Player Conduct
                  </p>
                </div>

                {[
                  "Verbal Abuse / Offensive Language",
                  "Aggressive Behaviour",
                  "Dissent Against Decision",
                  "Provocative Gesture",
                ].map((item) => (
                  <div
                    key={item}
                    onClick={() => {
                      setCocCategory(item);
                      setCustomCocOther("");
                      setIsCocCategoryOpen(false);
                    }}
                    className={`px-4 py-3 cursor-pointer flex items-center gap-3 border-b border-slate-100 transition-colors ${
                      cocCategory === item
                        ? "bg-indigo-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        cocCategory === item
                          ? "bg-indigo-600"
                          : "bg-[#6366F1]"
                      }`}
                    />

                    <span
                      className={
                        cocCategory === item
                          ? "text-indigo-600 font-semibold"
                          : "text-black"
                      }
                    >
                      {item}
                    </span>
                  </div>
                ))}
              </div>

              {/* ================= ON-FIELD CONDUCT ================= */}
              <div>
                <div className="bg-[#F7F7F9] px-4 py-2.5 border-b border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">
                    On-Field Conduct
                  </p>
                </div>

                {[
                  "Dangerous Bowling",
                  "Time Wasting",
                  "Deliberate Distraction",
                  "Ball Tampering",
                ].map((item) => (
                  <div
                    key={item}
                    onClick={() => {
                      setCocCategory(item);
                      setCustomCocOther("");
                      setIsCocCategoryOpen(false);
                    }}
                    className={`px-4 py-3 cursor-pointer flex items-center gap-3 border-b border-slate-100 transition-colors ${
                      cocCategory === item
                        ? "bg-indigo-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        cocCategory === item
                          ? "bg-indigo-600"
                          : "bg-[#6366F1]"
                      }`}
                    />

                    <span
                      className={
                        cocCategory === item
                          ? "text-indigo-600 font-semibold"
                          : "text-black"
                      }
                    >
                      {item}
                    </span>
                  </div>
                ))}
              </div>

              {/* ================= MATCH OFFICIAL ================= */}
              <div>
                <div className="bg-[#F7F7F9] px-4 py-2.5 border-b border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">
                    Match Official
                  </p>
                </div>

                {[
                  "Disrespect Toward Official",
                  "Intimidation of Official",
                  "Failure to Follow Instruction",
                ].map((item) => (
                  <div
                    key={item}
                    onClick={() => {
                      setCocCategory(item);
                      setCustomCocOther("");
                      setIsCocCategoryOpen(false);
                    }}
                    className={`px-4 py-3 cursor-pointer flex items-center gap-3 border-b border-slate-100 transition-colors ${
                      cocCategory === item
                        ? "bg-indigo-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        cocCategory === item
                          ? "bg-indigo-600"
                          : "bg-[#6366F1]"
                      }`}
                    />

                    <span
                      className={
                        cocCategory === item
                          ? "text-indigo-600 font-semibold"
                          : "text-black"
                      }
                    >
                      {item}
                    </span>
                  </div>
                ))}
              </div>

              {/* ================= MATCH INTEGRITY ================= */}
              <div>
                <div className="bg-[#F7F7F9] px-4 py-2.5 border-b border-slate-200">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">
                    Match Integrity
                  </p>
                </div>

                {[
                  "Suspected Match Manipulation",
                  "Betting-Related Violation",
                  "Corrupt Approach",
                ].map((item) => (
                  <div
                    key={item}
                    onClick={() => {
                      setCocCategory(item);
                      setCustomCocOther("");
                      setIsCocCategoryOpen(false);
                    }}
                    className={`px-4 py-3 cursor-pointer flex items-center gap-3 border-b border-slate-100 transition-colors ${
                      cocCategory === item
                        ? "bg-indigo-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        cocCategory === item
                          ? "bg-indigo-600"
                          : "bg-[#6366F1]"
                      }`}
                    />

                    <span
                      className={
                        cocCategory === item
                          ? "text-indigo-600 font-semibold"
                          : "text-black"
                      }
                    >
                      {item}
                    </span>
                  </div>
                ))}
              </div>

              {/* ================= OTHERS ================= */}
              <div>
                <div
                  onClick={() => {
                    setCocCategory("Others");
                    setIsCocCategoryOpen(false);
                  }}
                  className={`px-4 py-3.5 cursor-pointer flex items-center gap-3 transition-colors ${
                    cocCategory === "Others"
                      ? "bg-indigo-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      cocCategory === "Others"
                        ? "bg-indigo-600"
                        : "bg-[#6366F1]"
                    }`}
                  />

                  <span
                    className={
                      cocCategory === "Others"
                        ? "text-indigo-600 font-bold"
                        : "text-black font-semibold"
                    }
                  >
                    Others
                  </span>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ================= OTHERS INPUT ================= */}
        {cocCategory === "Others" && (
          <div className="mt-2 relative">
            <input
              type="text"
              value={customCocOther}
              onChange={(e) => setCustomCocOther(e.target.value)}
              placeholder="Write Others kind of Incident Here"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-black outline-none pr-10 focus:border-indigo-400"
            />

            <Send
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-600"
            />
          </div>
        )}
      </div>

      {/* ================= OFFENCE LEVEL ================= */}
      <div className="relative md:col-span-2">
        <label className="text-xs font-bold text-black block mb-1.5">
          Offence Level
        </label>

        <div
          onClick={() => {
            setIsCocLevelOpen(!isCocLevelOpen);
            setIsTeamDropdownOpen(false);
            setIsPlayerDropdownOpen(false);
            setIsCocCategoryOpen(false);
          }}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold text-black flex items-center justify-between cursor-pointer"
        >
          <span
            className={
              cocLevel ? "text-black" : "text-slate-400"
            }
          >
            {cocLevel || "Select Offence Level"}
          </span>

          <ChevronDown
            size={16}
            className={`text-black shrink-0 transition-transform ${
              isCocLevelOpen ? "rotate-180" : ""
            }`}
          />
        </div>

        {/* LEVEL DROPDOWN */}
        {isCocLevelOpen && (
          <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">

            {[
              {
                title: "Level 1 · Minor",
                value: "Level 1",
                desc: "Low-level misconduct",
              },
              {
                title: "Level 2 · Moderate",
                value: "Level 2",
                desc: "Repeated / more serious misconduct",
              },
              {
                title: "Level 3 · Serious",
                value: "Level 3",
                desc: "Significant breach of conduct",
              },
              {
                title: "Level 4 · Severe",
                value: "Level 4",
                desc: "Major misconduct / integrity breach",
              },
            ].map((lvl) => (
              <div
                key={lvl.value}
                onClick={() => {
                  setCocLevel(lvl.value);
                  setIsCocLevelOpen(false);
                }}
                className={`px-4 py-3.5 cursor-pointer flex items-start gap-3 border-b border-slate-100 last:border-b-0 transition-colors ${
                  cocLevel === lvl.value
                    ? "bg-indigo-50"
                    : "hover:bg-slate-50"
                }`}
              >
                {/* RADIO CIRCLE */}
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                    cocLevel === lvl.value
                      ? "border-indigo-600"
                      : "border-slate-300"
                  }`}
                >
                  {cocLevel === lvl.value && (
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                  )}
                </div>

                <div>
                  <p
                    className={`text-xs font-bold ${
                      cocLevel === lvl.value
                        ? "text-indigo-600"
                        : "text-black"
                    }`}
                  >
                    {lvl.title}
                  </p>

                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {lvl.desc}
                  </p>
                </div>
              </div>
            ))}

          </div>
        )}
      </div>
    </div>

    {/* ================= DESCRIPTION ================= */}
    <div>
      <label className="text-xs font-bold text-black block mb-1.5">
        Description
      </label>

      <textarea
        rows={4}
        value={cocDesc}
        onChange={(e) => setCocDesc(e.target.value)}
        placeholder="Provide detailed context of the incident..."
        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-medium text-black outline-none focus:border-black resize-none"
      />
    </div>

    {/* ================= FOOTER BUTTONS ================= */}
    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
      <button
        onClick={handleCocSubmit}
        disabled={loading}
        className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-black text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center disabled:opacity-50"
      >
        {loading && (
          <Loader2
            size={16}
            className="animate-spin mr-2"
          />
        )}

        Submit Case
      </button>

      <button
        onClick={handleNextTab}
        className="px-6 py-3 bg-[#0F1117] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
      >
        Next →
      </button>
    </div>
  </div>
)}

        {/* ─── TAB 2: APPEAL ─── */}
        {activeTab === 'appeal' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{reviewTaken ? 'Review Details' : 'Appeal Details'}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Record the Review and umpire decision for this delivery</p>
              </div>
              <div className="flex bg-gray-200/70 p-1 rounded-xl">
                <button
                  onClick={() => setReviewTaken(false)}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                    !reviewTaken ? 'bg-[#0F1117] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Review Not Taken
                </button>
                <button
                  onClick={() => setReviewTaken(true)}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                    reviewTaken ? 'bg-[#0F1117] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Review Taken
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">
                1. {reviewTaken ? 'Review Taken By' : 'Appeal By'}
              </label>
              <div className="grid grid-cols-3 gap-3">
                <div
                  onClick={() => {
                    setReviewedBy('Player');
                    setReviewingTeam('Bowling');
                  }}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    reviewedBy === 'Player' && reviewingTeam === 'Bowling'
                      ? 'border-[#0F1117] bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-bold text-gray-900 text-sm">{bowlingTeam}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{reviewTaken ? 'Review' : 'Appeal'} by {bowlingTeam}</p>
                </div>

                <div
                  onClick={() => {
                    setReviewedBy('Player');
                    setReviewingTeam('Batting');
                  }}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    reviewedBy === 'Player' && reviewingTeam === 'Batting'
                      ? 'border-[#0F1117] bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-bold text-gray-900 text-sm">{battingTeam}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{reviewTaken ? 'Review' : 'Appeal'} by {battingTeam}</p>
                </div>

                <div
                  onClick={() => setReviewedBy('Umpire')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    reviewedBy === 'Umpire'
                      ? 'border-[#0F1117] bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-bold text-black text-sm">Umpire Review</p>
                  <p className="text-[10px] text-gray-500 mt-1">{reviewTaken ? 'Review by umpire' : 'Umpire Decision'}</p>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">
                Select Umpire
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[umpire1, umpire2].map((u) => (
                  <div
                    key={u}
                    onClick={() => setUmpire(u)}
                    className={`p-3 px-4 rounded-xl border-2 cursor-pointer font-semibold text-sm transition-all ${
                      umpire === u ? 'border-[#0F1117] text-black bg-gray-50' : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    {u}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">
                {reviewTaken ? '3. Review Type' : '2. Appeal Type'}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {appealTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setAppealType(type);
                      if (type === 'No Ball') {
                        setOriginalDecision('No Ball');
                        setFinalDecision('No Ball');
                      } else if (type === 'Wide Ball') {
                        setOriginalDecision('Wide Ball');
                        setFinalDecision('Wide Ball');
                      } else {
                        setOriginalDecision('Not Out');
                        setFinalDecision('Not Out');
                      }
                    }}
                    className={`py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                      appealType === type
                        ? 'border-[#0F1117] text-black bg-gray-50'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {!(reviewTaken && reviewedBy === 'Umpire') && (
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">
                  Original Decision
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {isNoBallType ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setOriginalDecision('No Ball')}
                        className={`py-3 rounded-xl border-2 font-bold transition-all ${
                          originalDecision === 'No Ball' ? 'border-red-500 text-red-600 bg-red-50/20' : 'border-gray-200 text-gray-500'
                        }`}
                      >
                        NO BALL
                      </button>
                      <button
                        type="button"
                        onClick={() => setOriginalDecision('No Ball Not Given')}
                        className={`py-3 rounded-xl border-2 font-bold transition-all ${
                          originalDecision === 'No Ball Not Given' ? 'border-green-500 text-green-600 bg-green-50/20' : 'border-gray-200 text-gray-500'
                        }`}
                      >
                        NO BALL NOT GIVEN
                      </button>
                    </>
                  ) : isWideType ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setOriginalDecision('Wide Ball')}
                        className={`py-3 rounded-xl border-2 font-bold transition-all ${
                          originalDecision === 'Wide Ball' ? 'border-red-500 text-red-600 bg-red-50/20' : 'border-gray-200 text-gray-500'
                        }`}
                      >
                        WIDE BALL
                      </button>
                      <button
                        type="button"
                        onClick={() => setOriginalDecision('Wide Ball Not Given')}
                        className={`py-3 rounded-xl border-2 font-bold transition-all ${
                          originalDecision === 'Wide Ball Not Given' ? 'border-green-500 text-green-600 bg-green-50/20' : 'border-gray-200 text-gray-500'
                        }`}
                      >
                        WIDE BALL NOT GIVEN
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setOriginalDecision('Out')}
                        className={`py-3 rounded-xl border-2 font-bold transition-all ${
                          originalDecision === 'Out' ? 'border-red-500 text-red-600 bg-red-50/20' : 'border-gray-200 text-gray-500'
                        }`}
                      >
                        OUT
                      </button>
                      <button
                        type="button"
                        onClick={() => setOriginalDecision('Not Out')}
                        className={`py-3 rounded-xl border-2 font-bold transition-all ${
                          originalDecision === 'Not Out' ? 'border-green-500 text-green-600 bg-green-50/20' : 'border-gray-200 text-gray-500'
                        }`}
                      >
                        NOT OUT
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {reviewTaken && reviewedBy === 'Player' && (
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">
                  Review Result
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {['Umpire\'s Call', 'Retained', 'Overturned'].map((res) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => setReviewResult(res)}
                      className={`py-3 rounded-xl border-2 text-xs font-bold transition-all ${
                        reviewResult === res
                          ? 'border-[#0F1117] text-black bg-gray-50'
                          : 'border-gray-200 text-gray-700'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-3">
                Final Decision
              </label>
              <div className="grid grid-cols-2 gap-4">
                {isNoBallType ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setFinalDecision('No Ball')}
                      className={`py-3 rounded-xl border-2 font-bold transition-all ${
                        finalDecision === 'No Ball' ? 'border-red-500 text-red-600 bg-red-50/20' : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      NO BALL
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinalDecision('Fair Delivery')}
                      className={`py-3 rounded-xl border-2 font-bold transition-all ${
                        finalDecision === 'Fair Delivery' ? 'border-green-500 text-green-600 bg-green-50/20' : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      FAIR DELIVERY
                    </button>
                  </>
                ) : isWideType ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setFinalDecision('Wide Ball')}
                      className={`py-3 rounded-xl border-2 font-bold transition-all ${
                        finalDecision === 'Wide Ball' ? 'border-red-500 text-red-600 bg-red-50/20' : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      WIDE BALL
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinalDecision('Fair Delivery')}
                      className={`py-3 rounded-xl border-2 font-bold transition-all ${
                        finalDecision === 'Fair Delivery' ? 'border-green-500 text-green-600 bg-green-50/20' : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      FAIR DELIVERY
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setFinalDecision('Out')}
                      className={`py-3 rounded-xl border-2 font-bold transition-all ${
                        finalDecision === 'Out' ? 'border-red-500 text-red-600 bg-red-50/20' : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      OUT
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinalDecision('Not Out')}
                      className={`py-3 rounded-xl border-2 font-bold transition-all ${
                        finalDecision === 'Not Out' ? 'border-green-500 text-green-600 bg-green-50/20' : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      NOT OUT
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button 
                onClick={handleAppealSubmit}
                disabled={loading}
                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-black text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center disabled:opacity-50"
              >
                {loading && <Loader2 size={16} className="animate-spin mr-2" />}
                Submit Case
              </button>
              <button 
                onClick={handleNextTab}
                className="px-6 py-3 bg-[#0F1117] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ─── TAB 3: SUSPECTED INSIGHT ─── */}
        {activeTab === 'suspected' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="text-center">
              <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-amber-100 text-amber-600">
                🚨
              </div>
              <h3 className="text-xl font-bold text-black">Suspected Incident</h3>
              <p className="text-slate-600 text-xs font-medium mt-0.5">Select the Suspected Actions Done by Player</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { id: 'chucking', label: 'Chucking' },
                { id: 'timeWasting', label: 'Time Wasting' },
                { id: 'ballTampering', label: 'Ball Tampering' },
                { id: 'dangerousDelivery', label: 'Dangerous Delivery' },
                { id: 'beamer', label: 'Beamer' },
                { id: 'others', label: 'Others' },
              ].map((act) => (
                <div 
                  key={act.id}
                  onClick={() => setSuspectedActions(prev => ({ 
                    chucking: false,
                    ballTampering: false,
                    beamer: false,
                    timeWasting: false,
                    dangerousDelivery: false,
                    others: false,
                    [act.id]: !prev[act.id] 
                  }))}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    suspectedActions[act.id] ? 'border-black bg-slate-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    checked={suspectedActions[act.id]} 
                    readOnly 
                    className="w-4 h-4 rounded text-black accent-black pointer-events-none" 
                  />
                  <span className="text-xs font-bold text-black">{act.label}</span>
                </div>
              ))}
            </div>

            {suspectedActions.others && (
              <div>
                <label className="text-xs font-bold text-black block mb-1.5">Description</label>
                <textarea 
                  rows={4}
                  value={suspectedDesc}
                  onChange={(e) => setSuspectedDesc(e.target.value)}
                  placeholder="Provide detailed context of the incident..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-medium text-black outline-none focus:border-black resize-none"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button 
                onClick={handleSuspectSubmit}
                disabled={loading}
                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-black text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center disabled:opacity-50"
              >
                {loading && <Loader2 size={16} className="animate-spin mr-2" />}
                Submit Case
              </button>
              <button 
                onClick={handleNextTab}
                className="px-6 py-3 bg-[#0F1117] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ─── TAB 4: KEY MOMENT ─── */}
        {activeTab === 'key_moment' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="text-center">
              <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-orange-100 text-orange-600">
                ⭐
              </div>
              <h3 className="text-xl font-bold text-black">Key Moments & Celebrations</h3>
              <p className="text-slate-600 text-xs font-medium mt-0.5">Describe your key moments or update celebrations here</p>
            </div>

            <div>
              <label className="text-xs font-bold text-black block mb-1.5">Describe key Moments Here</label>
              <textarea 
                rows={6}
                value={keyMomentDesc}
                onChange={(e) => setKeyMomentDesc(e.target.value)}
                placeholder="Provide detailed context or celebrations..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-medium text-black outline-none focus:border-black resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button 
                onClick={handleCelebrationsSubmit}
                disabled={loading}
                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-black text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center disabled:opacity-50"
              >
                {loading && <Loader2 size={16} className="animate-spin mr-2" />}
                Submit Case
              </button>
              <button 
                onClick={handleNextTab}
                className="px-6 py-3 bg-[#0F1117] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ─── TAB 5: UPLOAD VIDEO ─── */}
        {activeTab === 'upload_video' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }
              }}
            />

            {/* Drag and Drop Zone */}
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleFilesSelected(e.dataTransfer.files);
                }
              }}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                isDragging 
                  ? 'border-blue-500 bg-blue-50/50 scale-[0.99]' 
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <Upload className={`w-8 h-8 mx-auto mb-3 transition-colors ${isDragging ? 'text-blue-500' : 'text-indigo-500'}`} />
              <p className="text-xs font-bold text-black">Drag & drop video files here</p>
              <p className="text-[11px] text-slate-500 my-1">or</p>
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-[#0F1117] text-white text-xs font-bold rounded-xl shadow-sm hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Choose File
              </button>
              <p className="text-[10px] text-slate-500 mt-3">Supports: MP4, MOV, AVI, MKV, WebM • Max file size: 5 GB per file</p>
            </div>

            {/* Search and stats bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <input 
                  type="text" 
                  placeholder="Search videos..." 
                  value={videoSearchQuery}
                  onChange={(e) => setVideoSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs outline-none bg-slate-50 text-black focus:ring-1 ring-blue-500" 
                />
              </div>
              <div className="text-xs text-slate-500 font-medium">
                {isLoadingVideos
                  ? 'Loading uploaded videos...'
                  : `${serverVideos.length} uploaded${videoItems.length > 0 ? ` • ${videoItems.length} in progress` : ''}`}
              </div>
            </div>

            {videosLoadError && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl flex items-center justify-between">
                <span>{videosLoadError}</span>
                <button onClick={loadBallVideos} className="font-bold underline cursor-pointer">Retry</button>
              </div>
            )}

            {/* Uploaded Videos Table */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#F8FAFC] text-[10px] font-bold text-black uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Preview</th>
                    <th className="py-3 px-4">Details & Metadata</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-black">
                  {/* Previously uploaded videos — fetched from the server, persists across refresh */}
                  {serverVideos
                    .filter(v =>
                      v.tag.toLowerCase().includes(videoSearchQuery.toLowerCase()) ||
                      v.clipLabel.toLowerCase().includes(videoSearchQuery.toLowerCase())
                    )
                    .map((sv) => (
                      <tr key={sv.key} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div
                            onClick={() => sv.url && handleOpenServerPreview(sv)}
                            className="w-20 h-12 bg-slate-900 rounded-lg overflow-hidden relative flex items-center justify-center cursor-pointer group/thumb"
                          >
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover/thumb:bg-black/10 transition-colors">
                              <Play size={14} className="text-white fill-white drop-shadow-md" />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-black truncate max-w-xs">{sv.tag} · {sv.clipLabel}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Over {sv.overNumber} • {sv.source.toUpperCase()}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {sv.uploadStatus === 'uploaded' ? 'Uploaded' : sv.uploadStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {deletingClipKeys.has(sv.key) ? (
                              <Loader2 size={15} className="animate-spin text-slate-400" />
                            ) : (
                              <>
                                <button
                                  title="Delete Video"
                                  onClick={() => handleDeleteServerVideo(sv)}
                                  className="p-1.5 text-black hover:text-red-500 transition-colors cursor-pointer"
                                >
                                  <Trash2 size={15} />
                                </button>
                                <button
                                  title="View Video"
                                  onClick={() => sv.url && handleOpenServerPreview(sv)}
                                  disabled={!sv.url}
                                  className="p-1.5 text-black hover:text-blue-600 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <Eye size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}

                  {/* This session's in-flight uploads (pending/uploading/error) */}
                  {videoItems
                    .filter(v => v.name.toLowerCase().includes(videoSearchQuery.toLowerCase()))
                    .map((vid) => {
                      return (
                        <tr key={vid.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4">
                            <div
                              onClick={() => handleOpenPreview(vid)}
                              className="w-20 h-12 bg-slate-900 rounded-lg overflow-hidden relative flex items-center justify-center cursor-pointer group/thumb"
                            >
                              <video src={vid.previewUrl} className="w-full h-full object-cover opacity-80" />
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover/thumb:bg-black/10 transition-colors">
                                <Play size={14} className="text-white fill-white drop-shadow-md" />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-bold text-black truncate max-w-xs">{vid.name}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Over {ballInfo?.over_number || '0.1'} • {vid.sizeFormatted}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            {vid.status === 'uploading' && (
                              <div className="w-32">
                                <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 mb-1">
                                  <span>Uploading</span>
                                  <span>{vid.progress}%</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                  <div 
                                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-200" 
                                    style={{ width: `${vid.progress}%` }} 
                                  />
                                </div>
                              </div>
                            )}

                            {vid.status === 'ready' && (
                              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full text-[10px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Ready
                              </span>
                            )}

                            {vid.status === 'pending' && (
                              <span className="inline-flex items-center gap-1.5 font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full text-[10px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Pending
                              </span>
                            )}

                            {vid.status === 'error' && (
                              <div className="flex items-center gap-1.5">
                                <span 
                                  className="inline-flex items-center gap-1.5 font-bold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full text-[10px]" 
                                  title={vid.error}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Failed
                                </span>
                                <button 
                                  onClick={() => startUploadForItem(vid)} 
                                  className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-black" 
                                  title="Retry upload"
                                >
                                  <RotateCcw size={12} />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                title="Delete" 
                                onClick={() => handleDeleteVideoItem(vid.id)}
                                className="p-1.5 text-black hover:text-red-500 transition-colors cursor-pointer"
                              >
                                <Trash2 size={15} />
                              </button>
                              <button 
                                title="View Video" 
                                onClick={() => handleOpenPreview(vid)}
                                className="p-1.5 text-black hover:text-blue-600 transition-colors cursor-pointer"
                              >
                                <Eye size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                  {!isLoadingVideos && serverVideos.length === 0 && videoItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400 text-xs">
                        No videos uploaded yet. Choose files or drag and drop videos above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Submit Action */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button 
                onClick={handleFinalSubmit}
                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-black text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Submit Case
              </button>
              <button 
                onClick={handleFinalSubmit}
                className="px-6 py-3 bg-[#0F1117] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                Submit
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ─── VIDEO PREVIEW MODAL OVERLAY ─── */}
      {isVideoPreviewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-[800px] overflow-hidden relative flex flex-col p-6 text-black">
            <button 
              onClick={() => setIsVideoPreviewOpen(false)}
              className="absolute top-6 right-6 text-black hover:text-gray-600 w-9 h-9 flex items-center justify-center rounded-full border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer z-10"
            >
              <X size={18} />
            </button>

            <div className="w-full h-[400px] bg-black rounded-2xl relative overflow-hidden flex items-center justify-center mb-6">
              <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-1 rounded-lg text-xs font-bold backdrop-blur-md z-10">
                Over {ballInfo?.over_number || '0.1'} • {previewVideoTitle}
              </div>
              {previewVideoUrl ? (
                <video
                  src={previewVideoUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              ) : (
                <p className="text-slate-400 text-sm">No video source available</p>
              )}
            </div>

            <div className="flex justify-end">
              <button 
                onClick={() => setIsVideoPreviewOpen(false)}
                className="px-6 py-3 bg-[#0F1117] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RefereeActionModal;