"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { Play, Pause, RotateCcw, Settings, Maximize, ArrowRight, ChevronLeft, ArrowLeft, Minimize } from "lucide-react";
import { SplitCanvasVideoPlayer } from "@/app/admin/components/player/SplitCanvasVideoPlayer";


const CAMERA_MAPPING: Record<string, string> = {
  FRONT: "cam_1", SIDE: "cam_2", BATSMAN: "cam_3", BOWLER: "cam_4", STUMP: "cam_5", ARIEL: "cam_6",
};
interface BallFile {
  fileId: number;
  file: string;
  downloadUrl: string;
  analyzed_id?: string | null;
  analyzedvideo_status?: string | null;
}

const BallAnalyticsPage = () => {
  const { matchId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Data from URL Parameters
  const initialBall = searchParams.get("ball") || "";
  const inningParam = searchParams.get("inning") || "1st";
  const batsmanName = searchParams.get("batsman") || "N/A";
  const bowlerName = searchParams.get("bowler") || "N/A";
  const outcome = searchParams.get("outcome") || "0";
  const isSuperOver = searchParams.get("isSuperOver") === "true";
  const soNumber = searchParams.get("soNumber") || "1";
  
  const [syncData, setSyncData] = useState<any>(null);
  const [activeView, setActiveView] = useState("FRONT");
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
const [statusMsg, setStatusMsg] = useState("");

const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  // Keep track of the status coming from your status API
const [pollingStatus, setPollingStatus] = useState<string | null>(null);

const [biomechanicsMetrics, setBiomechanicsMetrics] = useState([
  { name: "Balance", value: "--", color: "bg-orange-200" },
  { name: "Head Hand Combination", value: "--", color: "bg-red-200" },
  { name: "Stance", value: "--", color: "bg-indigo-200" },
  { name: "Shoulder", value: "--", color: "bg-slate-200" },
  { name: "Head", value: "--", color: "bg-stone-200" },
  { name: "Weight Distribution", value: "--", color: "bg-emerald-200" },
]);
  
const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoContainerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handlePlaybackRate = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
      setIsSettingsOpen(false); // Close menu after selection
    }
  };


  const handleButtonClick = () => {
  if (isCompleted && currentFile?.analyzed_id) {
    // Navigates to your other app in a new tab
    window.open(`http://localhost:5173/analysis/${currentFile.analyzed_id}`, '_blank');
    
    // OR: use this line if you want to navigate in the same tab:
    // window.location.href = `http://localhost:5173/analysis/${currentFile.analyzed_id}`;
  } else if (!isBusy) {
    handleSingleAnalysis();
  }
};
  // Close settings when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isSettingsOpen && !(event.target as Element).closest('.settings-menu-container')) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSettingsOpen]);

  useEffect(() => {
  const video = videoRef.current;
  if (!video) return;

  const updateProgress = () => {
    setCurrentTime(video.currentTime);
  };

  // Listen to the timeupdate event
  video.addEventListener("timeupdate", updateProgress);

  return () => {
    video.removeEventListener("timeupdate", updateProgress);
  };
}, []); // Runs once on mount
  // Fetch Sync View Data
  const fetchSync = async () => {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_Backend_URL}/matches/${matchId}/sync-view?withDownloadUrls=true`,
    {
      credentials: "include",
    }
  );

  if (res.ok) {
    const data = await res.json();
    setSyncData(data);
  }
};

useEffect(() => {
  fetchSync();
}, [matchId]);
  console.log("Fetched Sync Data:", syncData);

  // Map URLs for the specific ball across all cameras
//   const ballMap = useMemo(() => {
//   if (!syncData?.folders) return {};
//   const map: Record<string, string> = {};
//   const inningDigit = inningParam === "1st" ? "1" : "2";

//   console.log("🎬 [Video Player] Mapping videos for Inning Digit:", inningDigit, "Ball:", initialBall);

//   Object.entries(syncData.folders).forEach(([folderPath, folderData]: [string, any]) => {
//     const pathParts = folderPath.split('/');
//     const inningFolder = pathParts[0] || "";
//     const cameraFolder = pathParts[1] || "";

//     if (inningFolder.includes(inningDigit)) {
//       let detectedCam = "";
//       for (let i = 1; i <= 6; i++) {
//         if (cameraFolder.toLowerCase().includes(`cam_${i}`) || cameraFolder.toLowerCase().includes(`cam${i}`)) {
//           detectedCam = `cam_${i}`;
//           break;
//         }
//       }

//       if (detectedCam) {
//         const fileMatch = folderData.files.find((file: any) => file.file.includes(initialBall));
//         if (fileMatch) {
//           console.log(`📺 Mapping ${detectedCam} to URL from folder: ${folderPath}`);
//           map[detectedCam] = fileMatch.downloadUrl;
//         }
//       }
//     }
//   });

//   console.log("📋 Current Ball Map for Player:", map);
//   return map;
// }, [syncData, initialBall, inningParam]);
const ballMap: Record<string, BallFile | null>  = useMemo(() => {
  if (!syncData?.folders) return {};
  const map: Record<string, BallFile | null> = {};
  
  // 1. Get parameters (normalize to strings for safer comparison)
  const isSuperOver = searchParams.get("isSuperOver") === "true";
  const soNumber = searchParams.get("soNumber") || "1";
  const isWide = searchParams.get("isWide") === "true";
  const isNoBall = searchParams.get("isNoBall") === "true";
  const inningDigit = inningParam === "1st" ? "1" : "2";

  // 2. Define suffixes (Ensure these match your actual S3 file naming exactly!)
  // If your files are "0.1_wd.mp4", use "_wd"
  const suffix = isWide ? "_wd" : isNoBall ? "_nb" : "";

  Object.entries(syncData.folders).forEach(([folderPath, folderData]: [string, any]) => {
    // Check Inning
    if (!folderPath.includes(inningDigit)) return;

    // Detect Camera ID
    let detectedCam = "";
    const pathParts = folderPath.split('/');
    const cameraFolder = (pathParts[1] || "").toLowerCase();
    
    for (let i = 1; i <= 6; i++) {
      if (cameraFolder.includes(`cam_${i}`)) {
        detectedCam = `cam_${i}`;
        break;
      }
    }

    if (detectedCam) {
      // 3. Robust File Matching
      const fileMatch = folderData.files.find((file: any) => {
        const fileName = file.file.toLowerCase();
        const ball = initialBall.toLowerCase();
        
        // Pattern logic
        if (isSuperOver) {
          // Expects: "so1.0.1_wd.mp4"
          return fileName.includes(`so${soNumber}.${ball}${suffix}.mp4`);
        } else {
          // Expects: "0.1_wd.mp4"
          // We check: contains ball AND contains suffix, but NOT a superover file
          return fileName.includes(`${ball}${suffix}.mp4`) && !fileName.startsWith("so");
        }
      });

      if (fileMatch) {
        map[detectedCam] = fileMatch;
      }
    }
  });

  return map;
}, [syncData, initialBall, inningParam, searchParams]);
const currentFile = useMemo(() => {
  const camKey = CAMERA_MAPPING[activeView];
  return ballMap[camKey] || null;
}, [activeView, ballMap]);
console.log("Current File for active view:", currentFile);
// Used for your Python analysis trigger
const currentVideoUrl = useMemo(() => currentFile?.downloadUrl || null, [currentFile]);
  //const currentVideoUrl = useMemo(() => ballMap[CAMERA_MAPPING[activeView]] || null, [activeView, ballMap]);
  console.log("Current Video URL for active view:", currentVideoUrl);

  // AI Setup
  useEffect(() => {
    const setupAI = async () => {
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`, delegate: "GPU" },
        runningMode: "VIDEO",
      });
    };
    setupAI();
  }, []);

  const skipTime = (amount: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += amount;
    }
  };

  const togglePlay = () => {
  if (videoRef.current) {
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      // .play() returns a promise, so we handle the potential AbortError here
      videoRef.current.play().catch((error) => {
        if (error.name === "AbortError") {
          // This error is expected if play() is interrupted by pause()
          console.warn("Video play interrupted, which is expected.");
        } else {
          // Log other unexpected errors
          console.error("Playback failed:", error);
        }
      });
      setIsPlaying(true);
    }
  }
};

