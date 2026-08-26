
"use client";

import React, { useState, useEffect, useMemo,useRef } from 'react';
import { Search, ChevronDown, ChevronUp, Volleyball, RefreshCwIcon, UserCheck, ChevronLeft, X, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface MatchAnalysisProps {
  matchId: string;
}

// 1. First, define the base 'Appeal' interface
interface Appeal {
  id: number;
  ball_id: number;
  appeal_type: string;
  over_number: string;
  innings: number;
  is_superover?: boolean;
  superover_number?: number;
  status: string;
  metadata?: {
    umpire?: string;
  };
}

// 2. Now 'Appeal' is known, so this will work without errors
interface AppealData {
  match_id: string;
  innings: number;
  main_match_appeals: Appeal[]; 
  superover_appeals: Appeal[];
  count: number;
}

// 3. This will also work now
interface AppealLookup {
  [key: string]: Appeal;
}

interface ActiveFilter {
  id: string;
  category: 'ball' | 'appeal';
  label: string;
}

const MatchAnalysis: React.FC<MatchAnalysisProps> = ({ matchId }) => {
  const [isViewMore, setIsViewMore] = useState(false);
  const [activeInnings, setActiveInnings] = useState<'1st' | '2nd'>('1st');
  const [matchData, setMatchData] = useState<any>(null);
  const [scorecard, setScorecard] = useState<any>(null);
  // Use "as AppealData | null" to handle the initial empty state
const [appeals, setAppeals] = useState<AppealData | null>(null);
  const [inningBalls, setInningBalls] = useState<any[]>([]);
  const [superoverBalls, setSuperoverBalls] = useState<any[]>([]);
  const [selectedBallData, setSelectedBallData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [celebrationSearch, setCelebrationSearch] = useState("");

  const LENGTHS = ['Yorker', 'Bouncer', 'Full', 'Half Volley', 'Good', 'Full Toss', 'Short'];
const VARIATIONS = ['Inswinger', 'Outswinger', 'Seam Up', 'Cross Seam', 'Late in', 'Scrambled Seam', 'Late Out', 'Slower', 'Reverse Swing', 'Off Cutter', 'Leg Cutter', 'Back Off Hand', 'Knuckle', 'Split Finger', 'Beamer', 'Wide Yorker'];
const SHOTS = ['Cover Drive', 'Drive', 'Punch', 'Insight-Out', 'Cut Shot', 'Square Cut', 'Late Cut', 'Upper Cut', 'Slash', 'Straight Drive', 'Defence', 'Flick', 'Outside Edge', 'Pull', 'Sweep', 'Paddle Sweep', 'Leg Glance', 'On Drive', 'Reverse Sweep', 'Switch Hit', 'Scoop', 'Ramp Shot', 'Pick Up Shot', 'Helicopter Shot', 'Inside Edge', 'Top Edge'];
const SUSPECTS = ["chucking", "ball_tampering", "time_wasting", "dangerous_delivery", "beamer"];
const RUNS = ['1', '2', '3','0'];
const EXTRAS = ['Wide', 'No Ball', 'Leg Bye', 'Bye'];

  // 1. All available filter keys
//const filterKeys = [ 'Boundaries', 'Yorker', 'Bouncer', 'Full', 'Half Volley', 'Good', 'Full Toss', 'Short', 'Inswinger', 'Outswinger', 'Seam Up', 'Cross Seam', 'Late in', 'Scrambled Seam', 'Late Out', 'Slower', 'Reverse Swing', 'Off Cutter', 'Leg Cutter', 'Back Off Hand', 'Knuckle', 'Split Finger', 'Beamer', 'Wide Yorker', 'Cover Drive', 'Drive', 'Punch', 'Insight-Out', 'Cut Shot', 'Square Cut', 'Late Cut', 'Upper Cut', 'Slash', 'Straight Drive', 'Defence', 'Flick', 'Outside Edge', 'Pull', 'Sweep', 'Paddle Sweep', 'Leg Glance', 'On Drive', 'Reverse Sweep', 'Switch Hit', 'Scoop', 'Ramp Shot', 'Pick Up Shot', 'Helicopter Shot', 'Inside Edge', 'Top Edge', 'Deep Cover', 'Long Off', 'Long On', 'Deep Mid Wicket', 'Deep Square Leg', 'Deep Fine Leg', 'Third Man', 'Deep Point', 'Suspect Actions', "chucking", "ball_tampering", "time_wasting", "dangerous_delivery", "beamer"];
const filterKeys = [
  ...LENGTHS, 
  ...VARIATIONS, 
  ...SHOTS, 
  ...SUSPECTS, 
  ...RUNS,          // Added
  ...EXTRAS,        // Added
  'Boundaries', 
  'Other Length', 
  'Other Variation', 
  'Other Shot', 
  'Other Suspect'
];
// 2. Define State
// Change this line in your component:
const [filters, setFilters] = useState<Record<string, boolean>>(() => 
  filterKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {})
);

// Add this:
const [draftFilters, setDraftFilters] = useState(filters);

// Update your handleToggle to modify draftFilters instead of real filters:
const handleToggle = (key: string) => {
  setDraftFilters(prev => ({ ...prev, [key]: !prev[key] }));
};

const clearAllFilters = (e: React.MouseEvent) => {
  e.stopPropagation();
  const emptyFilters = filterKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {});
  setDraftFilters(emptyFilters); // Reset the visual checkboxes
  setFilters(emptyFilters);      // Reset the actual active filter
};

// Keep your existing state and add:
const [isAppealOpen, setIsAppealOpen] = useState(false);
const [appealFilters, setAppealFilters] = useState<Record<string, boolean>>({
  "Umpire's Call": false,
  "Stay": false,
  "Overturned": false,
  "Umpire 1":false,
  "umpire 2":false,
  
});

const u1Name = scorecard?.umpire1 || "Umpire 1";
const u2Name = scorecard?.umpire2 || "Umpire 2";

// 2. Map of internal keys vs Display names
const filterOptions = useMemo(() => ({
  "Umpire's Call": "Umpire's Call",
  "Stay": "Stay",
  "Overturned": "Overturned",
  [u1Name]: "Umpire 1", // Key is the name, Value is the mapping type
  [u2Name]: "Umpire 2"
}), [u1Name, u2Name]);

const [tempAppealFilters, setTempAppealFilters] = useState(appealFilters);

// Update temp state whenever the dropdown is opened to sync with current active filters
useEffect(() => {
  if (isAppealOpen) {
    setTempAppealFilters(appealFilters);
  }
}, [isAppealOpen, appealFilters]);

  const SCORING_API_BASE = process.env.NEXT_PUBLIC_SCORING_API_URL || "http://localhost:5500/api/v1";
const fetchAppeals = async () => {
  if (!matchData?.scoring_match_id) return;
      const innNum = activeInnings === '1st' ? 1 : 2;
  try {
    // Constructing the URL with query parameters
    const url = `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/matches/${matchData.scoring_match_id}/appeals?innings=${innNum}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
         "ngrok-skip-browser-warning": "true",
        "Content-Type": "application/json",
         
      }
    });

    if (!response.ok) {
      throw new Error(`Error fetching appeals: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Appeals Data:", data);
    return data;
    
  } catch (err) {
    console.error("Appeals Fetch Error:", err);
    return [];
  }
};
useEffect(() => {
  const getAppeals = async () => {
    if (!matchData?.scoring_match_id) return;
    
    const innNum = activeInnings === '1st' ? 1 : 2;
    const data = await fetchAppeals();
    console.log(`Appeals Data for ${activeInnings} Innings:`, data);
    setAppeals(data);
  };
  
  getAppeals();
}, [matchData, activeInnings]);
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const mRes = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/matches/${matchId}`, { credentials: 'include' });
        const associationData = await mRes.json();
        setMatchData(associationData);
        console.log("Association Data:", associationData);

        if (associationData?.scoring_match_id) {
          //const sRes = await fetch(`${SCORING_API_BASE}/matches/${associationData.scoring_match_id}/scorecard`);
          const sRes = await fetch(`${SCORING_API_BASE}/api/v1/matches/${associationData.scoring_match_id}/scorecard`, {
  headers: {
    "ngrok-skip-browser-warning": "true"
  }
});
          if (sRes.ok) {
  const scDataArray = await sRes.json();
  
  // Ensure the array is not empty before accessing index 0
  if (Array.isArray(scDataArray) && scDataArray.length > 0) {
    const scData = scDataArray[0]; 
    setScorecard(scData);
    console.log("Scorecard Data:", scData);
  } else {
    console.warn("Received empty or invalid scorecard data");
  }
}
        }
      } catch (err) {
        console.error("Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [matchId]);

  useEffect(() => {
    const fetchBalls = async () => {
      if (!matchData?.scoring_match_id) return;
      const innNum = activeInnings === '1st' ? 1 : 2;
      try {
        //const bRes = await fetch(`${SCORING_API_BASE}/matches/${matchData.scoring_match_id}/innings/${innNum}/balls`);
        const bRes = await fetch(`${SCORING_API_BASE}/api/v1/matches/${matchData.scoring_match_id}/innings/${innNum}/balls`, {
  method: 'GET', // or your required method
  headers: {
    "ngrok-skip-browser-warning": "true",
    "Content-Type": "application/json" // Include if your API requires it
  }
});
        if (bRes.ok) {
          const data = await bRes.json();
          console.log(`Balls Data for ${activeInnings} Innings:`, data);
          const balls = data.balls || [];
          const soBalls = data.superover_balls || [];
          setInningBalls(balls);
          setSuperoverBalls(soBalls);
          if (balls.length > 0) setSelectedBallData(balls[0]);
        }
      } catch (err) {
        console.error("Ball Fetch Error:", err);
      }
    };
    fetchBalls();
  }, [activeInnings, matchData]);

  // Sort batsmen by runs for Key Performers
  const topBatsmen = useMemo(() => {
  // Determine which inning data to use
  const targetInning = activeInnings === '1st' ? scorecard?.innings_1 : scorecard?.innings_2;
  
  if (!targetInning?.batsmen) return [];

  return [...targetInning.batsmen]
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 4);
}, [scorecard, activeInnings]); 


// const appealLookup = useMemo(() => {
//   const map: Record<string, Appeal> = {};

//   const appealList = appeals?.main_match_appeals || [];

//   appealList.forEach((appeal: Appeal) => {
//     const type = appeal.appeal_type?.trim();
//     const status = appeal.status?.trim() || "";

//     let key = appeal.over_number;

//     // Only append suffix if the appeal was NOT overturned
//     if (status !== "Overturned") {
//       if (type === "Wide") {
//         key += "_WD";
//       } else if (type === "No Ball") {
//         key += "_NB";
//       }
//     }

//     map[key] = {
//       ...appeal,
//       status,
//     };
//   });

//   console.log("Appeal Lookup:", map);

//   return map;
// }, [appeals]);

// Combine balls and appeals

const appealLookup = useMemo(() => {
  const map: Record<string, Appeal> = {};

  // Combine both arrays
  const appealList = [
    ...(appeals?.main_match_appeals || []),
    ...(appeals?.superover_appeals || [])
  ];

  appealList.forEach((appeal: Appeal) => {
    const type = appeal.appeal_type?.trim();
    const status = appeal.status?.trim() || "";

    // Generate Key: Use SO prefix for superovers, otherwise use over_number
    let key = appeal.innings === 1 && appeal.is_superover 
      ? `SO${appeal.superover_number}_${appeal.over_number}` 
      : appeal.over_number;

    // Only append suffix if NOT overturned
    if (status !== "Overturned") {
      if (type === "Wide") key += "_WD";
      else if (type === "No Ball") key += "_NB";
    }

    map[key] = { ...appeal, status };
  });

  return map;
}, [appeals]);


const allBalls = useMemo(() => {
  return [...inningBalls, ...superoverBalls].map(b => ({
    ...b,
    isSuperOver: !!b.superover_number // Add a flag for easy checking
  }));
}, [inningBalls, superoverBalls]);


const filteredBalls = useMemo(() => {
  const activeFilters = Object.keys(filters).filter(key => filters[key]);
  const activeAppealFilters = Object.keys(appealFilters).filter(key => appealFilters[key]);

  // Normalize search term
  const celebSearch = celebrationSearch.trim().toLowerCase();
  const playerSearch = searchTerm.trim().toLowerCase();

  return allBalls.filter(ball => {
    
    // ------------------------
    // Search Filters (Name + Celebration)
    // ------------------------
    const matchesName = !playerSearch || 
      ball.batsman_name?.toLowerCase().includes(playerSearch) || 
      ball.bowler_name?.toLowerCase().includes(playerSearch);
    
    const celebrations = Array.isArray(ball.celebrations) ? ball.celebrations : (ball.celebrations ? [ball.celebrations] : []);
    const matchesCelebration = !celebSearch || celebrations.some((c: string) => c.toLowerCase().includes(celebSearch));

    // ------------------------
    // Standard/Checkbox Filters
    // ------------------------
    const matchesStandard =
      activeFilters.length === 0 ||
      activeFilters.some(filterKey => {
        // Run Filters
        if (filterKey === "1") return ball.total_runs === 1;
        if (filterKey === "2") return ball.total_runs === 2;
        if (filterKey === "3") return ball.total_runs === 3;
        if (filterKey === "0") return ball.total_runs === 0;

        // Extra Filters (Ensure these keys match your API response properties)
        if (filterKey === "Wide") return ball.is_wide || ball.wide_runs > 0;
        if (filterKey === "No Ball") return ball.is_no_ball;
        if (filterKey === "Leg Bye") return ball.is_leg_bye;
        if (filterKey === "Bye") return ball.is_bye;
        
        // Boundaries
        if (filterKey === "Boundaries") return ball.is_boundary;

        // Logic for "Other"
        if (filterKey === "Other Length") return ball.balling_length && !LENGTHS.some(l => l.toLowerCase() === ball.balling_length.toLowerCase());
        if (filterKey === "Other Variation") return ball.balling_variation && !VARIATIONS.some(v => v.toLowerCase() === ball.balling_variation.toLowerCase());
        if (filterKey === "Other Shot") return ball.shot_type && !SHOTS.some(s => s.toLowerCase() === ball.shot_type.toLowerCase());
        if (filterKey === "Other Suspect") return ball.suspect && !SUSPECTS.some(s => s.toLowerCase() === ball.suspect.toLowerCase());

        // Default Match
        const val = filterKey.toLowerCase();
        return (
          ball.balling_length?.toLowerCase() === val ||
          ball.balling_variation?.toLowerCase() === val ||
          ball.shot_type?.toLowerCase() === val ||
          ball.fielding_type?.toLowerCase() === val ||
          ball.suspect?.toLowerCase() === val
        );
      });

    // ------------------------
    // Appeal Filters
    // ------------------------
    // (Your existing appeal logic remains here)
    const appealKey = ball.is_superover 
      ? `SO${ball.superover_number}_${ball.over_number}`
      : `${ball.over_number}${ball.is_wide ? "_WD" : ball.is_no_ball ? "_NB" : ""}`;

    let appeal = appealLookup[appealKey] || appealLookup[ball.over_number];

    const matchesAppeal =
      activeAppealFilters.length === 0 ||
      (appeal &&
        activeAppealFilters.some((filterKey) => {
          if (["Stay", "Umpire's Call", "Overturned"].includes(filterKey)) return appeal.status === filterKey;
          const u1 = scorecard?.umpire1;
          const u2 = scorecard?.umpire2;
          const currentUmpire = appeal.metadata?.umpire;
          if (filterKey === u1) return currentUmpire === u1;
          if (filterKey === u2) return currentUmpire === u2;
          return false;
        }));

    // ------------------------
    // Final Calculation
    // ------------------------
    return matchesName && matchesCelebration && matchesStandard && matchesAppeal;
  });
}, [
  inningBalls,
  filters,
  appealFilters,
  appealLookup,
  scorecard,
  celebrationSearch,
  searchTerm // Added as dependency
]);

// const filteredBalls = useMemo(() => {
//   const activeFilters = Object.keys(filters).filter(key => filters[key]);
//   const activeAppealFilters = Object.keys(appealFilters).filter(key => appealFilters[key]);

//   const search = celebrationSearch.trim().toLowerCase();

//   return allBalls.filter(ball => {
//     // ------------------------
//     // Standard Filters
//     // ------------------------
//     // ... inside filteredBalls filter loop
// const matchesStandard =
//   activeFilters.length === 0 ||
//   activeFilters.some(filterKey => {
//     if (filterKey === "Boundaries") return ball.is_boundary;

//     const val = filterKey.toLowerCase();

//     // Logic for "Other"
//     if (filterKey === "Other Length") {
//        return ball.balling_length && !LENGTHS.some(l => l.toLowerCase() === ball.balling_length.toLowerCase());
//     }
//     if (filterKey === "Other Variation") {
//        return ball.balling_variation && !VARIATIONS.some(v => v.toLowerCase() === ball.balling_variation.toLowerCase());
//     }
//     if (filterKey === "Other Shot") {
//        return ball.shot_type && !SHOTS.some(s => s.toLowerCase() === ball.shot_type.toLowerCase());
//     }
//     if (filterKey === "Other Suspect") {
//        return ball.suspect && !SUSPECTS.some(s => s.toLowerCase() === ball.suspect.toLowerCase());
//     }

//     // Default Match
//     return (
//       ball.balling_length?.toLowerCase() === val ||
//       ball.balling_variation?.toLowerCase() === val ||
//       ball.shot_type?.toLowerCase() === val ||
//       ball.fielding_type?.toLowerCase() === val ||
//       ball.suspect?.toLowerCase() === val
//     );
//   });

//     // ------------------------
//     // Appeal Filters
//     // ------------------------
    
// //     const normalKey = ball.over_number;
// // const suffixKey = `${ball.over_number}${ball.is_wide ? "_WD" : ball.is_no_ball ? "_NB" : ""}`;


// // let appeal = appealLookup[suffixKey];

// // // Fallback to normal key if no appeal found
// // if (!appeal) {
// //   appeal = appealLookup[normalKey];
// // }
// // console.log("Ball:", ball.over_number);
// // console.log("Lookup:", appealLookup[ball.over_number]);
// // console.log("All Lookup:", appealLookup);
// //     const matchesAppeal =
// //       activeAppealFilters.length === 0 ||
// //       (appeal &&
// //         activeAppealFilters.some(filterKey => {
// //           if (["Stay", "Umpire's Call", "Overturned"].includes(filterKey)) {
// //             return appeal.status === filterKey;
// //           }

// //           const u1 = scorecard?.umpire1;
// //           const u2 = scorecard?.umpire2;
// //           const currentUmpire = appeal.metadata?.umpire;

// //           if (filterKey === "Umpire 1") return currentUmpire === u1;
// //           if (filterKey === "umpire 2") return currentUmpire === u2;

// //           return false;
// //         }));

// // Inside your filteredBalls useMemo loop:
// const appealKey = ball.is_superover 
//   ? `SO${ball.superover_number}_${ball.over_number}`
//   : `${ball.over_number}${ball.is_wide ? "_WD" : ball.is_no_ball ? "_NB" : ""}`;

// // Lookup the appeal
// let appeal = appealLookup[appealKey];

// // Fallback logic (Check plain over number if specific key fails)
// if (!appeal) {
//   appeal = appealLookup[ball.over_number];
// }

// // ------------------------
// // Matches Appeal Logic
// // ------------------------
// const matchesAppeal =
//   activeAppealFilters.length === 0 ||
//   (appeal &&
//     activeAppealFilters.some((filterKey) => {
//       // 1. Status Check
//       if (["Stay", "Umpire's Call", "Overturned"].includes(filterKey)) {
//         return appeal.status === filterKey;
//       }

//       // 2. Dynamic Umpire Name Check
//       const u1 = scorecard?.umpire1;
//       const u2 = scorecard?.umpire2;
//       const currentUmpire = appeal.metadata?.umpire;

//       if (filterKey === u1) return currentUmpire === u1;
//       if (filterKey === u2) return currentUmpire === u2;

//       return false;
//     }));

//     // ------------------------
//     // Celebration Search
//     // ------------------------
//     const celebrations = Array.isArray(ball.celebrations)
//       ? ball.celebrations
//       : ball.celebrations
//       ? [ball.celebrations]
//       : [];

//     const matchesCelebration =
//       !search ||
//       celebrations.some((c: string) =>
//         c.toLowerCase().includes(search)
//       );

//     // ------------------------
//     // Final
//     // ------------------------
//     const matchesFilters =
//       activeFilters.length > 0 && activeAppealFilters.length > 0
//         ? matchesStandard && matchesAppeal
//         : activeFilters.length > 0
//         ? matchesStandard
//         : matchesAppeal;

//     return matchesFilters && matchesCelebration;
//   });
// }, [
//   inningBalls,
//   filters,
//   appealFilters,
//   appealLookup,
//   scorecard,
//   celebrationSearch,
// ]);
//   const ballTimeline = useMemo(() => {
//   const map: Record<string, any[]> = {};

//   inningBalls.forEach((ball) => {
//     const [over, ballNo] = ball.over_number.split('.').map(Number);

//     // 1.0 belongs to previous over, 2.0 belongs to previous over...
//     const overKey = ballNo === 0 ? over - 1 : over;

//     if (!map[overKey]) map[overKey] = [];
//     map[overKey].push(ball);
//   });

//   return map;
// }, [inningBalls]);
// const ballTimeline = useMemo(() => {
//   const map: Record<string, any[]> = {};
  
//   // CHANGE THIS LINE: use filteredBalls instead of inningBalls
//   filteredBalls.forEach((ball) => { 
//     const [over, ballNo] = ball.over_number.split('.').map(Number);
//     const overKey = ballNo === 0 ? over - 1 : over;

//     if (!map[overKey]) map[overKey] = [];
//     map[overKey].push(ball);
//   });

//   return map;
// }, [filteredBalls]); // Make sure to depend on filteredBalls


const ballTimeline = useMemo(() => {
  const map: Record<string, any[]> = {};
  
  filteredBalls.forEach((ball) => {
    let key;
    if (ball.isSuperOver) {
      key = `SO-${ball.superover_number}`; // e.g., "SO-1", "SO-2"
    } else {
      const [over, ballNo] = ball.over_number.split('.').map(Number);
      key = `Over ${ballNo === 0 ? over : over + 1}`;
    }

    if (!map[key]) map[key] = [];
    map[key].push(ball);
  });

  return map;
}, [filteredBalls]);
// Get all keys and sort them properly
const sortedTimelineKeys = useMemo(() => {
  return Object.keys(ballTimeline).sort((a, b) => {
    const isASO = a.startsWith("SO");
    const isBSO = b.startsWith("SO");
    
    if (isASO && !isBSO) return 1;  // Put Super Overs at the bottom
    if (!isASO && isBSO) return -1;
    
    // Sort numerically for the same category
    return parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, ''));
  });
}, [ballTimeline]);
  const filteredTimelineKeys = useMemo(() => {
  // Use the pre-sorted keys (Over 1, Over 2, SO-1...)
  const allKeys = sortedTimelineKeys;
  
  if (!searchTerm.trim()) return allKeys;

  return allKeys.filter(key => {
    // Check if the search term matches the label (e.g., "1" matches "Over 1")
    // This removes all non-digit characters to compare just the numbers
    const keyNumber = key.replace(/\D/g, ''); 
    return keyNumber.includes(searchTerm.trim());
  });
}, [sortedTimelineKeys, searchTerm]);

  const getBallDisplay = (ball: any) => {
  let label = ball.total_runs.toString();
  let bgColor = "bg-slate-200 border-slate-100 text-slate-700";
// A boundary should only be blue if it's "clean" (no extras, no wickets)
const isBoundary = (ball.is_boundary ) && 
                   !ball.is_wide && 
                   !ball.is_no_ball && 
                   !ball.is_bye && 
                   !ball.is_leg_bye && 
                   !ball.is_wicket;
  // 1. Wicket Logic (Highest Priority - Always Red)
  if (ball.is_wicket) {
    bgColor = "bg-red-200 border-red-100 text-red-600";
    
    // Construct label for wicket combinations
    let wicketLabel = "W";
    
    if (ball.is_no_ball) wicketLabel = `NB+W`;
    else if (ball.is_wide) wicketLabel = `WD+W`;
    
    // Append runs if any (e.g., W+1, NB+W+2)
    if (ball.total_runs > 0) {
      label = `${wicketLabel}+${ball.total_runs}`;
    } else {
      label = wicketLabel;
    }
  } 
  
  // 2. Boundary Logic (Blue)
  else if ( isBoundary) {
    label = ball.batsman_runs.toString();
    bgColor = "bg-blue-200 border-blue-100 text-blue-600";
  } 
  // 3. Extra Logic (Yellow)
  else if (ball.is_wide || ball.is_no_ball || ball.is_bye || ball.is_leg_bye) {
    bgColor = "bg-yellow-200 border-yellow-100 text-yellow-600";
    
    if (ball.is_no_ball) {
      label = ball.batsman_runs > 0 ? `NB+${ball.batsman_runs}` : "NB";
    } else if (ball.is_wide) {
      label = ball.total_runs > 1 ? `WD+${ball.total_runs - 1}` : "WD";
    } else if (ball.is_leg_bye) {
      label = ball.total_runs > 0 ? `LB+${ball.total_runs}` : "LB";
    } else if (ball.is_bye) {
      label = ball.total_runs > 0 ? `B+${ball.total_runs}` : "B";
    }
  }

  return { label, bgColor };
};

  const status = useMemo(() => {
    if (!matchData?.date) return { text: "N/A", color: "bg-slate-400" };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const mDate = new Date(matchData.date); mDate.setHours(0, 0, 0, 0);
    if (mDate.getTime() === today.getTime()) return { text: "LIVE", color: "bg-red-600" };
    if (mDate.getTime() > today.getTime()) return { text: "UPCOMING", color: "bg-blue-600" };
    return { text: "FINISHED", color: "bg-green-500" };
  }, [matchData]);

  const currentInningsData = activeInnings === '1st' ? scorecard?.innings_1 : scorecard?.innings_2;
  const getBallSuffix = (ball: any) => {
  if (ball?.is_wide) return "_WD";
  if (ball?.is_no_ball) return "_NB";
  return ""; // Normal ball (includes Bye/Leg Bye)
};

// 1. Add these states inside your MatchAnalysis component
const [isFilterOpen, setIsFilterOpen] = useState(false);
const [filterView, setFilterView] = useState<'main' | 'ball-type' | 'shot-type' | 'fielding'>('main');
const [openSections, setOpenSections] = useState({ ballType: false, shotType: false, fielding: false, suspect: false });

const toggleSection = (section: keyof typeof openSections) => {
  setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
};

const activeFiltersList = useMemo(() => {
  // Fix: Explicitly type the array as ActiveFilter[]
  const active: ActiveFilter[] = []; 

  // Standard Filters
  Object.entries(filters).forEach(([key, value]) => {
    if (value) active.push({ id: key, category: 'ball', label: key });
  });

  // Appeal Filters
  Object.entries(appealFilters).forEach(([key, value]) => {
    if (value) active.push({ id: key, category: 'appeal', label: key });
  });

  return active;
}, [filters, appealFilters]);

// 2. The Full Content Renderer
const renderFilterContent = () => (
  <div className="space-y-1 text-slate-900">
    {/* Basic Checkboxes */}
    {[ 'Boundaries'].map(item => (
      <label key={item} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer font-medium border border-transparent">
        <input 
          type="checkbox" 
          className="w-4 h-4 rounded border-slate-300 accent-violet-600"
          checked={!!draftFilters[item]}
          onChange={() => handleToggle(item)}
        /> 
        {item}
      </label>
    ))}

    {/* --- NEW: Scoring & Extras Section --- */}
    <div className="border-b border-slate-200 pb-2 mb-2">
      <p className="text-slate-400 font-bold uppercase text-[10px] px-2 mb-2">Runs & Extras</p>
      <div className="grid grid-cols-2 gap-2 px-2">
        {/* Runs */}
        {['1', '2', '3','0'].map(item => (
          <label key={item} className="flex items-center gap-2 text-slate-700 text-sm">
            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 accent-violet-600" checked={!!draftFilters[item]} onChange={() => handleToggle(item)}/> 
            {item}s
          </label>
        ))}
        {/* Extras */}
        {['Wide', 'No Ball', 'Leg Bye', 'Bye'].map(item => (
          <label key={item} className="flex items-center gap-2 text-slate-700 text-sm">
            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 accent-violet-600" checked={!!draftFilters[item]} onChange={() => handleToggle(item)}/> 
            {item}
          </label>
        ))}
      </div>
    </div>

    {/* --- Ball Type --- */}
    <div className="border-t border-slate-200 pt-1">
      <div className="flex justify-between p-2 hover:bg-slate-50 cursor-pointer font-bold" onClick={() => toggleSection('ballType')}>
        Ball Type {openSections.ballType ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </div>
      {openSections.ballType && (
        <div className="pl-4 pr-2 space-y-3 pb-3 text-sm">
          <p className="text-slate-400 font-bold uppercase text-[10px]">Bowling Length</p>
          <div className="grid grid-cols-2 gap-2">
  {LENGTHS.map(o => (
    <label key={o} className="flex items-center gap-2 text-slate-700">
      <input type="checkbox" className="w-4 h-4 rounded border-slate-300 accent-[#6379FC]" checked={!!draftFilters[o]} onChange={() => handleToggle(o)}/> {o}
    </label>
  ))}
  {/* Add "Other" here */}
  <label className="flex items-center gap-2 text-orange-600 font-bold">
    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 accent-orange-500" checked={!!draftFilters['Other Length']} onChange={() => handleToggle('Other Length')}/> Other
  </label>
</div>
          <p className="text-slate-400 font-bold uppercase text-[10px] pt-2">Bowling Variations</p>
          <div className="grid grid-cols-2 gap-2">
  {VARIATIONS.map(o => (
    <label key={o} className="flex items-center gap-2 text-slate-700">
      <input type="checkbox" className="w-4 h-4 rounded border-slate-300 accent-[#6379FC]" checked={!!draftFilters[o]} onChange={() => handleToggle(o)}/> {o}
    </label>
  ))}
  {/* Add "Other" here */}
  <label className="flex items-center gap-2 text-orange-600 font-bold">
    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 accent-orange-500" checked={!!draftFilters['Other Length']} onChange={() => handleToggle('Other Length')}/> Other
  </label>
</div>
        </div>
      )}
    </div>

    {/* --- Shot Type --- */}
    <div className="border-t border-slate-200 pt-1">
      <div className="flex justify-between p-2 hover:bg-slate-50 cursor-pointer font-bold" onClick={() => toggleSection('shotType')}>
        Shot Type {openSections.shotType ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </div>
      {openSections.shotType && (
        <div className="pl-4 pr-2 pb-3 text-sm grid grid-cols-2 gap-2">
          
  {SHOTS.map(o => (
    <label key={o} className="flex items-center gap-2 text-slate-700">
      <input type="checkbox" className="w-4 h-4 rounded border-slate-300 accent-[#6379FC]" checked={!!draftFilters[o]} onChange={() => handleToggle(o)}/> {o}
    </label>
  ))}
  {/* Add "Other" here */}
  <label className="flex items-center gap-2 text-orange-600 font-bold">
    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 accent-orange-500" checked={!!draftFilters['Other Length']} onChange={() => handleToggle('Other Length')}/> Other
  </label>

        </div>
      )}
    </div>

    {/* --- Fielding Area --- */}
    <div className="border-t border-slate-200 pt-1">
      <div className="flex justify-between p-2 hover:bg-slate-50 cursor-pointer font-bold" onClick={() => toggleSection('fielding')}>
        Fielding Area {openSections.fielding ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </div>
      {openSections.fielding && (
        <div className="pl-4 pr-2 pb-3 text-sm grid grid-cols-2 gap-2">
          {['Deep Cover', 'Long Off', 'Long On', 'Deep Mid Wicket', 'Deep Square Leg', 'Deep Fine Leg', 'Third Man', 'Deep Point'].map(o => (
            <label key={o} className="flex items-center gap-2 text-slate-700">
              <input type="checkbox" className="w-4 h-4 rounded border-slate-300 accent-violet-600"  checked={!!draftFilters[o]} onChange={() => handleToggle(o)}/> {o}
            </label>
          ))}
        </div>
      )}
    </div>

    {/* Footer Checkboxes */}
   {/* --- Suspect Actions --- */}
<div className="border-t border-slate-200 pt-1">
  <div className="flex justify-between p-2 hover:bg-slate-50 cursor-pointer font-bold" onClick={() => toggleSection('suspect')}>
    Suspect Actions {openSections.suspect ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
  </div>
  
  {openSections.suspect && (
    <div className="pl-4 pr-2 pb-3 text-sm grid grid-cols-2 gap-2">
      {/* 1. Map existing suspect list */}
      {["chucking", "ball_tampering", "time_wasting", "dangerous_delivery", "beamer"].map(o => (
        <label key={o} className="flex items-center gap-2 text-slate-700">
          <input 
            type="checkbox" 
            className="w-4 h-4 rounded border-slate-300 accent-violet-600" 
            checked={!!draftFilters[o]}
            onChange={() => handleToggle(o)}
          /> 
          {o.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
        </label>
      ))}

      {/* 2. Add the "Other" option */}
      <label className="flex items-center gap-2 text-orange-600 font-bold border-t border-slate-100 pt-2 col-span-2">
        <input 
          type="checkbox" 
          className="w-4 h-4 rounded border-slate-300 accent-orange-500" 
          checked={!!draftFilters['Other Suspect']}
          onChange={() => handleToggle('Other Suspect')}
        /> 
        Other
      </label>
    </div>
  )}
</div>
  </div>
);

const BASE_MOMENTS = [
  "wicket", "first_ball_wicket", "hat_trick_wicket", 
  "hat_trick_four", "super_four", "hat_trick_six", 
  "super_six", "five_wicket_haul", "team_all_out"
];
const formatLabel = (str: string) => {
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  useEffect(() => {
    setDisplayValue(formatLabel(celebrationSearch));
  }, [celebrationSearch]);
const DYNAMIC_PREFIXES = ["team_", "player_", "partnership_"];
const MILESTONES = ["50", "100", "150", "200"];

// ... inside your component
const [displayValue, setDisplayValue] = useState("");
const [showSuggestions, setShowSuggestions] = useState(false);
const dropdownRef = useRef<HTMLDivElement>(null);

// Close on outside click
useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
            setShowSuggestions(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
}, []);

const getFileSuffix = (ball: any) => {
  if (ball.is_wide) return "_wd";
  if (ball.is_noball) return "_nb";
  return "";
};
const getDisplayOutcome = (ball: any) => {
  if (!ball) return 0;

  // 1. Wicket Logic (Handle Wicket + Type + Extra/Runs)
  if (ball.is_wicket) {
    // Start with the base wicket label and type (e.g., "Wicket (Caught)")
    const typeLabel = ball.wicket_type ? ` (${ball.wicket_type})` : "";
    let wicketLabel = `Wicket${typeLabel}`;

    if (ball.is_no_ball) wicketLabel = `NB + Wicket${typeLabel}`;
    else if (ball.is_wide) wicketLabel = `WD + Wicket${typeLabel}`;
    
    // Add runs if they exist (e.g., "NB + Wicket (Caught) + 2 Runs")
    return ball.total_runs > 0 
      ? `${wicketLabel} + ${ball.total_runs} Runs` 
      : wicketLabel;
  }

  // 2. Extra Logic (Wide/No Ball + Runs)
  if (ball.is_wide) {
    return ball.total_runs > 1 
      ? `Wide + ${ball.total_runs - 1} Runs` 
      : "Wide";
  }
  
  if (ball.is_no_ball) {
    return ball.total_runs > 0 
      ? `No Ball + ${ball.total_runs} Runs` 
      : "No Ball";
  }

  // 3. Fallback for standard deliveries
  return `${ball.total_runs || 0} Runs`;
};

  if (loading) return <div className="p-10 text-center font-bold text-slate-400 italic">Loading Match Analytics...</div>;

  return (
    <div className="flex flex-col gap-6 max-w-[1400px] mx-auto">
      
      {/* --- SCOREBOARD SECTION --- */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm ">
        <div className="p-4 flex flex-col lg:flex-row items-center justify-between gap-6">
  {/* Left Section: Status & Home Team */}
  <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
    <span className={`px-2.5 py-0.5 text-[10px] md:text-[11px] font-bold text-white ${status.color} rounded-md border shrink-0`}>
      {status.text}
    </span>
    
    <div className="h-[1px] w-full sm:w-[1px] sm:h-8 bg-slate-200 hidden md:block" />
    
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-green-700 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
        {scorecard?.homeTeam?.substring(0, 2).toUpperCase() || "T1"}
      </div>
      <span className="font-bold text-slate-900 text-base md:text-lg text-center">
        {scorecard?.homeTeam?.toUpperCase() || "TEAM 1"} 
        <span className="text-slate-700 font-medium text-sm md:text-base ml-1">
          {scorecard?.innings_1?.runs}/{scorecard?.innings_1?.wickets} ({scorecard?.innings_1?.overs})
        </span>
      </span>
    </div>
  </div>

  {/* Middle Section: Result (Visible on larger screens) */}
  <div className="hidden lg:block h-8 w-[1px] bg-slate-200" />
  
  <div className="text-slate-700 font-medium text-center text-sm md:text-base w-full lg:w-auto order-first lg:order-none border-b lg:border-b-0 pb-4 lg:pb-0 border-slate-100">
    {scorecard?.result || 'Match Results will be displayed here'}
  </div>

  {/* Right Section: Away Team & Action */}
  <div className="h-8 w-[1px] bg-slate-200 hidden lg:block" />
  
  <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
    <div className="flex items-center gap-3">
      <span className="font-bold text-slate-900 text-base md:text-lg text-right">
        {scorecard?.awayTeam?.toUpperCase() || "TEAM 2"} 
        <span className="text-slate-700 font-medium text-sm md:text-base ml-1">
          {scorecard?.innings_2?.runs}/{scorecard?.innings_2?.wickets} ({scorecard?.innings_2?.overs})
        </span>
      </span>
      <div className="w-8 h-8 bg-red-700 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
        {scorecard?.awayTeam?.substring(0, 2).toUpperCase() || "T2"}
      </div>
    </div>
    
    <button 
      onClick={() => setIsViewMore(!isViewMore)} 
      className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 w-full sm:w-auto justify-center"
    >
      {isViewMore ? 'View Less' : 'View More'} 
      {isViewMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
    </button>
  </div>
</div>

        {isViewMore && (
          <div className="p-6 border-t border-slate-100 bg-white grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-top duration-300">
            <div>
              <h3 className="text-slate-900 font-bold mb-4">Innings Details</h3>
              <div className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-2xl">📈</div>
                  <div>
                    <p className="font-bold text-slate-900">Run Rate</p>
                    <p className="text-slate-400 text-xs">Current Inning</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-black">{currentInningsData?.run_rate || '0.0'}</span>
              </div>
            </div>
            <div>
              <h3 className="text-slate-900 font-bold mb-4">Quick Stats (Extras)</h3>
              <div className="flex gap-2 text-slate-900">
                {[ 
                  {l: 'Wides', v: currentInningsData?.extras?.wides || 0}, 
                  {l: 'No Balls', v: currentInningsData?.extras?.no_balls || 0}, 
                  {l: 'Total Extras', v: currentInningsData?.extras?.total || 0} 
                ].map((stat, i) => (
                  <div key={i} className="flex-1 p-3 border border-slate-100 rounded-xl text-center">
                    <p className="text-[10px] text-slate-400 mb-2 truncate">{stat.l}</p>
                    <div className="text-xs font-bold text-slate-900">{stat.v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-slate-900 font-bold mb-4">Key Performers</h3>
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {topBatsmen.length > 0 ? topBatsmen.map((player, i) => (
                  <div key={i} className="min-w-[110px] p-3 border border-slate-100 rounded-xl bg-slate-50/30">
                    <p className="text-[10px] text-slate-400 font-bold truncate uppercase">{player.name}</p>
                    <p className="font-bold text-slate-900 mt-1">{player.runs}({player.balls})</p>
                  </div>
                )) : (
                    <div className="text-slate-400 text-xs italic">No data available</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- MATCH TIMELINE SECTION --- */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-slate-50 pb-4">
          <h2 className="text-lg font-bold text-slate-900">Match Timeline</h2>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search over..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-48 md:w-64 pl-9 pr-4 py-2 text-gray-900 bg-slate-50 border border-slate-100 rounded-lg text-sm outline-none focus:ring-1 ring-blue-500" 
              />
            </div>
            <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100 w-full sm:w-auto">
              {['1st', '2nd'].map((inn) => (
                <button 
                  key={inn} 
                  onClick={() => { setActiveInnings(inn as any); setSearchTerm(""); }}
                  className={`flex-1 sm:flex-none px-4 md:px-6 py-1.5 text-xs font-bold rounded-md transition-all 
                    ${activeInnings === inn ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {inn} Innings
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="relative z-20">
{/* --- NEW FILTER ROW --- */}
<div className="">
  <div className="flex items-center gap-3 mb-6 overflow-visible pb-2 z-50">
    {/* 1. Parent wrapper handles the positioning */}
<div className="relative">
  
  {/* 2. The Button triggers the state */}
  <button 
    onClick={() => {
      setIsFilterOpen(!isFilterOpen);
      setFilterView('main');
    }}
    className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
  >
    <Volleyball className="w-4 h-4 text-slate-400" />
    Ball By Ball Tagging
    <ChevronDown className="w-4 h-4 text-slate-400" />
  </button>
</div>
  {/* 3. Dropdown is now a sibling, not a child */}
  {isFilterOpen && (
    <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-[9999]">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          {filterView !== 'main' && (
            <ChevronLeft 
              className="w-5 h-5 cursor-pointer hover:text-black" 
              onClick={(e) => { e.stopPropagation(); setFilterView('main'); }} 
            />
          )}
          <h3 className="font-bold text-slate-800">Ball By Ball Tagging</h3>
        </div>
        <X 
          className="w-4 h-4 cursor-pointer text-slate-400 hover:text-black" 
          onClick={(e) => { e.stopPropagation(); setIsFilterOpen(false); }} 
        />
      </div>
      
      <div className="max-h-[400px] overflow-y-auto pr-2" onClick={(e) => e.stopPropagation()}>
        {renderFilterContent()}
      </div>

      <div className="mt-4 pt-4 border-t flex gap-2">
  <button 
    className="flex-1 py-2 text-sm font-bold border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-900" 
    onClick={clearAllFilters}
  >
    Clear All
  </button>
  
<button 
  className="flex-1 py-2 text-sm font-bold bg-black text-white rounded-lg hover:bg-slate-800" 
  onClick={(e) => { 
    e.stopPropagation(); 
    setFilters(draftFilters); // Save the current selection as the active filter
    setIsFilterOpen(false); 
  }}
>
  Apply
</button>



</div>
    </div>
  )}

    <div className="relative">
  {/* 1. The Trigger Button */}
  <button 
    onClick={() => setIsAppealOpen(!isAppealOpen)}
    className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
  >
    <UserCheck className="w-4 h-4 text-slate-400" />
    Appeals Tagging
    <ChevronDown className="w-4 h-4 text-slate-400" />
  </button>

  {/* 2. The Dropdown (Sibling to button, NOT inside a constrained container) */}
  {isAppealOpen && (
    <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-[9999]">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-slate-400" />
          <h3 className="font-bold text-slate-800">Appeal Tagging</h3>
        </div>
        {/* X Close Button */}
        <button 
          onClick={(e) => { e.stopPropagation(); setIsAppealOpen(false); }}
          className="text-slate-400 hover:text-black transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
     <div className="space-y-1">
  {Object.keys(filterOptions).map((displayName) => (
    <label key={displayName} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer font-medium border border-transparent text-slate-900">
      <input 
        type="checkbox" 
        className="w-4 h-4 rounded border-slate-300 accent-violet-600"
        checked={!!tempAppealFilters[displayName]}
        onChange={() => setTempAppealFilters(prev => ({ 
          ...prev, 
          [displayName]: !prev[displayName] 
        }))}
      /> 
      {displayName}
    </label>
  ))}
</div>

      <div className="mt-4 pt-4 border-t flex gap-2">
      <button 
        className="flex-1 py-2 text-sm font-bold border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-900" 
        onClick={() => setTempAppealFilters(prev => Object.keys(prev).reduce((acc, k) => ({...acc, [k]: false}), {}))}
      >
        Clear All
      </button>
      <button 
        className="flex-1 py-2 text-sm font-bold bg-black text-white rounded-lg hover:bg-slate-800" 
        onClick={() => {
          setAppealFilters(tempAppealFilters);
          setIsAppealOpen(false);
        }}
      >
        Apply
      </button>
    </div>
    </div>
  )}
