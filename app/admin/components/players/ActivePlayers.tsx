"use client"
import React, { useState, useEffect } from 'react'
import { Users, Shield, RefreshCw, UserPlus } from 'lucide-react'
import StatusModal from '@/app/components/auth/StatusModal'
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input'
import 'react-phone-number-input/style.css'

type ActiveModal = "season" | "guest" | "transfer" | "register" | null;

interface Player {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  district?: { name: string } | string;
  club?: { name: string } | string;
  registrations?: {
  type: string;
}[];
}

interface Season {
  id: string;
  name?: string;
  year?: number;
  isActive?: boolean;
}

interface Club {
  id: string;
  name: string;
}

interface District {
  id: string;
  name: string;
  clubs?: Club[];
}

interface DashboardStats {
  totalPlayers: number;
  primary: number;
  renewal: number;
  guest: number;
}

interface SuccessInfo {
  title: string;
  message: string;
}

const initialRegisterForm = {
  firstName: '',
  lastName: '',
  email: '',
  dob: '',
  mobile: '',
  seasonId: '',
  homeDistrictId: '',
  homeClubId: '',
};

const ActivePlayers = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // API Data States
  const [playersData, setPlayersData] = useState<Player[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [activeSeasons, setActiveSeasons] = useState<Season[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({ totalPlayers: 0, primary: 0, renewal: 0, guest: 0 });
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);

  // Form States for Modals
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [selectedClub, setSelectedClub] = useState<string>("");
  const [guestDistrict, setGuestDistrict] = useState<string>("");
  const [transferReason, setTransferReason] = useState<string>("");

  // Register Player form state
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  // Dropdown UI toggles
  const [playerDropdownOpen, setPlayerDropdownOpen] = useState(false);
  const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);
  const [clubDropdownOpen, setClubDropdownOpen] = useState(false);
  const [districtDropdownOpen, setDistrictDropdownOpen] = useState(false);
  // Register modal has its own District/Club dropdowns (District selection here
  // drives which clubs load, same as the Guest Player modal's district field).
  const [registerDistrictDropdownOpen, setRegisterDistrictDropdownOpen] = useState(false);
  const [registerClubDropdownOpen, setRegisterClubDropdownOpen] = useState(false);
  const [registerSeasonDropdownOpen, setRegisterSeasonDropdownOpen] = useState(false);
  const [registerClubs, setRegisterClubs] = useState<Club[]>([]);

  // Fetch players and seasons on mount
  useEffect(() => {
    fetchPlayers();
    fetchAllPlayersForModal();
    fetchSeasons();
    fetchDistricts();
    fetchClubs();
  }, [currentPage]);

  const fetchPlayers = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/players?page=${currentPage}&limit=7`,
      {
        headers: {
          "ngrok-skip-browser-warning": "true"
        }
      });
      const data = await res.json();
      const resolvedList = data?.data || data?.items || data;
      if (Array.isArray(resolvedList)) {
        setPlayersData(resolvedList);
      }
    } catch (error) {
      console.error("Failed to fetch players", error);
    }
  };

  const fetchAllPlayersForModal = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/players?limit=1000`,
      {
        headers: {
          "ngrok-skip-browser-warning": "true"
        }
      });
      const data = await res.json();
      const resolvedList = data?.data || data?.items || data;
      if (Array.isArray(resolvedList)) {
        setAllPlayers(resolvedList);
      }
    } catch (error) {
      console.error("Failed to fetch all players", error);
    }
  };

  const fetchSeasons = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/seasons`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      const data = await res.json();
      const resolvedList = data?.data || data;
      if (Array.isArray(resolvedList)) {
        const filteredActive = resolvedList.filter((s: Season) => s.isActive);
        setActiveSeasons(filteredActive);
        if (filteredActive.length > 0) {
          setSelectedSeason(filteredActive[0].id);
          setRegisterForm((prev) => ({ ...prev, seasonId: filteredActive[0].id }));
          fetchDashboardStats(filteredActive[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to fetch seasons", error);
    }
  };

  // Dashboard stats — total/local/renewal/guest counts for the active season.
  const fetchDashboardStats = async (seasonId: string) => {
    if (!seasonId) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/dashboard/${seasonId}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      if (res.ok) {
        const data = await res.json();
        setDashboardStats({
          totalPlayers: data?.totalPlayers ?? 0,
          primary: data?.seasonRegistrations?.primary ?? 0,
          renewal: data?.seasonRegistrations?.renewal ?? 0,
          guest: data?.seasonRegistrations?.guest ?? 0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch dashboard stats", error);
    }
  };

  const refreshAfterAction = () => {
    fetchPlayers();
    fetchAllPlayersForModal();
    if (activeSeasons[0]?.id) fetchDashboardStats(activeSeasons[0].id);
  };

  const fetchDistricts = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/districts`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      const data = await res.json();
      const resolvedList = data?.data || data;
      if (Array.isArray(resolvedList)) setDistricts(resolvedList);
    } catch (error) {
      console.error("Failed to fetch districts", error);
    }
  };

  const fetchClubs = async (districtId?: string) => {
    try {
      const url = districtId
        ? `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/clubs?districtId=${districtId}`
        : `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/clubs`;
      const res = await fetch(url, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      const data = await res.json();
      const resolvedList = data?.data || data;
      if (Array.isArray(resolvedList)) setClubs(resolvedList);
    } catch (error) {
      console.error("Failed to fetch clubs", error);
    }
  };

  const fetchRegisterClubs = async (districtId: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/clubs?districtId=${districtId}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      const data = await res.json();
      const resolvedList = data?.data || data;
      setRegisterClubs(Array.isArray(resolvedList) ? resolvedList : []);
    } catch (error) {
      console.error("Failed to fetch clubs for registration", error);
      setRegisterClubs([]);
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedPlayer(null);
    if (activeSeasons.length > 0) {
      setSelectedSeason(activeSeasons[0].id);
    } else {
      setSelectedSeason("");
    }
    setSelectedClub("");
    setGuestDistrict("");
    setTransferReason("");
    setPlayerDropdownOpen(false);
    setSeasonDropdownOpen(false);
    setClubDropdownOpen(false);
    setDistrictDropdownOpen(false);
    setRegisterForm({ ...initialRegisterForm, seasonId: activeSeasons[0]?.id || '' });
    setRegisterErrors({});
    setRegisterClubs([]);
    setRegisterDistrictDropdownOpen(false);
    setRegisterClubDropdownOpen(false);
    setRegisterSeasonDropdownOpen(false);
  };

  const handleSeasonRenewalSubmit = async () => {
    if (!selectedPlayer || !selectedSeason) return;
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/register/renewal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          seasonId: selectedSeason,
        }),
      });
      if (res.ok) {
        closeModal();
        refreshAfterAction();
        setSuccessInfo({ title: 'Season Renewed', message: "Player's Season Has been Renewed Successfully" });
      }
    } catch (error) {
      console.error("Renewal failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestPlayerSubmit = async () => {
    if (!selectedPlayer || !selectedSeason || !selectedClub || !guestDistrict) return;
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/register/guest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          guestDistrictId: guestDistrict,
          guestClubId: selectedClub,
          seasonId: selectedSeason,
        }),
      });
      if (res.ok) {
        closeModal();
        refreshAfterAction();
        setSuccessInfo({ title: 'Guest Player Added', message: 'Player Has been Registered as a Guest Player' });
      }
    } catch (error) {
      console.error("Guest registration failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTransferSubmit = async () => {
    if (!selectedPlayer || !selectedClub || !selectedSeason) return;
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/transfers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          toClubId: selectedClub,
          seasonId: selectedSeason,
        }),
      });
      if (res.ok) {
        closeModal();
        refreshAfterAction();
        setSuccessInfo({ title: 'Player Transferred', message: 'Player Has been Transferred to the New Club' });
      }
    } catch (error) {
      console.error("Transfer failed", error);
    } finally {
      setLoading(false);
    }
  };

  const validateRegisterForm = () => {
    const newErrors: Record<string, string> = {};
    if (!registerForm.firstName.trim()) newErrors.firstName = 'Required';
    if (!registerForm.lastName.trim()) newErrors.lastName = 'Required';
    if (!registerForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email)) {
      newErrors.email = 'Valid email required';
    }
    if (!registerForm.dob) newErrors.dob = 'Required';
    if (!registerForm.mobile || !isValidPhoneNumber(registerForm.mobile)) newErrors.mobile = 'Invalid mobile number';
    if (!registerForm.seasonId) newErrors.seasonId = 'Select a season';
    if (!registerForm.homeDistrictId) newErrors.homeDistrictId = 'Required';
    if (!registerForm.homeClubId) newErrors.homeClubId = 'Required';
    setRegisterErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegisterSubmit = async () => {
    if (!validateRegisterForm()) return;
    setRegisterSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/kca/register/first-time`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          firstName: registerForm.firstName.trim(),
          lastName: registerForm.lastName.trim(),
          email: registerForm.email.trim(),
          dateOfBirth: registerForm.dob,
          phone: registerForm.mobile.trim(),
          seasonId: registerForm.seasonId,
          homeDistrictId: registerForm.homeDistrictId,
          homeClubId: registerForm.homeClubId,
        }),
      });
      if (res.ok) {
        closeModal();
        refreshAfterAction();
        setSuccessInfo({ title: 'Player Registered', message: 'New Player Has been Registered Successfully' });
      } else {
        const errData = await res.json().catch(() => null);
        setRegisterErrors({ submit: errData?.message || errData?.error || 'Registration failed' });
      }
    } catch (error) {
      console.error("Registration failed", error);
      setRegisterErrors({ submit: 'Network error. Registration failed' });
    } finally {
      setRegisterSubmitting(false);
    }
  };

  const guestPercent = dashboardStats.totalPlayers > 0
    ? Math.round((dashboardStats.guest / dashboardStats.totalPlayers) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 font-sans text-gray-900 relative">
      {/* Header + Register Player button */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Players</h1>
        <button
          onClick={() => setActiveModal('register')}
          className="flex items-center gap-2 bg-[#0F1117] text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-800 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Register Player
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-2">Total Players</p>
            <p className="text-3xl font-bold text-gray-900">{dashboardStats.totalPlayers}</p>
          </div>
          <div className="w-11 h-11 rounded-full bg-[#F0F5FF] flex items-center justify-center">
            <Users className="w-5 h-5 text-[#4B70C3]" />
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-2">Local Players</p>
            <p className="text-3xl font-bold text-gray-900">{dashboardStats.primary}</p>
          </div>
          <div className="w-11 h-11 rounded-full bg-[#F0F5FF] flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#4B70C3]" />
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-2">Season Renewals</p>
            <p className="text-3xl font-bold text-gray-900">{String(dashboardStats.renewal).padStart(2, '0')}</p>
          </div>
          <div className="w-11 h-11 rounded-full bg-[#F0F5FF] flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-[#4B70C3]" />
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-2">Guest Player</p>
            <p className="text-3xl font-bold text-gray-900">{guestPercent}%</p>
          </div>
          <div className="w-11 h-11 rounded-full bg-[#F0F5FF] flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-[#4B70C3]" />
          </div>
        </div>
      </div>

      {/* Main Container Card */}
      <div className="bg-white border border-gray-100 rounded-3xl shadow-sm p-6 md:p-8">

        {/* Header Title */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">Recent Registration</h1>
          <span className="text-sm font-semibold text-[#4B70C3] cursor-pointer hover:underline">View all</span>
        </div>

        {/* Table wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-[#FAFBFF]">
                <th className="py-4 px-6 text-[13px] font-bold text-gray-700 uppercase tracking-wider">Player</th>
                <th className="py-4 px-6 text-[13px] font-bold text-gray-700 uppercase tracking-wider">Home District</th>
                <th className="py-4 px-6 text-[13px] font-bold text-gray-700 uppercase tracking-wider">Club</th>
                <th className="py-4 px-6 text-[13px] font-bold text-gray-700 uppercase tracking-wider">Registration</th>
                <th className="py-4 px-6 text-[13px] font-bold text-gray-700 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {playersData.map((player, index) => {
                const fullName = player.firstName && player.lastName
                  ? `${player.firstName} ${player.lastName}`
                  : (player.name || "Rahul Sharma");
                const districtName = typeof player.district === 'object' ? player.district?.name : (player.district || "Mysore");
                const clubName = typeof player.club === 'object' ? player.club?.name : (player.club || "Chamundi Hills CC");

                return (
                  <tr key={player.id || index} className="hover:bg-gray-50/50 transition-colors">
                    {/* Player info column */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3.5">

                        <div>
                          <div className="font-bold text-sm text-gray-900">{fullName}</div>
                          <div className="text-sm text-gray-500">{player.email || "rahul@gmail.com"}</div>
                        </div>
                      </div>
                    </td>

                    {/* District column */}
                    <td className="py-4 px-6 text-sm font-medium text-gray-700">
                      {districtName}
                    </td>

                    {/* Club column */}
                    <td className="py-4 px-6 text-sm font-medium text-gray-700">
                      {clubName}
                    </td>

                    {/* Registration type column */}
                    <td className="py-4 px-6 text-sm font-medium text-gray-700">
                      {
    player.registrations?.length
      ? player.registrations
          .map(r => r.type.charAt(0) + r.type.slice(1).toLowerCase())
          .join(' / ')
      : 'Primary'
  }
                    </td>

                    {/* Actions column */}
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-3 text-xs font-semibold">
                        <button
                          onClick={() => {
                            if (activeSeasons.length > 0) setSelectedSeason(activeSeasons[0].id);
                            setActiveModal('season');
                          }}
                          className="text-[#4B70C3] hover:underline"
                        >
                          Season Renewal
                        </button>
                        <span className="text-gray-200">|</span>
                        <button
                          onClick={() => {
                            if (activeSeasons.length > 0) setSelectedSeason(activeSeasons[0].id);
                            setActiveModal('guest');
                          }}
                          className="text-[#4B70C3] hover:underline"
                        >
                          Make Guest Player
                        </button>
                        <span className="text-gray-200">|</span>
                        <button
                          onClick={() => {
                            if (activeSeasons.length > 0) setSelectedSeason(activeSeasons[0].id);
                            setActiveModal('transfer');
                          }}
                          className="text-[#4B70C3] hover:underline"
                        >
                          Inter Club Transfer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Section */}
        <div className="flex items-center justify-center gap-2 pt-8 pb-2">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            className="px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-400 hover:bg-gray-50 transition-colors"
          >
            ‹ Back
          </button>

          {[1, 2, 3, 4, 5].map((num) => (
            <button
              key={num}
              onClick={() => setCurrentPage(num)}
              className={`w-9 h-9 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center ${
                currentPage === num
                  ? 'bg-black text-white shadow-sm'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {num}
            </button>
          ))}

          <button
            onClick={() => setCurrentPage(prev => prev + 1)}
            className="px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Next ›
          </button>
        </div>

      </div>

      {/* ================= MODALS ================= */}

      {/* 1. Season Renewal Modal */}
      {activeModal === 'season' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-[480px] rounded-3xl p-8 relative text-center shadow-xl">

            <button onClick={closeModal} className="absolute top-6 right-6 text-gray-400 hover:text-gray-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <div className="w-[60px] h-[60px] bg-[#F0F5FF] rounded-full flex items-center justify-center mx-auto mb-3">
              <img src="/Logo.png" alt="Logo" className="w-[30px] h-[30px] object-contain" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Season Renewal</h2>

            <div className="space-y-4 text-left mb-6">
              <div className="relative">
                <label className="block text-xs font-bold text-gray-900 mb-2">Player</label>
                <div
                  onClick={() => setPlayerDropdownOpen(!playerDropdownOpen)}
                  className="w-full p-4 bg-[#FAFBFF] border border-[#E5F0FF] rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer"
                >
                  <span>{selectedPlayer ? (selectedPlayer.firstName ? `${selectedPlayer.firstName} ${selectedPlayer.lastName}` : (selectedPlayer.name || selectedPlayer.email || selectedPlayer.id)) : "Select Player"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {playerDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {(allPlayers.length > 0 ? allPlayers : playersData).map((p) => (
                      <div
                        key={p.id || p.email}
                        onClick={() => { setSelectedPlayer(p); setPlayerDropdownOpen(false); }}
                        className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                      >
                        {p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : (p.name || p.email || p.id)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-gray-900 mb-2">Season</label>
                <div
                  onClick={() => setSeasonDropdownOpen(!seasonDropdownOpen)}
                  className="w-full p-4 bg-[#FAFBFF] border border-[#E5F0FF] rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer"
                >
                  <span>{selectedSeason ? activeSeasons.find(s => s.id === selectedSeason)?.name || activeSeasons.find(s => s.id === selectedSeason)?.year || activeSeasons.find(s => s.id === selectedSeason)?.id : "Select Active Season"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {seasonDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {activeSeasons.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => { setSelectedSeason(s.id); setSeasonDropdownOpen(false); }}
                        className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                      >
                        {s.name || s.year || s.id}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-gray-900 mb-2">Club</label>
                <div
                  onClick={() => setClubDropdownOpen(!clubDropdownOpen)}
                  className="w-full p-4 bg-[#FAFBFF] border border-[#E5F0FF] rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer"
                >
                  <span>{selectedClub ? clubs.find(c => c.id === selectedClub)?.name : "Enter Club"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {clubDropdownOpen && (
                  <div className="absolute z-10 w-full bottom-full mb-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {clubs.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => { setSelectedClub(c.id); setClubDropdownOpen(false); }}
                        className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                      >
                        {c.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button onClick={handleSeasonRenewalSubmit} disabled={loading} className="w-full py-4 bg-black text-white rounded-xl font-bold text-sm hover:bg-[#3b5da8] transition-colors">
              {loading ? "Processing..." : "Done"}
            </button>
          </div>
        </div>
      )}

      {/* 2. Guest Player Modal */}
      {activeModal === 'guest' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-[480px] rounded-3xl p-8 relative text-center shadow-xl">

            <button onClick={closeModal} className="absolute top-6 right-6 text-gray-400 hover:text-gray-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <div className="w-[60px] h-[60px] bg-[#F0F5FF] rounded-full flex items-center justify-center mx-auto mb-3">
              <img src="/Logo.png" alt="Logo" className="w-[30px] h-[30px] object-contain" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Guest Player</h2>

            <div className="space-y-4 text-left mb-6">
              <div className="relative">
                <label className="block text-xs font-bold text-gray-900 mb-2">Player</label>
                <div
                  onClick={() => setPlayerDropdownOpen(!playerDropdownOpen)}
                  className="w-full p-4 bg-[#FAFBFF] border border-[#E5F0FF] rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer"
                >
                  <span>{selectedPlayer ? (selectedPlayer.firstName ? `${selectedPlayer.firstName} ${selectedPlayer.lastName}` : (selectedPlayer.name || selectedPlayer.email || selectedPlayer.id)) : "Select Player"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {playerDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {(allPlayers.length > 0 ? allPlayers : playersData).map((p) => (
                      <div
                        key={p.id || p.email}
                        onClick={() => { setSelectedPlayer(p); setPlayerDropdownOpen(false); }}
                        className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                      >
                        {p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : (p.name || p.email || p.id)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-gray-900 mb-2">Season</label>
                <div
                  onClick={() => setSeasonDropdownOpen(!seasonDropdownOpen)}
                  className="w-full p-4 bg-[#FAFBFF] border border-[#E5F0FF] rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer"
                >
                  <span>{selectedSeason ? activeSeasons.find(s => s.id === selectedSeason)?.name || activeSeasons.find(s => s.id === selectedSeason)?.year || activeSeasons.find(s => s.id === selectedSeason)?.id : "Select Active Season"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {seasonDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {activeSeasons.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => { setSelectedSeason(s.id); setSeasonDropdownOpen(false); }}
                        className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                      >
                        {s.name || s.year || s.id}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-gray-900 mb-2">Guest District</label>
                <div
                  onClick={() => setDistrictDropdownOpen(!districtDropdownOpen)}
                  className="w-full p-4 bg-[#FAFBFF] border border-[#E5F0FF] rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer"
                >
                  <span>{guestDistrict ? districts.find(d => d.id === guestDistrict)?.name : "Enter Guest District"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {districtDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {districts.map((d) => (
                      <div
                        key={d.id}
                        onClick={() => {
                          setGuestDistrict(d.id);
                          setDistrictDropdownOpen(false);
                          fetchClubs(d.id);
                        }}
                        className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                      >
                        {d.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-gray-900 mb-2">Club</label>
                <div
                  onClick={() => setClubDropdownOpen(!clubDropdownOpen)}
                  className="w-full p-4 bg-[#FAFBFF] border border-[#E5F0FF] rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer"
                >
                  <span>{selectedClub ? clubs.find(c => c.id === selectedClub)?.name : "Enter Club"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {clubDropdownOpen && (
                  <div className="absolute z-10 w-full bottom-full mb-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {clubs.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => { setSelectedClub(c.id); setClubDropdownOpen(false); }}
                        className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                      >
                        {c.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button onClick={handleGuestPlayerSubmit} disabled={loading} className="w-full py-4 bg-black text-white rounded-xl font-bold text-sm hover:bg-[#3b5da8] transition-colors">
              {loading ? "Processing..." : "Done"}
            </button>
          </div>
        </div>
      )}
      {/* 3. Inter-Club Transfer Modal */}
      {activeModal === 'transfer' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-[480px] rounded-3xl p-8 relative text-center shadow-xl">

            <button onClick={closeModal} className="absolute top-6 right-6 text-gray-400 hover:text-gray-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <div className="w-[60px] h-[60px] bg-[#F0F5FF] rounded-full flex items-center justify-center mx-auto mb-3">
              <img src="/Logo.png" alt="Logo" className="w-[30px] h-[30px] object-contain" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Inter- Club Transfer</h2>

            <div className="space-y-4 text-left mb-6">
              <div className="relative">
                <label className="block text-xs font-bold text-gray-900 mb-2">Player</label>
                <div
                  onClick={() => setPlayerDropdownOpen(!playerDropdownOpen)}
                  className="w-full p-4 bg-[#FAFBFF] border border-[#E5F0FF] rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer"
                >
                  <span>{selectedPlayer ? (selectedPlayer.firstName ? `${selectedPlayer.firstName} ${selectedPlayer.lastName}` : (selectedPlayer.name || selectedPlayer.email || selectedPlayer.id)) : "Select Player"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {playerDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {(allPlayers.length > 0 ? allPlayers : playersData).map((p) => (
                      <div
                        key={p.id || p.email}
                        onClick={() => { setSelectedPlayer(p); setPlayerDropdownOpen(false); }}
                        className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                      >
                        {p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : (p.name || p.email || p.id)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-gray-900 mb-2">Club</label>
                <div
                  onClick={() => setClubDropdownOpen(!clubDropdownOpen)}
                  className="w-full p-4 bg-[#FAFBFF] border border-[#E5F0FF] rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer"
                >
                  <span>{selectedClub ? clubs.find(c => c.id === selectedClub)?.name : "Enter Club"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {clubDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {clubs.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => { setSelectedClub(c.id); setClubDropdownOpen(false); }}
                        className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                      >
                        {c.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-gray-900 mb-2">Season</label>
                <div
                  onClick={() => setSeasonDropdownOpen(!seasonDropdownOpen)}
                  className="w-full p-4 bg-[#FAFBFF] border border-[#E5F0FF] rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer"
                >
                  <span>{selectedSeason ? activeSeasons.find(s => s.id === selectedSeason)?.name || activeSeasons.find(s => s.id === selectedSeason)?.year || activeSeasons.find(s => s.id === selectedSeason)?.id : "Select Active Season"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {seasonDropdownOpen && (
                  <div className="absolute z-10 w-full bottom-full mb-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {activeSeasons.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => { setSelectedSeason(s.id); setSeasonDropdownOpen(false); }}
                        className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                      >
                        {s.name || s.year || s.id}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-900 mb-2">Reason</label>
                <input
                  type="text"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="Reason of Transfer"
                  className="w-full p-4 bg-[#FAFBFF] border border-[#E5F0FF] rounded-xl text-sm text-gray-900 outline-none focus:border-[#4B70C3]"
                />
              </div>
            </div>

            <button onClick={handleTransferSubmit} disabled={loading} className="w-full py-4 bg-black text-white rounded-xl font-bold text-sm hover:bg-[#3b5da8] transition-colors">
              {loading ? "Processing..." : "Done"}
            </button>
          </div>
        </div>
      )}

      {/* 4. Register Player Modal */}
      {activeModal === 'register' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-[480px] rounded-3xl p-8 relative text-center shadow-xl max-h-[90vh] overflow-y-auto">

            <button onClick={closeModal} className="absolute top-6 right-6 text-gray-400 hover:text-gray-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <div className="w-[60px] h-[60px] bg-[#F0F5FF] rounded-full flex items-center justify-center mx-auto mb-3">
              <img src="/Logo.png" alt="Logo" className="w-[30px] h-[30px] object-contain" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Player Registration</h2>

            <div className="space-y-4 text-left mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-900 mb-2">First Name</label>
                  <input
                    type="text"
                    value={registerForm.firstName}
                    onChange={(e) => setRegisterForm({ ...registerForm, firstName: e.target.value })}
                    placeholder="Enter Your First Name"
                    className={`w-full p-4 bg-[#FAFBFF] border ${registerErrors.firstName ? 'border-red-400' : 'border-[#E5F0FF]'} rounded-xl text-sm text-gray-900 outline-none focus:border-[#4B70C3]`}
                  />
                  {registerErrors.firstName && <p className="text-red-500 text-xs mt-1">{registerErrors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-900 mb-2">Last Name</label>
                  <input
                    type="text"
                    value={registerForm.lastName}
                    onChange={(e) => setRegisterForm({ ...registerForm, lastName: e.target.value })}
                    placeholder="Enter Your Last Name"
                    className={`w-full p-4 bg-[#FAFBFF] border ${registerErrors.lastName ? 'border-red-400' : 'border-[#E5F0FF]'} rounded-xl text-sm text-gray-900 outline-none focus:border-[#4B70C3]`}
                  />
                  {registerErrors.lastName && <p className="text-red-500 text-xs mt-1">{registerErrors.lastName}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-900 mb-2">Email</label>
                <input
                  type="email"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  placeholder="Enter Email Address"
                  className={`w-full p-4 bg-[#FAFBFF] border ${registerErrors.email ? 'border-red-400' : 'border-[#E5F0FF]'} rounded-xl text-sm text-gray-900 outline-none focus:border-[#4B70C3]`}
                />
                {registerErrors.email && <p className="text-red-500 text-xs mt-1">{registerErrors.email}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-900 mb-2">Date of Birth</label>
                  <input
                    type="date"
                    value={registerForm.dob}
                    onChange={(e) => setRegisterForm({ ...registerForm, dob: e.target.value })}
                    className={`w-full p-4 bg-[#FAFBFF] border ${registerErrors.dob ? 'border-red-400' : 'border-[#E5F0FF]'} rounded-xl text-sm text-gray-900 outline-none focus:border-[#4B70C3]`}
                  />
                  {registerErrors.dob && <p className="text-red-500 text-xs mt-1">{registerErrors.dob}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-900 mb-2">Mobile No.</label>
                  <div className={`w-full px-4 py-3.5 bg-[#FAFBFF] border ${registerErrors.mobile ? 'border-red-400' : 'border-[#E5F0FF]'} rounded-xl`}>
                    <PhoneInput
                      international
                      defaultCountry="IN"
                      value={registerForm.mobile}
                      onChange={(val) => setRegisterForm({ ...registerForm, mobile: val || '' })}
                      className="text-sm text-gray-900 outline-none"
                    />
                  </div>
                  {registerErrors.mobile && <p className="text-red-500 text-xs mt-1">{registerErrors.mobile}</p>}
                </div>
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-gray-900 mb-2">Season</label>
                <div
                  onClick={() => setRegisterSeasonDropdownOpen(!registerSeasonDropdownOpen)}
                  className={`w-full p-4 bg-[#FAFBFF] border ${registerErrors.seasonId ? 'border-red-400' : 'border-[#E5F0FF]'} rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer`}
                >
                  <span>{registerForm.seasonId ? (activeSeasons.find(s => s.id === registerForm.seasonId)?.name || activeSeasons.find(s => s.id === registerForm.seasonId)?.year) : "Select Active Season"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                {registerSeasonDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {activeSeasons.length === 0 ? (
                      <div className="p-3 text-sm text-gray-400">No active seasons</div>
                    ) : activeSeasons.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => { setRegisterForm({ ...registerForm, seasonId: s.id }); setRegisterSeasonDropdownOpen(false); }}
                        className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                      >
                        {s.name || s.year || s.id}
                      </div>
                    ))}
                  </div>
                )}
                {registerErrors.seasonId && <p className="text-red-500 text-xs mt-1">{registerErrors.seasonId}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-xs font-bold text-gray-900 mb-2">Home District</label>
                  <div
                    onClick={() => setRegisterDistrictDropdownOpen(!registerDistrictDropdownOpen)}
                    className={`w-full p-4 bg-[#FAFBFF] border ${registerErrors.homeDistrictId ? 'border-red-400' : 'border-[#E5F0FF]'} rounded-xl text-sm text-gray-900 flex justify-between items-center cursor-pointer`}
                  >
                    <span className="truncate">{registerForm.homeDistrictId ? districts.find(d => d.id === registerForm.homeDistrictId)?.name : "Select Home District"}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                  {registerDistrictDropdownOpen && (
                    <div className="absolute z-10 w-full bottom-full mb-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {districts.map((d) => (
                        <div
                          key={d.id}
                          onClick={() => {
                            setRegisterForm({ ...registerForm, homeDistrictId: d.id, homeClubId: '' });
                            setRegisterDistrictDropdownOpen(false);
                            fetchRegisterClubs(d.id);
                          }}
                          className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                        >
                          {d.name}
                        </div>
                      ))}
                    </div>
                  )}
                  {registerErrors.homeDistrictId && <p className="text-red-500 text-xs mt-1">{registerErrors.homeDistrictId}</p>}
                </div>

                <div className="relative">
                  <label className="block text-xs font-bold text-gray-900 mb-2">Home Club</label>
                  <div
                    onClick={() => registerForm.homeDistrictId && setRegisterClubDropdownOpen(!registerClubDropdownOpen)}
                    className={`w-full p-4 bg-[#FAFBFF] border ${registerErrors.homeClubId ? 'border-red-400' : 'border-[#E5F0FF]'} rounded-xl text-sm text-gray-900 flex justify-between items-center ${registerForm.homeDistrictId ? 'cursor-pointer' : 'cursor-not-allowed text-gray-400'}`}
                  >
                    <span className="truncate">
                      {registerForm.homeClubId
                        ? registerClubs.find(c => c.id === registerForm.homeClubId)?.name
                        : (registerForm.homeDistrictId ? "Select Home Club" : "Select district first")}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83878D" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                  {registerClubDropdownOpen && registerForm.homeDistrictId && (
                    <div className="absolute z-10 w-full bottom-full mb-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {registerClubs.length === 0 ? (
                        <div className="p-3 text-sm text-gray-400">No clubs available</div>
                      ) : (
                        registerClubs.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => { setRegisterForm({ ...registerForm, homeClubId: c.id }); setRegisterClubDropdownOpen(false); }}
                            className="p-3 text-sm hover:bg-gray-50 cursor-pointer text-gray-900"
                          >
                            {c.name}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {registerErrors.homeClubId && <p className="text-red-500 text-xs mt-1">{registerErrors.homeClubId}</p>}
                </div>
              </div>

              {registerErrors.submit && <p className="text-red-500 text-sm text-center">{registerErrors.submit}</p>}
            </div>

            <button onClick={handleRegisterSubmit} disabled={registerSubmitting} className="w-full py-4 bg-black text-white rounded-xl font-bold text-sm hover:bg-[#3b5da8] transition-colors disabled:opacity-50">
              {registerSubmitting ? "Registering..." : "Done"}
            </button>
          </div>
        </div>
      )}

      {/* Success modal — shared across register / season renewal / guest / transfer */}
      <StatusModal
        isOpen={!!successInfo}
        onClose={() => setSuccessInfo(null)}
        type="success"
        title={successInfo?.title || ''}
        message={successInfo?.message || ''}
      />

    </div>
  )
}

export default ActivePlayers