useEffect(() => {
  const fetchBiomechanics = async () => {
    if (!currentFile?.analyzed_id) {
      setBiomechanicsMetrics([
        { name: "Balance", value: "42", color: "bg-orange-200" },
        { name: "Head Hand Combination", value: "186.42", color: "bg-red-200" },
        { name: "Stance", value: "Average", color: "bg-indigo-200" },
        { name: "Shoulder", value: "Wide", color: "bg-slate-200" },
        { name: "Head", value: "89", color: "bg-stone-200" },
        { name: "Weight Distribution", value: "others", color: "bg-emerald-200" },
      ]);
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_Analytics_Backend_URL}/api/webhook/results/${currentFile.analyzed_id}`
      );

      if (!res.ok) {
        throw new Error("Failed to fetch biomechanics");
      }

      const data = await res.json();

      console.log("Biomechanics:", data);

      const batsman = data.summary?.batsman ?? {};
      const batsmanFront = data.summary?.batsman_front ?? {};
      const bowler = data.summary?.bowler_side ?? {};

      setBiomechanicsMetrics([
        {
          name: "Balance",
          value:
            bowler.weight_distribution?.left_pct != null &&
            bowler.weight_distribution?.right_pct != null
              ? `${bowler.weight_distribution.left_pct}% / ${bowler.weight_distribution.right_pct}%`
              : "--",
          color: "bg-orange-200",
        },
        {
          name: "Head Hand Combination",
          value:
            batsman.hand_hip_position_px != null
              ? `${Number(batsman.hand_hip_position_px).toFixed(2)} px`
              : "--",
          color: "bg-red-200",
        },
        {
          name: "Stance",
          value:
            batsman.feet_width_pct != null
              ? `${Number(batsman.feet_width_pct).toFixed(2)} %`
              : "--",
          color: "bg-indigo-200",
        },
        {
          name: "Shoulder",
          value:
            bowler.hyper_extension_deg != null
              ? `${Number(bowler.hyper_extension_deg).toFixed(2)}°`
              : "--",
          color: "bg-slate-200",
        },
        {
          name: "Head",
          value:
            batsman.eyes_alignment_deg != null
              ? `${Number(batsman.eyes_alignment_deg).toFixed(2)}°`
              : "--",
          color: "bg-stone-200",
        },
        {
          name: "Weight Distribution",
          value:
            batsman.weight_distribution?.left_pct != null &&
            batsman.weight_distribution?.right_pct != null
              ? `${batsman.weight_distribution.left_pct}% / ${batsman.weight_distribution.right_pct}%`
              : "--",
          color: "bg-emerald-200",
        },
      ]);
    } catch (error) {
      console.error("Biomechanics fetch failed:", error);
    }
  };

  fetchBiomechanics();
}, [currentFile?.analyzed_id]);
//   const handleSingleAnalysis = async () => {
//   if (!currentVideoUrl) return;

//   setAnalysisStatus("loading");
  
//   const angleMapping: Record<string, string> = {
//     FRONT: "front_side", SIDE: "side_on", BATSMAN: "batsman_side",
//     BOWLER: "bowler_side", STUMP: "stump_view", ARIEL: "aerial_view"
//   };

//   const payload = {
//     s3_url: currentVideoUrl,
//     email: localStorage.getItem('email') || "manishkr@khel.ai",
//     angle: angleMapping[activeView] || "bowler_side",
//     display_name: `${batsmanName} - Ball ${initialBall}`
//   };

//   try {
//     const response = await fetch("http://192.168.1.13:5002/api/webhook/upload", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(payload),
//     });
//     console.log("Analysis server response:", response);

//     if (response.ok) {
//       setAnalysisStatus("success");
//       const data = await response.json(); 
        
//         console.log("Full Data Body:", data);
//       setStatusMsg("Analysis triggered successfully!");
//       // Reset back to idle after 3 seconds
//       setTimeout(() => setAnalysisStatus("idle"), 3000);
//     } else {
//       throw new Error(`Server responded with ${response.status}`);
//     }
//   } catch (error) {
//     console.error("❌ Error:", error);
//     setAnalysisStatus("error");
//     setStatusMsg("Failed to connect to analysis server.");
//     setTimeout(() => setAnalysisStatus("idle"), 4000);
//   }
// };
// Add this state to your component: 
// const [pollingStatus, setPollingStatus] = useState<string | null>(null);
const pollAnalysisStatus = async (
  analyzedId: string,
  fileId: number
) => {
  //setPollingStatus("processing");

  const pollInterval = setInterval(async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_Analytics_Backend_URL}/api/webhook/status/${analyzedId}`
      );

      const data = await res.json();
      console.log("Polling Status Response:", data);

      setPollingStatus(data.status);

      if (data.status === "processed") {
        clearInterval(pollInterval);

        // Update backend
        await fetch(
          `${process.env.NEXT_PUBLIC_Backend_URL}/upload/file/${fileId}/analysis`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              analyzedvideo_status: "completed",
            }),
          }
        );

        if (typeof fetchSync === "function") {
          await fetchSync();
        }

        setAnalysisStatus("success");
        setStatusMsg("Analysis Complete!");

        setTimeout(() => {
          setAnalysisStatus("idle");
          setPollingStatus(null);
        }, 3000);
      }

      if (data.status === "failed") {
        clearInterval(pollInterval);

        setAnalysisStatus("error");
        setPollingStatus("failed");
        setStatusMsg("Analysis Failed.");
      }
    } catch (err) {
      clearInterval(pollInterval);

      setAnalysisStatus("error");
      setPollingStatus("failed");
      setStatusMsg("Analysis Failed.");
    }
  }, 3000);

  return () => clearInterval(pollInterval);
};
const handleSingleAnalysis = async () => {
  if (!currentVideoUrl || !currentFile?.fileId) {
    setStatusMsg("File ID or URL missing.");
    return;
  }

  setAnalysisStatus("loading");

  try {
    let analyzedId: string = currentFile?.analyzed_id ?? "";

    if (!analyzedId) {
      const angleMapping: Record<string, string> = {
        FRONT: "front_side",
        SIDE: "side_on",
        BATSMAN: "batsman_side",
        BOWLER: "bowler_side",
        STUMP: "stump_view",
        ARIEL: "aerial_view",
      };
console.log("activeView:", activeView);
console.log("Mapped angle:", angleMapping[activeView]);
console.log("Available keys:", Object.keys(angleMapping));
      const payload = {
  s3_url: currentVideoUrl,
  email: localStorage.getItem("email") || "manishkr@khel.ai",
  angle: angleMapping[activeView] || "bowler_side",
  display_name: `${batsmanName} - Ball ${initialBall}`,
};

console.log("Payload:", payload);

const response = await fetch(
  `${process.env.NEXT_PUBLIC_Analytics_Backend_URL}/api/webhook/upload`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }
);
      console.log("Analysis server response:", response);

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const analysisData = await response.json();

      analyzedId = analysisData.id.toString();

      await fetch(
        `${process.env.NEXT_PUBLIC_Backend_URL}/upload/file/${currentFile.fileId}/analysis`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            analyzed_id: analyzedId,
            analyzedvideo_status: "processing",
          }),
        }
      );

      if (typeof fetchSync === "function") {
        await fetchSync();
      }
    }

    pollAnalysisStatus(
      analyzedId,
      currentFile.fileId
    );
  } catch (e) {
    setAnalysisStatus("error");
    setStatusMsg("Operation Failed");
  }
};
useEffect(() => {
  if (
    currentFile?.analyzed_id &&
    currentFile?.analyzedvideo_status === "processing"
  ) {
    pollAnalysisStatus(
      currentFile.analyzed_id,
      currentFile.fileId
    );
  } else {
    setPollingStatus(null);
  }
}, [currentFile?.fileId]);
const [currentTime, setCurrentTime] = useState(0);
const [duration, setDuration] = useState(0);

// Update progress when video plays
useEffect(() => {
  const video = videoRef.current;
  if (!video) return;

  const onLoadedMetadata = () => {
    // This is the correct time to read the duration
    setDuration(video.duration);
    console.log("Video duration loaded:", video.duration);
  };

  video.addEventListener("loadedmetadata", onLoadedMetadata);

  // Clean up
  return () => {
    video.removeEventListener("loadedmetadata", onLoadedMetadata);
  };
}, [currentVideoUrl]); // Ensure this re-runs when the URL changes // Re-bind when video source changes
const backendStatus = currentFile?.analyzedvideo_status;

const activeStatus =
  backendStatus === "processing"
    ? pollingStatus || "processing"
    : backendStatus;

    
// Define button behavior
const isBusy = activeStatus === "processing" ;
const isCompleted = activeStatus === "processed" || activeStatus === "completed" ;

console.log({
  pollingStatus,
  backendStatus: currentFile?.analyzedvideo_status,
  activeStatus,
  isBusy,
  isCompleted,
});

// Prepare camera options for Split View dropdown comparison
const cameraOptions = useMemo(() => {
  const labels: Record<string, string> = {
    cam_1: "FRONT (Cam 1)",
    cam_2: "SIDE (Cam 2)",
    cam_3: "BATSMAN (Cam 3)",
    cam_4: "BOWLER (Cam 4)",
    cam_5: "STUMP (Cam 5)",
    cam_6: "ARIEL (Cam 6)",
  };

  return Object.entries(ballMap)
    .map(([camKey, ballFile]) => ({
      label: labels[camKey] || camKey.toUpperCase(),
      url: ballFile?.downloadUrl || "",
    }))
    .filter((opt) => Boolean(opt.url));
}, [ballMap]);