</div>
<div className="relative w-64" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
        <input
          type="text"
          placeholder="Search Key Moments..."
          value={displayValue}
          onChange={(e) => {
            // Convert user input "Team 50" -> "team_50" for internal state
            const rawValue = e.target.value.toLowerCase().replace(/ /g, '_');
            setCelebrationSearch(rawValue);
            setDisplayValue(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 ring-blue-500 text-gray-900"
        />
      </div>

      {showSuggestions && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl p-3 max-h-80 overflow-y-auto">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Key Moments</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {BASE_MOMENTS.filter(m => m.includes(celebrationSearch.toLowerCase())).map((m) => (
              <button 
                key={m} 
                onClick={() => { setCelebrationSearch(m); setShowSuggestions(false); }}
                className="px-2 py-1 bg-slate-100 hover:bg-blue-100 text-slate-700 text-[10px] font-bold rounded-md border border-slate-200 transition-colors"
              >
                {formatLabel(m)}
              </button>
            ))}
          </div>

          <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Milestones</p>
          <div className="space-y-3">
            {DYNAMIC_PREFIXES.map(prefix => (
              <div key={prefix} className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 w-20 uppercase">
                  {prefix.replace('_', '')}
                </span>
                <div className="flex gap-1 flex-wrap">
                  {MILESTONES.map(m => (
                    <button 
                      key={m} 
                      onClick={() => { setCelebrationSearch(`${prefix}${m}`); setShowSuggestions(false); }}
                      className="px-2 py-1 bg-orange-50 hover:bg-orange-100 text-orange-600 text-[10px] font-bold rounded border border-orange-200 transition-colors"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    <button 
  onClick={() => {
    // Clear Standard
    const cleared = Object.keys(filters).reduce((acc, k) => ({...acc, [k]: false}), {});
    setFilters(cleared);
    setDraftFilters(cleared);
    // Clear Appeals
    const clearedAppeals = Object.keys(appealFilters).reduce((acc, k) => ({...acc, [k]: false}), {});
    setAppealFilters(clearedAppeals);
    setTempAppealFilters(clearedAppeals);
  }}
  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg"
>
  <RefreshCwIcon className="w-4 h-4 text-slate-700" />
  Reset
</button>
    <div className="flex flex-row items-center gap-2 border border-slate-200 rounded-lg px-3 py-1.5 overflow-hidden">
  <span className="text-sm font-bold text-slate-900 whitespace-nowrap">Active Filter -</span>
  
  {/* Scrollable Container */}
  <div className="flex gap-2 overflow-x-auto no-scrollbar max-w-full">
    {activeFiltersList.length > 0 ? (
      activeFiltersList.map((filter) => (
        <div 
          key={filter.id} 
          className="flex items-center gap-1 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 text-xs text-slate-700 shadow-sm whitespace-nowrap"
        >
          {filter.label}
          <button 
            onClick={() => {
              // Remove filter based on category
              if (filter.category === 'ball') {
                setFilters(prev => ({ ...prev, [filter.id]: false }));
                setDraftFilters(prev => ({ ...prev, [filter.id]: false })); // Sync if needed
              } else {
                setAppealFilters(prev => ({ ...prev, [filter.id]: false }));
              }
            }}
            className="hover:text-red-500 font-bold ml-1"
          >
            ×
          </button>
        </div>
      ))
    ) : (
      <span className="text-xs text-slate-400 italic">None</span>
    )}
  </div>
</div>
  </div>
  </div>
  </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 ">
         <div className="lg:col-span-2 space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
  {filteredTimelineKeys.length > 0 ? filteredTimelineKeys.map((key) => (
    <div key={key} className="flex items-center gap-6 p-3 border border-slate-50 rounded-xl hover:bg-slate-50/50 transition-colors">
      <span className="font-bold text-slate-900 min-w-[70px]">{key}</span>
      <div className="h-6 w-[1px] bg-slate-200" />
      <div className="flex p-2 gap-4 overflow-x-auto no-scrollbar">
        {ballTimeline[key].sort((a, b) => a.id - b.id).map((ball) => {
          const { label, bgColor } = getBallDisplay(ball);
          const isSelected = selectedBallData?.id === ball.id;
          
          return (
            <button 
              key={ball.id} 
              onClick={() => setSelectedBallData(ball)}
              className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-[12px] font-bold border-2 transition-all 
              ${isSelected ? 'ring-2 ring-offset-2 ring-green-400' : ''} ${bgColor}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  )) : (
    <div className="py-20 text-center text-slate-400 font-medium italic">
      {searchTerm ? `No results for "${searchTerm}"` : "No data available."}
    </div>
  )}
</div>
           
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-slate-100 p-5 sticky top-4 shadow-xs">
              <h3 className="font-bold text-slate-900 mb-6">Ball Details</h3>
              <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
               <div>
  <p className="text-md text-slate-600 mb-1">
    {selectedBallData?.isSuperOver ? "Super Over Ball" : "Ball No."} 
    <span className="text-lg font-semibold text-slate-900">
      {selectedBallData?.isSuperOver 
        ? ` - SO${selectedBallData?.superover_number || '1'} (${selectedBallData?.over_number})` 
        : ` - ${selectedBallData?.over_number || '0.1'}`
      }
    </span>
  </p>
</div>
                <div className="h-10 w-[1px] bg-slate-100" />
                <div className="text-right">
                    <p className="text-md text-slate-600 mb-1">Outcome <span className="text-lg font-semibold text-slate-900">- {selectedBallData?.total_runs || 0} Runs</span></p>
                </div>
              </div>
              <div className="flex items-center justify-between bg-slate-50/50 p-4 rounded-xl mb-6 border-b border-gray-100">
                <div className="text-center">
                    <p className="text-[10px] text-slate-600 uppercase font-bold mb-1">Batsman</p>
                    <p className="font-bold text-slate-900">{selectedBallData?.batsman_name || 'N/A'}</p>
                </div>
                <span className="text-slate-600 font-bold italic">VS</span>
                <div className="text-center">
                    <p className="text-[10px] text-slate-600 uppercase font-bold mb-1">Bowler</p>
                    <p className="font-bold text-slate-900">{selectedBallData?.bowler_name || 'N/A'}</p>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  { l: 'Wicket', v: selectedBallData?.is_wicket ? `Yes (${selectedBallData.wicket_type})` : 'No' },
                  { l: 'Extra Runs', v: selectedBallData?.extra_runs || 0 },
                  { l: 'Is Wide', v: selectedBallData?.is_wide ? 'Yes' : 'No' },
                  { l: 'Is No Ball', v: selectedBallData?.is_no_ball ? 'Yes' : 'No' },
                  { l: 'Is Bye', v: selectedBallData?.is_bye ? 'Yes' : 'No' },
                  { l: 'Is Leg Bye', v: selectedBallData?.is_leg_bye ? 'Yes' : 'No' }
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 font-medium">{item.l}</span>
                    <span className={`text-sm font-bold ${item.l === 'Wicket' && selectedBallData?.is_wicket ? 'text-red-600' : 'text-slate-900'}`}>{item.v}</span>
                  </div>
                ))}
              </div>
              
{/* <Link 
  href={`/admin/analytics/${matchId}?ball=${selectedBallData?.over_number}${getBallSuffix(selectedBallData)}&inning=${activeInnings}&batsman=${encodeURIComponent(selectedBallData?.batsman_name)}&bowler=${encodeURIComponent(selectedBallData?.bowler_name)}&outcome=${selectedBallData?.total_runs}`}
>
  <button className="w-full mt-8 py-3 bg-[#0F1117] text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-100">
    Analyse Ball 
  </button>
</Link> */}


<Link 
  href={`/admin/analytics/${matchId}?ball=${selectedBallData?.over_number}&inning=${activeInnings}&isSuperOver=${!!selectedBallData?.isSuperOver}&soNumber=${selectedBallData?.superover_number || '1'}&isWide=${!!selectedBallData?.is_wide}&isNoBall=${!!selectedBallData?.is_noball}&batsman=${encodeURIComponent(selectedBallData?.batsman_name || 'N/A')}&bowler=${encodeURIComponent(selectedBallData?.bowler_name || 'N/A')}&outcome=${encodeURIComponent(getDisplayOutcome(selectedBallData))}`}
>
  <button className="w-full mt-8 py-3 bg-[#0F1117] text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-100">
    Analyse Ball 
  </button>
</Link>


            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatchAnalysis;






// "use client";

// import React, { useState } from 'react';
// import { Search, ChevronDown, ChevronUp } from 'lucide-react';
// import Link from 'next/link';

// interface MatchAnalysisProps {
//   matchId: string;
// }

// const MatchAnalysis: React.FC<MatchAnalysisProps> = ({ matchId }) => {
//   const [isViewMore, setIsViewMore] = useState(false);
//   const [activeInnings, setActiveInnings] = useState<'1st' | '2nd'>('1st');

//   return (
//     <div className="flex flex-col gap-6 max-w-[1400px] mx-auto">
      
//       {/* --- SCOREBOARD SECTION --- */}
//       <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
//         <div className="p-4 flex items-center justify-between flex-wrap gap-4">
//           <div className="flex items-center gap-4">
//             <span className="bg-[#D11B1B] text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Live</span>
//             <div className="h-8 w-[1px] bg-slate-200 hidden md:block" />
//             <div className="flex items-center gap-3">
//               <div className="w-8 h-8 bg-green-700 rounded-full flex items-center justify-center text-white text-xs font-bold">SA</div>
//               <span className="font-bold text-slate-900 text-lg">SA - <span className="text-slate-500 font-medium text-base">225/9 (20 ov)</span></span>
//             </div>
//           </div>

//           <div className="h-8 w-[1px] bg-slate-200 hidden lg:block" />
          
//           <div className="text-slate-500 font-medium text-center">
//             South Africa Defeated England By 4 Wickets
//           </div>

//           <div className="h-8 w-[1px] bg-slate-200 hidden lg:block" />

//           <div className="flex items-center gap-4">
//             <div className="flex items-center gap-3">
//               <span className="font-bold text-slate-900 text-lg">ENG - <span className="text-slate-500 font-medium text-base">225/9 (20 ov)</span></span>
//               <div className="w-8 h-8 bg-red-700 rounded-full flex items-center justify-center text-white text-xs font-bold">ENG</div>
//             </div>
//             <button 
//               onClick={() => setIsViewMore(!isViewMore)}
//               className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
//             >
//               {isViewMore ? 'View Less' : 'View More'} {isViewMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
//             </button>
//           </div>
//         </div>

//         {/* View More Content */}
//         {isViewMore && (
//           <div className="p-6 border-t border-slate-100 bg-white grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-top duration-300">
//             {/* Man of Match */}
//             <div>
//               <h3 className="text-slate-900 font-bold mb-4">Man Of Match</h3>
//               <div className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl">
//                 <div className="flex items-center gap-3">
//                   <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-2xl">👤</div>
//                   <div>
//                     <p className="font-bold text-slate-900">J. Bumrah</p>
//                     <p className="text-slate-400 text-xs">Bowler</p>
//                   </div>
//                 </div>
//                 <span className="text-xl font-bold text-black">32/5</span>
//               </div>
//             </div>

//             {/* Quick Stats */}
//             <div>
//               <h3 className="text-slate-900 font-bold mb-4">Quick Stats</h3>
//               <div className="flex gap-2 text-slate-900">
//                 {[ {l: 'Total Six(6)', v1: 17, v2: 17}, {l: 'Total Four(4)', v1: 17, v2: 17}, {l: 'Extras', v1: 10, v2: 15} ].map((stat, i) => (
//                   <div key={i} className="flex-1 p-3 border border-slate-100 rounded-xl text-center">
//                     <p className="text-[10px] text-slate-400 mb-2 truncate">{stat.l}</p>
//                     <div className="flex justify-around text-xs font-bold">
//                       <div><p className="text-[10px] text-slate-400 uppercase">MI</p>{stat.v1}</div>
//                       <div><p className="text-[10px] text-slate-400 uppercase">CSK</p>{stat.v2}</div>
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             </div>

//             {/* Key Performers */}
//             <div>
//               <h3 className="text-slate-900 font-bold mb-4">Key Performers</h3>
//               <div className="flex gap-2 overflow-x-auto pb-2 ">
//                 {['68(45)', '23/2', '68(45)', '32/5'].map((score, i) => (
//                   <div key={i} className="min-w-[100px] p-3 border border-slate-100 rounded-xl">
//                     <p className="text-[10px] text-slate-400">Player Name</p>
//                     <p className="font-bold text-slate-900 mt-1">{score}</p>
//                   </div>
//                 ))}
//               </div>
//             </div>
//           </div>
//         )}
//       </div>

//       {/* --- TIMELINE SECTION --- */}
// {/* --- MATCH TIMELINE SECTION --- */}
// <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
  
//   {/* 1. Full Width Header Section */}
//   <div className="flex flex-wrap items-center justify-between mb-6 gap-4 border-b border-slate-50 pb-4">
//     <h2 className="text-lg font-bold text-slate-900">Match Timeline</h2>
//     <div className="flex items-center gap-4">
//       {/* Search Bar */}
//       <div className="relative">
//         <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
//         <input 
//           type="text" 
//           placeholder="Search here" 
//           className="pl-9 pr-4 py-2 text-gray-400 bg-slate-50 border border-slate-100 rounded-lg text-sm outline-none focus:ring-1 ring-blue-500 w-48 md:w-64" 
//         />
//       </div>
      
//       {/* Innings Tabs */}
//       <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100">
//         <button 
//           onClick={() => setActiveInnings('1st')}
//           className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeInnings === '1st' ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-500'}`}
//         >
//           1st Innings
//         </button>
//         <button 
//           onClick={() => setActiveInnings('2nd')}
//           className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeInnings === '2nd' ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-500'}`}
//         >
//           2nd Innings
//         </button>
//       </div>
//     </div>
//   </div>

//   {/* 2. Content Section: Divided into 2 Columns */}
//   <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
    
//     {/* Left Column: Over List (lg:col-span-2) */}
//     <div className="lg:col-span-2 space-y-3">
//       {[12, 11, 10, 9, 8, 7, 6, 5].map((over) => (
//         <div key={over} className="flex items-center gap-6 p-3 border border-slate-50 rounded-xl hover:bg-slate-50/50 transition-colors">
//           <span className="font-bold text-slate-900 min-w-[60px]">Over {over}</span>
//           <div className="h-6 w-[1px] bg-slate-200" />
//           <div className="flex gap-4 overflow-x-auto no-scrollbar">
//             {['0', '0', '6', 'W', '4', '6', '1'].map((ball, i) => (
//               <div 
//                 key={i} 
//                 className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border-2 transition-all cursor-pointer hover:scale-110
//                 ${ball === '6' ? 'bg-blue-200 border-blue-50 text-blue-600' : 
//                   ball === 'W' ? 'bg-slate-50 border-slate-200 text-slate-500' : 
//                   'bg-white border-slate-100 text-slate-500'}`}
//               >
//                 {ball}
//               </div>
//             ))}
//           </div>
//         </div>
//       ))}
//     </div>

//     {/* Right Column: Ball Details (lg:col-span-1) */}
//     <div className="lg:col-span-1">
//       <div className="bg-white rounded-xl border border-slate-100 p-5">
//         <h3 className="font-bold text-slate-900 mb-6">Ball Details</h3>
        
//         <div className="flex justify-between items-center mb-8 border-b border-gray-100">
//           <div>
//             <p className="text-md text-slate-400 mb-1">Ball No. <span className="text-lg font-semibold text-slate-900">- 12.3</span></p>
            
//           </div>
//           <div className="h-10 w-[1px] bg-slate-100" />
//           <div className="text-right">
//             <p className="text-md text-slate-400 mb-1">Outcome <span className="text-lg font-semibold text-slate-900">- 6 Runs</span></p>
            
//           </div>
//         </div>

//         <div className="flex items-center justify-between bg-slate-50/50 p-4 rounded-xl mb-6 border-b border-gray-100">
//           <div className="text-center">
//             <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Batsman</p>
//             <p className="font-bold text-slate-900">R. Sharma</p>
//           </div>
//           <span className="text-slate-300 font-bold italic">VS</span>
//           <div className="text-center">
//             <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Bowler</p>
//             <p className="font-bold text-slate-900">M. Starc</p>
//           </div>
//         </div>

//         <div className="space-y-4  ">
//           {[
//             { l: 'Delivery Speed', v: '145.2 Km/h' },
//             { l: 'Length', v: 'Good Length' },
//             { l: 'Line', v: 'Outside Off' },
//             { l: 'Short Type', v: 'Square Cut' }
//           ].map((item, i) => (
//             <div key={i} className="flex justify-between items-center">
//               <span className="text-sm text-slate-400 font-medium">{item.l}</span>
//               <span className="text-sm text-slate-900 font-bold">{item.v}</span>
//             </div>
//           ))}
//         </div>
// <Link href={"/admin/analytics/{matchId}"}>
//         <button className="w-full mt-8 py-3 bg-[#0F1117] text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-all active:scale-95">
//           Analyse Ball
//         </button>
//         </Link>
//       </div>
//     </div>

//   </div>
// </div>
//     </div>
//   );
// };

// export default MatchAnalysis;