// Helper to format time
const formatTime = (time: number) => {
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};
  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-6">
      {/* Breadcrumbs */}
      <div className="flex items-center flex-wrap gap-2 text-[14px] md:text-[14px] font-medium text-slate-800 mb-4 md:mb-6">
        <button onClick={() => router.back()}> <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 mr-1" /></button>
        <span>Grounds</span> <span>&gt;</span> <span>Tournament</span> <span>&gt;</span> <span>Matches</span> <span>&gt;</span> <span>Match Details</span> <span>&gt;</span> <span className="text-slate-900">Ball Analysis</span>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        
        {/* Main Video Section */}
        <div className="flex-1 min-w-0">
         <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm text-black">
  {/* Wrap container for mobile friendliness */}
  <div className="flex flex-col md:flex-row flex-wrap items-start md:items-center gap-y-6 gap-x-6">
    
    {/* Left side info group */}
    <div className="flex flex-wrap gap-y-4 gap-x-6 items-center flex-1">
      {/* 1. Innings Section */}
      <div className="flex flex-col">
        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Innings</span>
        <span className="text-sm font-bold text-slate-900">
          {isSuperOver ? `SO${soNumber}` : inningParam}
        </span>
      </div>

      {/* 2. Ball Section */}
      <div className="flex flex-col border-l border-slate-100 pl-4">
        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">
          {isSuperOver ? "Super Over Ball" : "Ball No."}
        </span>
        <span className="text-sm font-bold text-slate-900">
          {isSuperOver ? `SO${soNumber} - ${initialBall}` : initialBall}
        </span>
      </div>

      {/* 3. Outcome Section */}
      <div className="flex flex-col border-l border-slate-100 pl-4">
        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Outcome</span>
        <span className="text-sm font-bold text-slate-900">{outcome}</span>
      </div>

      {/* 4. Player Matchup Section */}
      <div className="flex items-center gap-3 border-l border-slate-100 pl-4">
        <div className="text-center">
          <span className="block text-[9px] text-slate-500 uppercase font-bold">Batsman</span>
          <span className="text-sm font-bold text-slate-900">{batsmanName}</span>
        </div>
        <div className="text-[10px] font-black text-slate-400 italic">VS</div>
        <div className="text-center">
          <span className="block text-[9px] text-slate-500 uppercase font-bold">Bowler</span>
          <span className="text-sm font-bold text-slate-900">{bowlerName}</span>
        </div>
      </div>
    </div>

    {/* 5. Analyse Button (Full width on mobile, auto on desktop) */}
    <div className="w-full md:w-auto mt-2 md:mt-0">
      <button 
        onClick={handleButtonClick}
        disabled={isBusy }
        className={`w-full md:w-auto px-4 py-2 rounded-lg text-white text-[11px] font-bold shadow-md transition-all flex items-center justify-center gap-2 ${
          isCompleted 
            ? "bg-green-700 hover:bg-green-800 cursor-pointer" 
            : isBusy 
              ? "bg-slate-600 cursor-not-allowed" 
              : "bg-slate-900 hover:bg-slate-800 active:scale-95"
        }`}
      >
        {isBusy && (
          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        )}
        {!isBusy && !isCompleted && <RotateCcw className="w-3 h-3" />}
        
        {
          !backendStatus
            ? "Analyse View"
            : isCompleted
              ? "Completed ✓"
              : isBusy
                ? "Processing..."
                : "Analyse View"
        }
      </button>
    </div>
  </div>
</div>

{/* Status Message Section */}
<div className="flex items-end justify-end mb-4">
  {analysisStatus !== "idle" && (
    <div className={`px-3 py-1.5 rounded-lg text-[10px] font-bold animate-in fade-in slide-in-from-right-4 shadow-xl ${
      analysisStatus === "success" ? "bg-emerald-500 text-white" : 
      analysisStatus === "error" ? "bg-red-500 text-white" : "bg-blue-600/50 text-white"
    }`}>
      {statusMsg || "Processing..."}
    </div>
  )}


  
</div>
<SplitCanvasVideoPlayer 
  srcA={currentVideoUrl} 
  subtitleA={`Ball ${initialBall} Analytics`}
  titleA={`${activeView} VIEW (${outcome} Runs - ${batsmanName})`}
  optionsB={cameraOptions}
/>
          {/* Camera Previews */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 md:gap-4 mt-6 md:mt-8">
            {Object.keys(CAMERA_MAPPING).map((view) => (
              <button key={view} onClick={() => setActiveView(view)} className="group flex flex-col gap-2 md:gap-3">
                <div className={`aspect-video rounded-xl md:rounded-2xl bg-slate-200 overflow-hidden border-2 transition-all duration-300 ${activeView === view ? "border-blue-500 shadow-lg scale-105" : "border-transparent opacity-80"}`}>
                  <video
  src={ballMap[CAMERA_MAPPING[view]]?.downloadUrl}
  className="w-full h-full object-cover"
/>
                </div>
                <p className={`text-[8px] md:text-[12px] font-black text-center uppercase tracking-tighter ${activeView === view ? 'text-slate-900' : 'text-slate-700'}`}>{view} VIEW</p>
              </button>
            ))}
          </div>
        </div>

        {/* Biomechanics Sidebar */}
        <div className="w-full xl:w-[340px] bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 shadow-xs flex flex-col shrink-0">
          <h2 className="text-lg md:text-xl font-bold text-slate-900">Biomechanics</h2>
          <p className="text-[10px] md:text-[13px] text-slate-700 mb-4">
            Graph of overall Batting Performance
          </p>

          <div className="relative mb-6 px-2">
            <div className="absolute top-[20%] left-0 right-0 border-t border-dashed border-slate-300 z-0">
              <div className="absolute -top-4 left-0 bg-slate-800 rounded-md p-1.5 flex flex-col gap-1 shadow-lg z-20">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <div className="w-5 h-[1px] bg-slate-600" />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <div className="w-5 h-[1px] bg-slate-600" />
                </div>
              </div>
            </div>

            <div className="h-24 md:h-28 w-full relative flex items-end justify-between px-2 border-b border-slate-100">
              <div className="absolute left-[72%] top-0 bottom-0 w-[1px] bg-yellow-400 z-10">
                <div className="absolute -top-1 -left-[3.5px] w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-yellow-400" />
                <div className="absolute -bottom-1 -left-[3.5px] w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-yellow-400" />
              </div>

              {[15, 45, 20, 30, 60, 40, 55, 85, 35, 65, 45, 50].map((h, i) => (
                <React.Fragment key={i}>
                  <div className="flex flex-col items-center h-full justify-end relative">
                    <div className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full mb-[-2px] md:mb-[-3px] z-20 ${i === 7 ? "bg-yellow-400" : "bg-slate-400"}`} />
                    <div className={`w-[1px] ${i === 7 ? "bg-yellow-400" : "bg-slate-400"}`} style={{ height: `${h}%` }} />
                  </div>
                  {i < 11 && <div className="h-16 md:h-20 w-[1px] bg-slate-300 self-center opacity-50" />}
                </React.Fragment>
              ))}
            </div>

            <div className="flex justify-between mt-2 px-2 md:px-4">
              {["15%", "30%", "45%", "60%", "75%"].map((label) => (
                <span key={label} className="text-[8px] md:text-[10px] font-bold text-slate-500 tracking-wider">{label}</span>
              ))}
            </div>
          </div>

          {/* Metrics List */}
          <div className="flex-1">
            {biomechanicsMetrics.map((m, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 md:py-1 group cursor-pointer">
                <div className="flex items-center gap-2 md:gap-1">
                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl ${m.color} transition-transform group-hover:scale-105`} />
                  <span className="text-[11px] md:text-[13px] font-medium text-slate-700">{m.name}</span>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <span className="text-[11px] md:text-[13px] font-bold text-slate-900">{m.value}</span>
                  {/* <button className="text-slate-300 hover:text-slate-700">
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
                  </button> */}
                </div>
              </div>
            ))}
          </div>

          {/* <button className="flex items-center justify-center gap-2 mt-4 text-[11px] md:text-[13px] font-bold text-slate-800 hover:gap-4 transition-all">
            See more <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
          </button> */}
        </div>
      </div>
    </div>
  );
};

export default BallAnalyticsPage;


// "use client";



// import { LayoutTemplate } from "lucide-react";
// import React, { useState, useRef, useEffect } from "react";
// import { useParams } from "next/navigation";
// import {
//   PoseLandmarker,
//   FilesetResolver,
//   DrawingUtils,
// } from "@mediapipe/tasks-vision";
// import Stats from "../stats";



// type ViewOption = "FRONT" | "SIDE" | "BATSMAN" | "BOWLER" | "STUMP" | "ARIEL";

// // Mapping views to specific local video files
// const videoMap: Record<ViewOption, string> = {
//   FRONT: "/videos/front-view.mp4",
//   SIDE: "/videos/back-view.mp4",
//   BATSMAN: "/videos/front-view.mp4",
//   BOWLER: "/videos/back-view.mp4",
//   STUMP: "/videos/front-view.mp4",
//   ARIEL: "/videos/back-view.mp4",
// };

// const overBalls = [
//   { val: "0", type: "dot" },
//   { val: "0", type: "dot" },
//   { val: "6", type: "boundary" },
//   { val: "W", type: "wicket" },
//   { val: "4", type: "boundary" },
//   { val: "6", type: "boundary" },
//   { val: "1", type: "dot" },
// ];

// const biomechanicsMetrics = [
//   { name: "Balance", value: "Average", color: "bg-amber-100" },
//   { name: "Head Hand Combination", value: "156.987", color: "bg-red-100" },
//   { name: "Stance", value: "Wide", color: "bg-purple-100" },
//   { name: "Shoulder", value: "Open", color: "bg-slate-200" },
//   { name: "Head", value: "Aligned", color: "bg-slate-200" },
//   { name: "Weight Distribution", value: "51%", color: "bg-teal-100" },
// ];

// const cameraViews: { id: ViewOption; name: string; thumbnail: string }[] = [
//   { id: "FRONT", name: "FRONT VIEW", thumbnail: "/thumbnails/front.jpg" },
//   { id: "SIDE", name: "SIDE VIEW", thumbnail: "/thumbnails/side.jpg" },
//   { id: "BATSMAN", name: "BATSMAN END", thumbnail: "/thumbnails/batsman.jpg" },
//   { id: "BOWLER", name: "BOWLER END", thumbnail: "/thumbnails/bowler.jpg" },
//   { id: "STUMP", name: "STUMP CAM", thumbnail: "/thumbnails/stump.jpg" },
//   { id: "ARIEL", name: "ARIEL VIEW", thumbnail: "/thumbnails/ariel.jpg" },
// ];

// const CricketAnalyticsPage: React.FC = () => {
//   const { matchId } = useParams();
//   const [matchData, setMatchData] = useState<any>(null);
//   const [activeInning, setActiveInning] = useState<number>(1);
//   const [loading, setLoading] = useState(true);
//   const [activeView, setActiveView] = useState<ViewOption>("FRONT");
//   const [isPlaying, setIsPlaying] = useState(false);
//   const [progress, setProgress] = useState(0);
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const canvasRef = useRef<HTMLCanvasElement>(null);
//   const progressBarRef = useRef<HTMLDivElement>(null);
//   const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
//   const [showBattingStats, setShowBattingStats] = useState(false);
//   const formatTime = (seconds: number) => {
//     const mins = Math.floor(seconds / 60);
//     const secs = Math.floor(seconds % 60);
//     return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
//   };

//   // Initialize MediaPipe AI
//   useEffect(() => {
//     const setupAI = async () => {
//       const vision = await FilesetResolver.forVisionTasks(
//         "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm",
//       );
//       poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(
//         vision,
//         {
//           baseOptions: {
//             modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
//             delegate: "GPU",
//           },
//           runningMode: "VIDEO",
//           numPoses: 1,
//         },
//       );
//     };
//     setupAI();
//   }, []);

//   useEffect(() => {
//       const fetchMatchDetails = async () => {
//         if (!matchId) return;
//         setLoading(true);
//         try {
//           const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/matches/${matchId}`, {
//             method: 'GET',
//             headers: { 'Content-Type': 'application/json' },
//             credentials: 'include',
//           });
//           if (response.ok) {
//             const data = await response.json();
//             setMatchData(data);
//           }
//         } catch (error) {
//           console.error("Error fetching match:", error);
//         } finally {
//           setLoading(false);
//         }
//       };
//       fetchMatchDetails();
//     }, [matchId]);
  

//   // Helper to split team names (Handles "SA vs ENG" or "SA - ENG")
//   const getTeams = () => {
//     if (!matchData?.name) return { team1: "Team 1", team2: "Team 2" };
//     const parts = matchData.name.split(/vs|-/i);
//     return {
//       team1: parts[0]?.trim() || "Team 1",
//       team2: parts[1]?.trim() || "Team 2"
//     };
//   };

//   const { team1, team2 } = getTeams();

//   // Frame-by-frame processing loop
//   useEffect(() => {
//     let requestID: number;

//     const processFrame = () => {
//       if (
//         videoRef.current &&
//         canvasRef.current &&
//         poseLandmarkerRef.current &&
//         isPlaying
//       ) {
//         const video = videoRef.current;
//         const canvas = canvasRef.current;
//         const ctx = canvas.getContext("2d");

//         if (ctx && video.readyState >= 2) {
//           // Sync canvas size to video display size
//           canvas.width = video.clientWidth;
//           canvas.height = video.clientHeight;

//           const results = poseLandmarkerRef.current.detectForVideo(
//             video,
//             performance.now(),
//           );
//           ctx.clearRect(0, 0, canvas.width, canvas.height);

//           const drawingUtils = new DrawingUtils(ctx);
//           if (results.landmarks) {
//             for (const landmark of results.landmarks) {
//               // Draw the skeleton connections in Orange
//               drawingUtils.drawConnectors(
//                 landmark,
//                 PoseLandmarker.POSE_CONNECTIONS,
//                 {
//                   color: "#FF6B00",
//                   lineWidth: 2,
//                 },
//               );
//               // Draw the white joint dots
//               drawingUtils.drawLandmarks(landmark, {
//                 color: "#FFFFFF",
//                 fillColor: "#FF6B00",
//                 lineWidth: 1,
//                 radius: 3,
//               });
//             }
//           }
//         }
//       }
//       requestID = requestAnimationFrame(processFrame);
//     };

//     processFrame();
//     return () => cancelAnimationFrame(requestID);
//   }, [isPlaying]);

//   // Handle Play/Pause
//   const togglePlay = () => {
//     if (videoRef.current) {
//       if (isPlaying) {
//         videoRef.current.pause();
//       } else {
//         videoRef.current.play();
//       }
//       setIsPlaying(!isPlaying);
//     }
//   };

//   // Update Progress Bar
//   const handleTimeUpdate = () => {
//     if (videoRef.current) {
//       const current =
//         (videoRef.current.currentTime / videoRef.current.duration) * 100;
//       setProgress(current || 0);
//     }
//   };

//   // Skip time logic
//   const skip = (amount: number) => {
//     if (videoRef.current) {
//       videoRef.current.currentTime += amount;
//     }
//   };

//   // Reset video when view changes
//   useEffect(() => {
//     if (videoRef.current) {
//       videoRef.current.load();
//       setIsPlaying(false);
//       setProgress(0);
//     }
//   }, [activeView]);

//   // Add this function to handle the click
//   const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
//     if (videoRef.current && progressBarRef.current) {
//       const rect = progressBarRef.current.getBoundingClientRect();
//       const clickX = e.clientX - rect.left; // Pixel position of click inside the bar
//       const width = rect.width; // Total width of the bar
//       const seekPercentage = clickX / width;

//       // Update the video's current time
//       videoRef.current.currentTime = seekPercentage * videoRef.current.duration;
//     }
//   };

//   const getMatchStatus = () => {
//   if (!matchData?.date) return { text: "N/A", color: "bg-slate-400" };

//   const today = new Date();
//   today.setHours(0, 0, 0, 0); 

//   const matchDate = new Date(matchData.date);
//   matchDate.setHours(0, 0, 0, 0); 
//   if (matchDate.getTime() === today.getTime()) {
//     return { text: "LIVE", color: "bg-red-600" };
//   } else if (matchDate.getTime() > today.getTime()) {
//     return { text: "UPCOMING", color: "bg-blue-600" };
//   } else {
//     return { text: "FINISHED", color: "bg-green-500" };
//   }
// };

// const status = getMatchStatus();

//   return (
//     <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-2">
//       {/* 1. Header with Breadcrumbs and Tabs */}
//       <header className="flex items-center justify-between mb-6 bg-transparent px-1">
//         {/* Left Side: Breadcrumbs */}
//         <div className="flex items-center text-[13px] font-medium text-slate-500">
//           Home <span className="mx-2 text-slate-400 font-light">{">"}</span>
//           <span className="text-slate-900">Analytics</span>
//         </div>

//         {/* Right Side: Static Navigation Tabs */}
//         <div className="flex bg-[#F1F3F6] p-1 rounded-xl shadow-sm border border-slate-200/50">
//           <button 
//             onClick={() => setActiveInning(1)}
//             className={`md:px-10 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
//               activeInning === 1 ? "bg-black text-white shadow-md" : "text-gray-500"
//             }`}
//           >
//             Inning 1
//           </button>
//           <button 
//             onClick={() => setActiveInning(2)}
//             className={`md:px-10 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
//               activeInning === 2 ? "bg-black text-white shadow-md" : "text-gray-500"
//             }`}
//           >
//             Inning 2
//           </button>
//         </div>
//       </header>

//       {/*  Full Width Header Scoreboard */}
//       <div className="flex flex-col mb-4">
//         {/* The Main Container */}
//         <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
//           {/* Top Row: Responsive Container */}
//           <div className="px-4 py-4 md:px-6 md:py-3 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0">
//             {/* Left Section: Live Badge & Team 1 */}
//             <div className="flex items-center justify-between w-full md:w-auto gap-4">
//               <div className="flex items-center gap-3">
//                 <span className={`px-2.5 py-0.5 text-[10px] md:text-[11px] font-bold text-white ${status.color} rounded-md border shrink-0`}>
//   {status.text}
// </span>
//                 <div className="hidden md:block h-8 w-[2px] bg-slate-200 mx-1" />
//                 <div className="flex items-center gap-2">
//                   <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-yellow-400 font-semibold flex items-center justify-center text-xs md:text-sm shadow shrink-0">
//                     {team1.substring(0, 2).toUpperCase()}
//                   </div>
//                   <span className="text-xs md:text-sm font-bold whitespace-nowrap">
//                     {team1} -{" "}
//                     <span className="font-normal text-slate-500 text-semibold  ">
//                       225/9 (20)
//                     </span>
//                   </span>
//                 </div>
//               </div>

//               {/* Mobile-only divider or spacer can go here if needed */}
//             </div>

//             {/* Middle Section: Status Text - Moves to center/bottom on mobile */}
//             <div className="hidden md:block h-8 w-[2px] bg-slate-200 mx-2" />
//             <div className="text-[11px] md:text-sm font-medium text-slate-400 text-center order-3 md:order-none">
//               {matchData?.results || 'Match Results will be displayed here'}
//             </div>
//             <div className="hidden md:block h-8 w-[2px] bg-slate-200 mx-2" />

//             {/* Right Section: Team 2 & Toggle Button */}
//             <div className="flex items-center justify-between w-full md:w-auto gap-4">
//               <div className="flex items-center gap-2">
//                 <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-red-500 font-semibold flex items-center justify-center text-xs md:text-sm shadow shrink-0">
//                   {team2.substring(0, 2).toUpperCase()}
//                 </div>
//                 <span className="text-xs md:text-sm font-bold whitespace-nowrap">
//                   {team2} -{" "}
//                   <span className="font-normal text-slate-500">225/9 (20)</span>
//                 </span>
//               </div>

//               <button
//                 onClick={() => setShowBattingStats(!showBattingStats)}
//                 className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] md:text-[12px] font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shrink-0 shadow-sm"
//               >
//                 <span className="hidden sm:inline">
//                   {showBattingStats ? "View less" : "View More"}
//                 </span>
//                 <span className="sm:hidden">
//                   {showBattingStats ? "Less" : "More"}
//                 </span>
//                 <svg
//                   className={`w-3.5 h-3.5 transition-transform ${showBattingStats ? "rotate-180" : ""}`}
//                   fill="none"
//                   viewBox="0 0 24 24"
//                   stroke="currentColor"
//                 >
//                   <path
//                     strokeLinecap="round"
//                     strokeLinejoin="round"
//                     strokeWidth={2}
//                     d="M19 9l-7 7-7-7"
//                   />
//                 </svg>
//               </button>
//             </div>
//           </div>

//           {/* Bottom Section: Stats Component */}
//           {showBattingStats && (
//             <div className="bg-white border-t border-slate-100 animate-in slide-in-from-top-2 duration-300">
//               <Stats />
//             </div>
//           )}
//         </div>
//       </div>

//       {/*  Main Split Content */}
//       <div className="flex flex-col lg:flex-row gap-4">
//         {/* LEFT COLUMN */}
//         <div className="flex-1 space-y-4">
//           <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center gap-2 md:gap-4">
//             {/* Select Over - Full width on mobile, fixed width on desktop */}
//             <div className="relative group w-full md:w-auto">
//               <button className="flex items-center justify-between w-full md:w-40 px-4 py-2 text-[13px] font-medium border-b md:border-b-0 md:border-r border-gray-200 md:border-gray-300 text-slate-600">
//                 Select Over
//                 <svg
//                   className="w-4 h-4 text-slate-400"
//                   fill="none"
//                   viewBox="0 0 24 24"
//                   stroke="currentColor"
//                 >
//                   <path
//                     strokeLinecap="round"
//                     strokeLinejoin="round"
//                     strokeWidth={2}
//                     d="M19 9l-7 7-7-7"
//                   />
//                 </svg>
//               </button>
//             </div>

//             {/* Balls Container - Becomes a horizontal slider on mobile */}
//             <div className="flex items-center gap-3 overflow-x-auto w-full no-scrollbar py-2 px-1 snap-x">
//               {overBalls.map((ball, idx) => {
//                 const isWicket = ball.type === "wicket";
//                 const isBoundary = ball.type === "boundary";
//                 const isZero = ball.type === "zero" || ball.val === "0";

//                 const bgOuter = isWicket
//                   ? "bg-red-50"
//                   : isBoundary
//                     ? "bg-blue-50"
//                     : isZero
//                       ? ""
//                       : "bg-slate-50";

//                 const bgInner = isWicket
//                   ? "bg-red-300 text-red-600 shadow-lg shadow-red-200"
//                   : isBoundary
//                     ? "bg-blue-300 text-blue-600 shadow-lg shadow-blue-200"
//                     : isZero
//                       ? "bg-transparent text-slate-400 border-2 border-dashed border-slate-300"
//                       : "bg-slate-300 text-slate-600";

//                 return (
//                   <div
//                     key={idx}
//                     className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all snap-center ${bgOuter}`}
//                   >
//                     <div
//                       className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-md transition-all ${bgInner}`}
//                     >
//                       {ball.val}
//                     </div>
//                   </div>
//                 );
//               })}
//             </div>
//           </div>

//           {/* Video Player Section */}
//           <div className="relative bg-black rounded-2xl overflow-hidden aspect-video shadow-2xl group border border-slate-200">
//             <video
//               ref={videoRef}
//               onTimeUpdate={handleTimeUpdate}
//               className="absolute inset-0 w-full h-full object-cover"
//               src={videoMap[activeView]}
//               playsInline
//             />

//             {/* Removed Skeletal SVG as requested */}

//             {/* Label Overlay */}
//             <div className="absolute top-4 left-6 bg-black/10 backdrop-blur-md md:p-4 p-2 rounded-xl border border-white/20 text-white">
//               <p className="text-[10px] text-white/80  uppercase tracking-widest font-normal">
//                 Ball 12.4 Analytics
//               </p>
//               <p className="md:text-xl text-xs font-bold">
//                 6 Runs - Lofted Cover Drive
//               </p>
//             </div>
//             {/* THE AI SKELETON LAYER */}
//             <canvas
//               ref={canvasRef}
//               className="absolute inset-0 w-full h-full pointer-events-none z-10"
//             />

//             <div className="absolute top-4 right-6 flex items-center gap-3">
//               <button className="p-3 rounded-full bg-black/10 backdrop-blur-sm border border-white/20 text-white hover:text-white">
//                 <svg
//                   className="w-5 h-5"
//                   fill="none"
//                   viewBox="0 0 24 24"
//                   stroke="currentColor"
//                 >
//                   <path
//                     strokeLinecap="round"
//                     strokeLinejoin="round"
//                     strokeWidth={2}
//                     d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
//                   />
//                   <path
//                     strokeLinecap="round"
//                     strokeLinejoin="round"
//                     strokeWidth={2}
//                     d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
//                   />
//                 </svg>
//               </button>
//               <button className="p-3 rounded-full bg-black/10 backdrop-blur-sm border border-white/20 text-white hover:text-white">
//                 <LayoutTemplate size={18} className="text-white" />
//               </button>
//             </div>

//             {/* Video Controls */}
//             <div className="absolute inset-0 flex items-center justify-center gap-12 opacity-0 group-hover:opacity-100 transition-opacity">
//               <button
//                 onClick={() => skip(-5)}
//                 className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-[#d2c9c9] border border-white/30 font-bold hover:bg-white/40"
//               >
//                 -5F
//               </button>
//               <button
//                 onClick={togglePlay}
//                 className="w-16 h-16 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-[#2b2828] border border-white/40 hover:bg-white/50 transition-all"
//               >
//                 {isPlaying ? (
//                   <svg
//                     className="w-8 h-8"
//                     fill="currentColor"
//                     viewBox="0 0 24 24"
//                   >
//                     <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
//                   </svg>
//                 ) : (
//                   <svg
//                     className="w-8 h-8 ml-1"
//                     fill="currentColor"
//                     viewBox="0 0 24 24"
//                   >
//                     <path d="M8 5v14l11-7z" />
//                   </svg>
//                 )}
//               </button>
//               <button
//                 onClick={() => skip(5)}
//                 className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-[#d2c9c9] border border-white/30 font-bold hover:bg-white/40"
//               >
//                 +5F
//               </button>
//             </div>

//             <div className="absolute bottom-6 left-6 right-6 flex items-center gap-4 text-white text-[11px] font-mono">
//               <span className="tabular-nums">
//                 {videoRef.current
//                   ? formatTime(videoRef.current.currentTime)
//                   : "00:00"}{" "}
//                 /{" "}
//                 {videoRef.current
//                   ? formatTime(videoRef.current.duration || 0)
//                   : "00:00"}
//               </span>

//               {/* Clickable Progress Bar Container */}
//               <div
//                 ref={progressBarRef}
//                 onClick={handleSeek}
//                 className="flex-1 h-3 flex items-center group/bar cursor-pointer"
//               >
//                 <div className="w-full h-1 bg-white/20 rounded-full relative overflow-hidden">
//                   <div
//                     className="absolute inset-y-0 left-0 bg-white rounded-full transition-all duration-100"
//                     style={{ width: `${progress}%` }}
//                   />
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>

    
//         {/* RIGHT COLUMN (Biomechanics Sidebar) */}
//         <div className="w-full lg:w-[340px] bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col">
//           <h2 className="text-xl font-bold text-slate-900">Biomechanics</h2>
//           <p className="text-[12px] text-slate-400 mb-4">
//             Graph of overall Batting Performance
//           </p>

        
//           <div className="relative mb-2 px-2">
//             {/* The Legend Box & Dotted Top Line */}
//             <div className="absolute top-[20%] left-0 right-0 border-t border-dashed border-slate-300 z-0">
//               <div className="absolute -top-4 left-0 bg-slate-800 rounded-md p-1.5 flex flex-col gap-1 shadow-lg z-20">
//                 <div className="flex items-center gap-1.5">
//                   <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
//                   <div className="w-5 h-[1px] bg-slate-600" />
//                 </div>
//                 <div className="flex items-center gap-1.5">
//                   <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
//                   <div className="w-5 h-[1px] bg-slate-600" />
//                 </div>
//               </div>
//             </div>

//             {/* 2. The Graph Container */}
//             <div className="h-28 w-full relative flex items-end justify-between px-2 border-b border-slate-100">
//               {/* Yellow Vertical Indicator (Diamond Tips) */}
//               <div className="absolute left-[72%] top-0 bottom-0 w-[1px] bg-yellow-400 z-10">
//                 <div className="absolute -top-1 -left-[3px] w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-b-[6px] border-b-yellow-400" />
//                 <div className="absolute -bottom-1 -left-[3px] w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-t-[6px] border-t-yellow-400" />
//               </div>

//               {/* Lollipop Bars & Spacer Lines */}
//               {[15, 45, 20, 30, 60, 40, 55, 85, 35, 65, 45, 50].map((h, i) => (
//                 <React.Fragment key={i}>
//                   {/* The Lollipop Bar */}
//                   <div className="flex flex-col items-center h-full justify-end relative">
//                     <div
//                       className={`w-1.5 h-1.5 rounded-full mb-[-3px] z-20 
//                 ${i === 7 ? "bg-yellow-400" : "bg-slate-100"}`}
//                     />
//                     <div
//                       className={`w-[1px] ${i === 7 ? "bg-yellow-400" : "bg-slate-100"}`}
//                       style={{ height: `${h}%` }}
//                     />
//                   </div>

//                   {/* THE SIMPLE LINE BETWEEN (Spacers) */}
//                   {i < 11 && (
//                     <div className="h-20 w-[1px] bg-slate-50 self-center opacity-50" />
//                   )}
//                 </React.Fragment>
//               ))}
//             </div>

//             {/* 3. Percentage Labels */}
//             <div className="flex justify-between mt-2 px-4">
//               {["15%", "30%", "45%", "60%", "75%"].map((label) => (
//                 <span
//                   key={label}
//                   className="text-[10px] font-bold text-slate-300 tracking-wider"
//                 >
//                   {label}
//                 </span>
//               ))}
//             </div>
//           </div>

//           {/* Metrics List */}
//           <div className="flex-1">
//             {biomechanicsMetrics.map((m, i) => (
//               <div
//                 key={i}
//                 className="flex items-center justify-between py-1 group cursor-pointer"
//               >
//                 <div className="flex items-center gap-2">
//                   <div
//                     className={`w-8 h-8 rounded-xl ${m.color} transition-transform group-hover:scale-105`}
//                   />
//                   <span className="text-[14px] font-medium text-slate-500">
//                     {m.name}
//                   </span>
//                 </div>
//                 <div className="flex items-center gap-3">
//                   <span className="text-[14px] font-bold text-slate-900">
//                     {m.value}
//                   </span>
//                   <button className="text-slate-300 hover:text-slate-400">
//                     <svg
//                       className="w-5 h-5"
//                       fill="currentColor"
//                       viewBox="0 0 24 24"
//                     >
//                       <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
//                     </svg>
//                   </button>
//                 </div>
//               </div>
//             ))}
//           </div>

//           <button className=" flex items-center justify-center gap-1 text-[13px] font-bold text-slate-800 hover:gap-3 transition-all ">
//             See more
//             <svg
//               className="w-4 h-4"
//               fill="none"
//               viewBox="0 0 24 24"
//               stroke="currentColor"
//               strokeWidth={3}
//             >
//               <path d="M14 5l7 7m0 0l-7 7m7-7H3" />
//             </svg>
//           </button>
//         </div>
//       </div>

//       {/* Bottom Grid (Camera Angles as Video Previews) */}
//       <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
//         {cameraViews.map((view) => (
//           <button
//             key={view.id}
//             onClick={() => setActiveView(view.id)}
//             className="flex flex-col gap-2 group text-left"
//           >
//             <div
//               className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all 
//         ${activeView === view.id ? "border-blue-500 scale-[1.02] shadow-lg" : "border-transparent opacity-80"}`}
//             >
//               {/* Swapped <img> for <video> for live previews */}
//               <video
//                 src={videoMap[view.id]}
//                 className="w-full h-full object-cover"
//                 autoPlay
//                 muted
//                 loop
//                 playsInline
//               />

//               {/* Selection Overlay */}
//               {activeView === view.id && (
//                 <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center ">
//                   <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md">
//                     <svg
//                       className="w-4 h-4 text-white"
//                       fill="none"
//                       viewBox="0 0 24 24"
//                       stroke="currentColor"
//                     >
//                       <path
//                         strokeLinecap="round"
//                         strokeLinejoin="round"
//                         strokeWidth={3}
//                         d="M5 13l4 4L19 7"
//                       />
//                     </svg>
//                   </div>
//                 </div>
//               )}
//             </div>

//             <span
//               className={`text-[10px] font-black uppercase tracking-tighter text-center
//         ${activeView === view.id ? "text-blue-600" : "text-slate-800 group-hover:text-slate-600"}`}
//             >
//               {view.name}
//             </span>
//           </button>
//         ))}
//       </div>
//       <div className='text-gray-700 grid-cols-1 font-black uppercase tracking-wider items-center  '>the video ball by ball by ball  </div>
//     </div>
//   );
// };

// export default CricketAnalyticsPage;


// "use client";

// import { LayoutTemplate } from "lucide-react";
// import React, { useState, useRef, useEffect, useMemo } from "react";
// import { useParams } from "next/navigation";
// import {
//   PoseLandmarker,
//   FilesetResolver,
//   DrawingUtils,
// } from "@mediapipe/tasks-vision";
// import Stats from "../stats";

// type ViewOption = "FRONT" | "SIDE" | "BATSMAN" | "BOWLER" | "STUMP" | "ARIEL";

// const CAMERA_MAPPING: Record<ViewOption, string> = {
//   FRONT: "cam_1",
//   SIDE: "cam_2",
//   BATSMAN: "cam_3",
//   BOWLER: "cam_4",
//   STUMP: "cam_5",
//   ARIEL: "cam_6",
// };

// const cameraViews: { id: ViewOption; name: string }[] = [
//   { id: "FRONT", name: "FRONT VIEW Cam_1" },
//   { id: "SIDE", name: "SIDE VIEW Cam_2" },
//   { id: "BATSMAN", name: "BATSMAN END Cam_3" },
//   { id: "BOWLER", name: "BOWLER END Cam_4" },
//   { id: "STUMP", name: "STUMP CAM Cam_5" },
//   { id: "ARIEL", name: "AERIAL VIEW Cam_6" },
// ];

// const biomechanicsMetrics = [
//   { name: "Balance", value: "Average", color: "bg-amber-100" },
//   { name: "Head Hand Combination", value: "156.987", color: "bg-red-100" },
//   { name: "Stance", value: "Wide", color: "bg-purple-100" },
//   { name: "Shoulder", value: "Open", color: "bg-slate-200" },
//   { name: "Head", value: "Aligned", color: "bg-slate-200" },
//   { name: "Weight Distribution", value: "51%", color: "bg-teal-100" },
// ];

// const CricketAnalyticsPage: React.FC = () => {
//   const { matchId } = useParams();
//   const [matchData, setMatchData] = useState<any>(null);
//   const [syncData, setSyncData] = useState<any>(null);
//   const [activeInning, setActiveInning] = useState<string>("1st");
//   const [loading, setLoading] = useState(true);
//   const [activeView, setActiveView] = useState<ViewOption>("FRONT");
//   const [selectedBall, setSelectedBall] = useState<string>("");
//   const [selectedOver, setSelectedOver] = useState<string>("0");

//   const [isPlaying, setIsPlaying] = useState(false);
//   const [progress, setProgress] = useState(0);
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const canvasRef = useRef<HTMLCanvasElement>(null);
//   const progressBarRef = useRef<HTMLDivElement>(null);
//   const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
//   const [showBattingStats, setShowBattingStats] = useState(false);

//   // DATA FETCHING
//   useEffect(() => {
//     const fetchData = async () => {
//       if (!matchId) return;
//       setLoading(true);
//       try {
//         const mRes = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/matches/${matchId}`, { credentials: 'include' });
//         if (mRes.ok) setMatchData(await mRes.json());

//         const sRes = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/matches/${matchId}/sync-view?withDownloadUrls=true`, { credentials: 'include' });
//         if (sRes.ok) {
//           const data = await sRes.json();
//           console.log("Sync-View Data:", data);
//           setSyncData(data);
//         }
//       } catch (error) {
//         console.error("Error fetching data:", error);
//       } finally {
//         setLoading(false);
//       }
//     };
//     fetchData();
//   }, [matchId]);

  
//   // --- VIDEO MAPPING LOGIC ---
// const ballMap = useMemo(() => {
//   if (!syncData?.folders) return {};
//   const map: Record<string, Record<string, string>> = {};

//   // Create a prefix string based on activeInning (e.g., "match_01")
//   const inningPrefix = `match_${activeInning.toString().padStart(2, '0')}`;

//   Object.entries(syncData.folders).forEach(([folderPath, folderData]: [string, any]) => {
//     // Only process folders for the active inning
//     if (folderPath.startsWith(inningPrefix)) {
//       // Extract cam_X from "match_01/cam_1"
//       const folderKey = folderPath.split('/').pop()?.toLowerCase() || "";
      
//       folderData.files.forEach((file: any) => {
//         const ballMatch = file.file.match(/(\d+\.\d+)/);
//         if (ballMatch) {
//           const ballId = ballMatch[0];
//           if (!map[ballId]) map[ballId] = {};
//           map[ballId][folderKey] = file.downloadUrl;
//           console.log("Mapped Ball URLs:", map);
//         }
//       });
//     }
//   });

//   const sortedBalls = Object.keys(map).sort((a, b) => parseFloat(a) - parseFloat(b));
  
//   // Reset selected ball if the current one isn't in the new inning's map
//   if (sortedBalls.length > 0) {
//     if (!selectedBall || !map[selectedBall]) {
//       setSelectedBall(sortedBalls[0]);
//       setSelectedOver(sortedBalls[0].split('.')[0]);
//     }
//   } else {
//     setSelectedBall(""); // Clear selection if no data for this inning
//   }
  
//   return map;
// }, [syncData, activeInning]); // Added activeInning as a dependency
//   const availableOvers = useMemo(() => {
//     const overs = new Set<string>();
//     Object.keys(ballMap).forEach(id => overs.add(id.split('.')[0]));
//     return Array.from(overs).sort((a, b) => parseInt(a) - parseInt(b));
//   }, [ballMap]);

//   const currentOverBalls = useMemo(() => {
//     return Object.keys(ballMap)
//       .filter(id => id.startsWith(`${selectedOver}.`))
//       .sort((a, b) => parseFloat(a) - parseFloat(b));
//   }, [ballMap, selectedOver]);

//   const currentVideoUrl = useMemo(() => {
//     const camKey = CAMERA_MAPPING[activeView];
//     return ballMap[selectedBall]?.[camKey] || null;
    
//   }, [activeView, selectedBall, ballMap]);

//   // 2. Add this Effect to log the URL
// useEffect(() => {
//   if (currentVideoUrl) {
//     console.log(" Active Video URL:", currentVideoUrl);
//   } else {
//     console.warn(" No video URL found for:", { activeView, selectedBall });
//   }
// }, [currentVideoUrl, activeView, selectedBall]);

//   // --- AI SETUP ---
//   useEffect(() => {
//     const setupAI = async () => {
//       const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
//       poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
//         baseOptions: {
//           modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
//           delegate: "GPU",
//         },
//         runningMode: "VIDEO",
//         numPoses: 1,
//       });
//     };
//     setupAI();
//   }, []);

  

//   useEffect(() => {
//     let requestID: number;
//     const processFrame = () => {
//       if (videoRef.current && canvasRef.current && poseLandmarkerRef.current && isPlaying) {
//         const video = videoRef.current;
//         const canvas = canvasRef.current;
//         const ctx = canvas.getContext("2d");
//         if (ctx && video.readyState >= 2 ) {
//           canvas.width = video.clientWidth;
//           canvas.height = video.clientHeight;
//           const results = poseLandmarkerRef.current.detectForVideo(video, performance.now());
//           ctx.clearRect(0, 0, canvas.width, canvas.height);
//           const drawingUtils = new DrawingUtils(ctx);
//           if (results.landmarks) {
//             for (const landmark of results.landmarks) {
//               drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS, { color: "#FF6B00", lineWidth: 2 });
//               drawingUtils.drawLandmarks(landmark, { color: "#FFFFFF", fillColor: "#FF6B00", lineWidth: 1, radius: 3 });
//             }
//           }
//         }
//       }
//       requestID = requestAnimationFrame(processFrame);
//     };
//     processFrame();
//     return () => cancelAnimationFrame(requestID);
//   }, [isPlaying]);

//   // --- UI HANDLERS ---
//   const formatTime = (seconds: number) => {
//     if (isNaN(seconds)) return "00:00";
//     const mins = Math.floor(seconds / 60);
//     const secs = Math.floor(seconds % 60);
//     return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
//   };

//   const togglePlay = () => {
//     if (videoRef.current) {
//       isPlaying ? videoRef.current.pause() : videoRef.current.play();
//       setIsPlaying(!isPlaying);
//     }
//   };

//   const handleTimeUpdate = () => {
//     if (videoRef.current) setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100 || 0);
//   };

//   const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
//     if (videoRef.current && progressBarRef.current) {
//       const rect = progressBarRef.current.getBoundingClientRect();
//       videoRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * videoRef.current.duration;
//     }
//   };

//   const status = useMemo(() => {
//     if (!matchData?.date) return { text: "N/A", color: "bg-slate-400" };
//     const today = new Date(); today.setHours(0,0,0,0);
//     const mDate = new Date(matchData.date); mDate.setHours(0,0,0,0);
//     if (mDate.getTime() === today.getTime()) return { text: "LIVE", color: "bg-red-600" };
//     if (mDate.getTime() > today.getTime()) return { text: "UPCOMING", color: "bg-blue-600" };
//     return { text: "FINISHED", color: "bg-green-500" };
//   }, [matchData]);

//   const { team1, team2 } = useMemo(() => {
//     const parts = matchData?.name?.split(/vs|-/i) || ["Team 1", "Team 2"];
//     return { team1: parts[0]?.trim() || "Team 1", team2: parts[1]?.trim() || "Team 2" };
//   }, [matchData]);

//   if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400">Loading Khel.ai Analytics...</div>;

//   return (
//     <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
//       {/* 1. Header */}
//       <header className="flex items-center justify-between mb-3 bg-transparent px-1">
//         <div className="flex items-center text-[13px] font-medium text-slate-500">
//           Home <span className="mx-2 text-slate-400 font-light">{">"}</span>
//           <span className="text-slate-900">Analytics</span>
//         </div>
//         <div className="flex bg-[#F1F3F6] p-1 rounded-xl shadow-sm border border-slate-200/50">
//   {["1st", "2nd"].map((num) => (
//     <button
//       key={num}
//       onClick={() => {
//         setActiveInning(num);
//         setIsPlaying(false); // Stop playback when switching innings
//         if (videoRef.current) videoRef.current.pause();
//       }}
//       className={`md:px-10 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
//         activeInning === num 
//           ? "bg-black text-white shadow-md" 
//           : "text-gray-500 hover:text-gray-700"
//       }`}
//     >
//       {num} Innings
//     </button>
//   ))}
// </div>
//       </header>

//       {/* 2. Scoreboard (Restored your layout) */}
//       <div className="flex flex-col mb-4">
//         <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
//           <div className="px-4 py-4 md:px-6 md:py-3 flex flex-col md:flex-row items-center justify-between gap-4">
//             <div className="flex items-center justify-between w-full md:w-auto gap-4">
//               <div className="flex items-center gap-3">
//                 <span className={`px-2.5 py-0.5 text-[10px] md:text-[11px] font-bold text-white ${status.color} rounded-md border shrink-0`}>{status.text}</span>
//                 <div className="hidden md:block h-8 w-[2px] bg-slate-200 mx-1" />
//                 <div className="flex items-center gap-2">
//                   <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-yellow-400 font-semibold flex items-center justify-center text-xs shadow shrink-0">{team1.substring(0, 2).toUpperCase()}</div>
//                   <span className="text-xs md:text-sm font-bold whitespace-nowrap">{team1} - <span className="font-normal text-slate-500">0/0 (0)</span></span>
//                 </div>
//               </div>
//             </div>
//             <div className="hidden md:block h-8 w-[2px] bg-slate-200 mx-2" />
//             <div className="text-[11px] md:text-sm font-medium text-slate-400 text-center order-3 md:order-none">{matchData?.results || 'Match Results will be displayed here'}</div>
//             <div className="hidden md:block h-8 w-[2px] bg-slate-200 mx-2" />
//             <div className="flex items-center justify-between w-full md:w-auto gap-4">
//               <div className="flex items-center gap-2">
//                 <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-red-500 font-semibold flex items-center justify-center text-xs shadow shrink-0">{team2.substring(0, 2).toUpperCase()}</div>
//                 <span className="text-xs md:text-sm font-bold whitespace-nowrap">{team2} - <span className="font-normal text-slate-500">0/0 (0)</span></span>
//               </div>
//               <button onClick={() => setShowBattingStats(!showBattingStats)} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
//                 <span>{showBattingStats ? "View less" : "View More"}</span>
//                 <svg className={`w-3.5 h-3.5 transition-transform ${showBattingStats ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
//               </button>
//             </div>
//           </div>
//           {showBattingStats && <div className="bg-white border-t border-slate-100 animate-in slide-in-from-top-2 duration-300"><Stats /></div>}
//         </div>
//       </div>

//       {/* 3. Main Split Content (Restored original video & balls layout) */}
//       <div className="flex flex-col lg:flex-row gap-4">
//         <div className="flex-1 space-y-4">
//           {/* Over Selection */}
//           <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center gap-2 md:gap-4">
//   {/* 1. Over Selection with Empty Check */}
//   <div className="relative w-full md:w-auto border-b md:border-b-0 md:border-r border-slate-200">
//     {availableOvers.length > 0 ? (
//       <select 
//         value={selectedOver} 
//         onChange={(e) => setSelectedOver(e.target.value)} 
//         className="w-full md:w-40 px-4 py-2 text-[13px] font-bold bg-transparent text-slate-600 outline-none"
//       >
//         {availableOvers.map(o => <option key={o} value={o}>Over {o}</option>)}
//       </select>
//     ) : (
//       <div className="w-full md:w-40 px-4 py-2 text-[13px] font-bold text-slate-400">
//         No Overs
//       </div>
//     )}
//   </div>

//   {/* 2. Ball Selection with Empty Check */}
//   <div className="flex items-center gap-3 overflow-x-auto w-full no-scrollbar py-2 px-1">
//     {currentOverBalls.length > 0 ? (
//       currentOverBalls.map((ballId) => (
//         <button 
//           key={ballId} 
//           onClick={() => setSelectedBall(ballId)} 
//           className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all ${
//             selectedBall === ballId ? "bg-blue-50" : "bg-slate-50"
//           }`}
//         >
//           <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-md ${
//             selectedBall === ballId 
//               ? "bg-blue-300 text-blue-500 shadow-lg shadow-blue-200" 
//               : "bg-slate-300 text-slate-600"
//           }`}>
//             {ballId.split('.')[1]}
//           </div>
//         </button>
//       ))
//     ) : (
//       <div className="flex items-center gap-2 text-slate-400 text-[12px] font-medium px-2">
//         <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-dashed border-slate-300">
//           ?
//         </div>
//         <span>No balls recorded for this over</span>
//       </div>
//     )}
//   </div>
// </div>

//           {/* Main Video Section (Restored your Controls & Styling) */}
//           <div className="relative bg-black rounded-2xl overflow-hidden aspect-video shadow-2xl group border border-slate-200">
            
//             <video ref={videoRef} onTimeUpdate={handleTimeUpdate} className="absolute inset-0 w-full h-full object-cover" src={currentVideoUrl || undefined} crossOrigin="anonymous" playsInline />
            
//             <div className="absolute top-4 left-6 bg-black/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-white z-20">
//               <p className="text-[10px] text-white/80 uppercase tracking-widest">Ball {selectedBall} Analytics</p>
//               <p className="md:text-xl text-xs font-bold">{activeView} VIEW - {matchData?.name}</p>
//             </div>
//             <div className="absolute top-4 right-6 flex items-center gap-3">
//                <button className="p-3 rounded-full bg-black/10 backdrop-blur-sm border border-white/20 text-white hover:text-white">
//                  <svg
//                   className="w-5 h-5"
//                    fill="none"
//                   viewBox="0 0 24 24"
//                    stroke="currentColor"
//                  >
//                    <path
//                      strokeLinecap="round"
//                      strokeLinejoin="round"
//                      strokeWidth={2}
//                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
//                    />
//                    <path
//                      strokeLinecap="round"
//                     strokeLinejoin="round"
//                     strokeWidth={2}
//                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
//                    />
//                 </svg>
//                </button>
//               <button className="p-3 rounded-full bg-black/10 backdrop-blur-sm border border-white/20 text-white hover:text-white">
//                  <LayoutTemplate size={18} className="text-white" />
//                </button>
//              </div>
            
//             <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
            
//             <div className="absolute inset-0 flex items-center justify-center gap-12 opacity-0 group-hover:opacity-100 transition-opacity z-20">
//                <button onClick={() => videoRef.current && (videoRef.current.currentTime -= 5)} className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-[#d2c9c9] border border-white/30 font-bold">-5s</button>
//                <button onClick={togglePlay} className="w-16 h-16 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-[#2b2828] border border-white/40 hover:bg-white/50 transition-all">
//                  {isPlaying ? <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
//                </button>
//                <button onClick={() => videoRef.current && (videoRef.current.currentTime += 5)} className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-[#d2c9c9] border border-white/30 font-bold">+5s</button>
//             </div>

//             <div className="absolute bottom-6 left-6 right-6 flex items-center gap-4 text-white text-[11px] font-mono z-20">
//               <span className="tabular-nums">{videoRef.current ? formatTime(videoRef.current.currentTime) : "00:00"} / {videoRef.current ? formatTime(videoRef.current.duration || 0) : "00:00"}</span>
//               <div ref={progressBarRef} onClick={handleSeek} className="flex-1 h-3 flex items-center group/bar cursor-pointer">
//                 <div className="w-full h-1 bg-white/20 rounded-full relative overflow-hidden">
//                   <div className="absolute inset-y-0 left-0 bg-white rounded-full transition-all duration-100" style={{ width: `${progress}%` }} />
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Biomechanics Sidebar (Restored your Graph & Indicator) */}
//         <div className="w-full lg:w-[340px] bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col">
//           <h2 className="text-xl font-bold text-slate-900">Biomechanics</h2>
//           <p className="text-[12px] text-slate-400 mb-4">
//             Graph of overall Batting Performance
//           </p>

        
//           <div className="relative mb-2 px-2">
//             {/* The Legend Box & Dotted Top Line */}
//             <div className="absolute top-[20%] left-0 right-0 border-t border-dashed border-slate-300 z-0">
//               <div className="absolute -top-4 left-0 bg-slate-800 rounded-md p-1.5 flex flex-col gap-1 shadow-lg z-20">
//                 <div className="flex items-center gap-1.5">
//                   <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
//                   <div className="w-5 h-[1px] bg-slate-600" />
//                 </div>
//                 <div className="flex items-center gap-1.5">
//                   <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
//                   <div className="w-5 h-[1px] bg-slate-600" />
//                 </div>
//               </div>
//             </div>

//             {/* 2. The Graph Container */}
//             <div className="h-28 w-full relative flex items-end justify-between px-2 border-b border-slate-100">
//               {/* Yellow Vertical Indicator (Diamond Tips) */}
//               <div className="absolute left-[72%] top-0 bottom-0 w-[1px] bg-yellow-400 z-10">
//                 <div className="absolute -top-1 -left-[3px] w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-b-[6px] border-b-yellow-400" />
//                 <div className="absolute -bottom-1 -left-[3px] w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-t-[6px] border-t-yellow-400" />
//               </div>

//               {/* Lollipop Bars & Spacer Lines */}
//               {[15, 45, 20, 30, 60, 40, 55, 85, 35, 65, 45, 50].map((h, i) => (
//                 <React.Fragment key={i}>
//                   {/* The Lollipop Bar */}
//                   <div className="flex flex-col items-center h-full justify-end relative">
//                     <div
//                       className={`w-1.5 h-1.5 rounded-full mb-[-3px] z-20 
//                 ${i === 7 ? "bg-yellow-400" : "bg-slate-100"}`}
//                     />
//                     <div
//                       className={`w-[1px] ${i === 7 ? "bg-yellow-400" : "bg-slate-100"}`}
//                       style={{ height: `${h}%` }}
//                     />
//                   </div>

//                   {/* THE SIMPLE LINE BETWEEN (Spacers) */}
//                   {i < 11 && (
//                     <div className="h-20 w-[1px] bg-slate-50 self-center opacity-50" />
//                   )}
//                 </React.Fragment>
//               ))}
//             </div>

//             {/* 3. Percentage Labels */}
//             <div className="flex justify-between mt-2 px-4">
//               {["15%", "30%", "45%", "60%", "75%"].map((label) => (
//                 <span
//                   key={label}
//                   className="text-[10px] font-bold text-slate-300 tracking-wider"
//                 >
//                   {label}
//                 </span>
//               ))}
//             </div>
//           </div>

//           {/* Metrics List */}
//           <div className="flex-1">
//             {biomechanicsMetrics.map((m, i) => (
//               <div
//                 key={i}
//                 className="flex items-center justify-between py-1 group cursor-pointer"
//               >
//                 <div className="flex items-center gap-2">
//                   <div
//                     className={`w-8 h-8 rounded-xl ${m.color} transition-transform group-hover:scale-105`}
//                   />
//                   <span className="text-[14px] font-medium text-slate-500">
//                     {m.name}
//                   </span>
//                 </div>
//                 <div className="flex items-center gap-3">
//                   <span className="text-[14px] font-bold text-slate-900">
//                     {m.value}
//                   </span>
//                   <button className="text-slate-300 hover:text-slate-400">
//                     <svg
//                       className="w-5 h-5"
//                       fill="currentColor"
//                       viewBox="0 0 24 24"
//                     >
//                       <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
//                     </svg>
//                   </button>
//                 </div>
//               </div>
//             ))}
//           </div>

//           <button className=" flex items-center justify-center gap-1 text-[13px] font-bold text-slate-800 hover:gap-3 transition-all ">
//             See more
//             <svg
//               className="w-4 h-4"
//               fill="none"
//               viewBox="0 0 24 24"
//               stroke="currentColor"
//               strokeWidth={3}
//             >
//               <path d="M14 5l7 7m0 0l-7 7m7-7H3" />
//             </svg>
//           </button>
//         </div>
//       </div>

//       {/* Bottom Grid (Restored Camera Preview Styling) */}
//       <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
//         {cameraViews.map((view) => {
//           const camKey = CAMERA_MAPPING[view.id];
//           const thumbUrl = ballMap[selectedBall]?.[camKey];
//           return (
//             <button key={view.id} onClick={() => setActiveView(view.id)} className="flex flex-col gap-2 group text-left">
//               <div className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all ${activeView === view.id ? "border-blue-500 scale-[1.02] shadow-lg" : "border-transparent opacity-80"}`}>
//                 {thumbUrl ? (
//                   <video src={thumbUrl } className="w-full h-full object-cover" autoPlay muted loop playsInline />
//                 ) : (
//                   <div className="w-full h-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-400">NO FEED</div>
//                 )}
//                 {activeView === view.id && (
//                   <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center ">
//                     <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md">
//                       <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
//                     </div>
//                   </div>
//                 )}
//               </div>
//               <span className={`text-[10px] font-black uppercase text-center ${activeView === view.id ? "text-blue-600" : "text-slate-800"}`}>{view.name}</span>
//             </button>
//           );
//         })}
//       </div>
      
//     </div>
//   );
// };

// export default CricketAnalyticsPage;


