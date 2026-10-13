"use client";

import React, { useEffect, useRef, useState } from 'react';
import { X, Trophy, ChevronDown, Search, Loader2 } from 'lucide-react';
import { Ground } from '../../types/tournament';
import StatusModal from '@/app/components/auth/StatusModal';

interface EditTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  tournamentId: string;
}

// Same fixed-overs mapping as CreateTournamentModal.tsx — kept in sync with
// the backend's `TournamentMatchFormat` enum (Tournament.ts).
const MATCH_TYPES = ['T10', 'T20', 'ODI', 'TEST', 'CUSTOM'] as const;
type MatchType = typeof MATCH_TYPES[number];
const MATCH_TYPE_OVERS: Partial<Record<MatchType, number>> = { T10: 10, T20: 20, ODI: 50 };

const emptyFormData = {
  name: '',
  location: '',
  groundIds: [] as string[],
  category: '',
  teamCount: '',
  matchType: '' as MatchType | '',
  oversPerMatch: '',
  testDays: '',
  startDate: '',
  endDate: '',
};

// An ISO timestamp (or already-plain date) → the "YYYY-MM-DD" shape
// `<input type="date">` needs.
const toDateInputValue = (value?: string | null): string => {
  if (!value) return '';
  return value.slice(0, 10);
};

export default function EditTournamentModal({ isOpen, onClose, onUpdated, tournamentId }: EditTournamentModalProps) {
  const [formData, setFormData] = useState(emptyFormData);
  const [grounds, setGrounds] = useState<Ground[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isGroundDropdownOpen, setIsGroundDropdownOpen] = useState(false);
  const [groundSearch, setGroundSearch] = useState('');
  const groundDropdownRef = useRef<HTMLDivElement>(null);
  const [isMatchTypeDropdownOpen, setIsMatchTypeDropdownOpen] = useState(false);
  const matchTypeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (groundDropdownRef.current && !groundDropdownRef.current.contains(e.target as Node)) {
        setIsGroundDropdownOpen(false);
      }
      if (matchTypeDropdownRef.current && !matchTypeDropdownRef.current.contains(e.target as Node)) {
        setIsMatchTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Grounds list (for the picker) and the tournament's own current details
  // (to pre-fill the form) are both fetched fresh every time the modal opens.
  useEffect(() => {
    if (!isOpen || !tournamentId) return;

    const fetchGrounds = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/ground/my-grounds`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data: Ground[] = await response.json();
          setGrounds(data);
        }
      } catch (error) {
        console.error('Error fetching grounds:', error);
      }
    };

    const fetchTournament = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/${tournamentId}`, {
          method: 'GET',
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setFormData({
            name: data.name || '',
            location: data.location || '',
            groundIds: Array.isArray(data.grounds) ? data.grounds.map((g: Ground) => g.id) : [],
            category: data.category || '',
            teamCount: data.teamCount != null ? String(data.teamCount) : '',
            matchType: (data.match_type as MatchType) || '',
            oversPerMatch: data.oversPerMatch ? String(data.oversPerMatch) : '',
            testDays: data.test_days != null ? String(data.test_days) : '',
            startDate: toDateInputValue(data.startDate),
            endDate: toDateInputValue(data.endDate),
          });
        } else {
          setErrors({ submit: 'Failed to load tournament details' });
        }
      } catch (error) {
        console.error('Error fetching tournament:', error);
        setErrors({ submit: 'Network error. Failed to load tournament details' });
      } finally {
        setLoading(false);
      }
    };

    fetchGrounds();
    fetchTournament();
  }, [isOpen, tournamentId]);

  const handleClose = () => {
    setFormData(emptyFormData);
    setErrors({});
    setIsGroundDropdownOpen(false);
    setGroundSearch('');
    setIsMatchTypeDropdownOpen(false);
    onClose();
  };

  // Same reset-on-select behavior as CreateTournamentModal.tsx.
  const handleMatchTypeChange = (value: MatchType) => {
    setFormData((prev) => ({
      ...prev,
      matchType: value,
      oversPerMatch: value === 'TEST' || value === 'CUSTOM' ? '' : String(MATCH_TYPE_OVERS[value] ?? ''),
      testDays: value === 'TEST' ? (prev.testDays || '5') : '',
    }));
    setIsMatchTypeDropdownOpen(false);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const alphaRegex = /^[A-Za-z\s]+$/;

    if (!formData.name.trim()) newErrors.name = 'Tournament name is required';
    if (!formData.location.trim() || !alphaRegex.test(formData.location)) {
      newErrors.location = 'Location is required (Alphabets only)';
    }
    if (formData.groundIds.length === 0) newErrors.groundIds = 'Please select at least one ground';
    if (!formData.category.trim()) newErrors.category = 'Match category is required';
    if (!formData.teamCount || isNaN(Number(formData.teamCount)) || Number(formData.teamCount) <= 0) {
      newErrors.teamCount = 'Must be a valid number greater than 0';
    }
    if (!formData.matchType) {
      newErrors.matchType = 'Please select a match type';
    } else if (formData.matchType === 'TEST') {
      const days = Number(formData.testDays);
      if (!formData.testDays || isNaN(days) || days < 1 || days > 5) {
        newErrors.testDays = 'Must be a number between 1 and 5';
      }
    } else if (!formData.oversPerMatch || isNaN(Number(formData.oversPerMatch)) || Number(formData.oversPerMatch) <= 0) {
      newErrors.oversPerMatch = 'Must be a valid number greater than 0';
    }
    if (!formData.startDate) newErrors.startDate = 'Required';
    if (!formData.endDate) newErrors.endDate = 'Required';
    if (formData.startDate && formData.endDate) {
      if (new Date(formData.endDate) <= new Date(formData.startDate)) {
        newErrors.endDate = 'End date must be after start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/${tournamentId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          location: formData.location.trim(),
          category: formData.category.trim(),
          teamCount: parseInt(formData.teamCount, 10),
          match_type: formData.matchType,
          test_days: formData.matchType === 'TEST' ? parseInt(formData.testDays, 10) : null,
          oversPerMatch: formData.matchType === 'TEST' ? 0 : parseInt(formData.oversPerMatch, 10),
          startDate: formData.startDate,
          endDate: formData.endDate,
          groundIds: formData.groundIds,
        }),
      });

      if (response.ok) {
        handleClose();
        onUpdated();
        setShowSuccess(true);
      } else {
        const errorData = await response.json().catch(() => null);
        setErrors({ submit: errorData?.message || 'Failed to update tournament' });
      }
    } catch (error) {
      console.error('Error updating tournament:', error);
      setErrors({ submit: 'Network error. Failed to update tournament' });
    } finally {
      setSubmitting(false);
    }
  };

  const successModal = (
    <StatusModal
      isOpen={showSuccess}
      onClose={() => setShowSuccess(false)}
      type="success"
      title="Tournament Updated"
      message="Tournament details have been updated successfully"
    />
  );

  if (!isOpen) return successModal;

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-[560px] rounded-[32px] shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 transition-colors z-50"
          aria-label="Close modal"
        >
          <X className="w-6 h-6 text-slate-400 hover:text-slate-900" />
        </button>

        <div className="p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 bg-[#F4F7FE] rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-7 h-7 text-[#5D5FEF]" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Edit Tournament</h2>
            <p className="text-slate-500 text-sm mt-1">Update Tournament Details &amp; Configuration</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading tournament...
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Tournament</label>
                <input
                  type="text"
                  placeholder="Enter Tournament Name"
                  className={`w-full px-4 py-3 rounded-xl border ${errors.name ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-700`}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Location</label>
                <input
                  type="text"
                  placeholder="Enter Location"
                  className={`w-full px-4 py-3 rounded-xl border ${errors.location ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-700`}
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
                {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
              </div>

              <div className="relative" ref={groundDropdownRef}>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Select Ground</label>
                <div
                  onClick={() => setIsGroundDropdownOpen((prev) => !prev)}
                  className={`w-full px-4 py-3 rounded-xl border ${errors.groundIds ? 'border-red-500' : 'border-slate-200'} bg-white text-sm cursor-pointer flex justify-between items-center outline-none transition-all`}
                >
                  <span className={`truncate ${formData.groundIds.length ? 'text-gray-700' : 'text-gray-400'}`}>
                    {formData.groundIds.length
                      ? grounds
                          .filter((g) => formData.groundIds.includes(g.id))
                          .map((g) => g.name)
                          .join(', ')
                      : 'Select Grounds'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isGroundDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                {errors.groundIds && <p className="text-red-500 text-xs mt-1">{errors.groundIds}</p>}

                {isGroundDropdownOpen && (
                  <div className="absolute left-0 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl z-50 p-2.5">
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search grounds..."
                        value={groundSearch}
                        onChange={(e) => setGroundSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 text-gray-700"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {grounds
                        .filter(
                          (g) =>
                            g.name.toLowerCase().includes(groundSearch.toLowerCase()) ||
                            g.location.toLowerCase().includes(groundSearch.toLowerCase())
                        )
                        .map((g) => (
                          <label
                            key={g.id}
                            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={formData.groundIds.includes(g.id)}
                              onChange={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  groundIds: prev.groundIds.includes(g.id)
                                    ? prev.groundIds.filter((id) => id !== g.id)
                                    : [...prev.groundIds, g.id],
                                }))
                              }
                            />
                            <span>
                              {g.name} <span className="text-slate-400 text-xs">({g.location})</span>
                            </span>
                          </label>
                        ))}
                      {grounds.filter(
                        (g) =>
                          g.name.toLowerCase().includes(groundSearch.toLowerCase()) ||
                          g.location.toLowerCase().includes(groundSearch.toLowerCase())
                      ).length === 0 && <p className="text-xs text-slate-400 text-center py-3">No grounds found.</p>}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Match Category</label>
                <input
                  type="text"
                  placeholder="e.g. T20 Professional"
                  className={`w-full px-4 py-3 rounded-xl border ${errors.category ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-700`}
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
                {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Team Count</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Enter no. of teams"
                  className={`w-full px-4 py-3 rounded-xl border ${errors.teamCount ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-700`}
                  value={formData.teamCount}
                  onChange={(e) => setFormData({ ...formData, teamCount: e.target.value.replace(/\D/g, '') })}
                />
                {errors.teamCount && <p className="text-red-500 text-xs mt-1">{errors.teamCount}</p>}
              </div>

              <div className="relative" ref={matchTypeDropdownRef}>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Match Type</label>
                <div
                  onClick={() => setIsMatchTypeDropdownOpen((prev) => !prev)}
                  className={`w-full px-4 py-3 rounded-xl border ${errors.matchType ? 'border-red-500' : 'border-slate-200'} bg-white text-sm cursor-pointer flex justify-between items-center outline-none transition-all`}
                >
                  <span className={formData.matchType ? 'text-gray-700' : 'text-gray-400'}>
                    {formData.matchType || 'Select Match Type'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isMatchTypeDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                {errors.matchType && <p className="text-red-500 text-xs mt-1">{errors.matchType}</p>}

                {isMatchTypeDropdownOpen && (
                  <div className="absolute left-0 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl z-50 p-2.5 space-y-0.5">
                    {MATCH_TYPES.map((t) => (
                      <div
                        key={t}
                        onClick={() => handleMatchTypeChange(t)}
                        className={`px-2.5 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-sm ${formData.matchType === t ? 'text-blue-600 font-semibold' : 'text-slate-700'}`}
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!formData.matchType ? null : formData.matchType === 'TEST' ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-500 mb-1.5">Test Days (1-5)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="e.g.- 5"
                    className={`w-full px-4 py-3 rounded-xl border ${errors.testDays ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-700`}
                    value={formData.testDays}
                    onChange={(e) => setFormData({ ...formData, testDays: e.target.value.replace(/\D/g, '') })}
                  />
                  {errors.testDays && <p className="text-red-500 text-xs mt-1">{errors.testDays}</p>}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-500 mb-1.5">
                    Over per Match {formData.matchType === 'CUSTOM' ? '' : '(Fixed)'}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="e.g.- 20"
                    disabled={formData.matchType !== 'CUSTOM'}
                    className={`w-full px-4 py-3 rounded-xl border ${errors.oversPerMatch ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm ${formData.matchType === 'CUSTOM' ? 'text-gray-700' : 'bg-slate-100 text-slate-500 cursor-not-allowed'}`}
                    value={formData.oversPerMatch}
                    onChange={(e) => setFormData({ ...formData, oversPerMatch: e.target.value.replace(/\D/g, '') })}
                  />
                  {errors.oversPerMatch && <p className="text-red-500 text-xs mt-1">{errors.oversPerMatch}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Start Date</label>
                <input
                  type="date"
                  className={`w-full px-4 py-3 rounded-xl border ${errors.startDate ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-700`}
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
                {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">End Date</label>
                <input
                  type="date"
                  className={`w-full px-4 py-3 rounded-xl border ${errors.endDate ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-700`}
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
                {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate}</p>}
              </div>
            </div>

            {errors.submit && <p className="text-red-500 text-sm text-center">{errors.submit}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 border border-slate-200 text-slate-700 py-3.5 rounded-2xl font-semibold text-sm hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-[#0F1117] text-white py-3.5 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                {submitting ? 'Updating...' : 'Update Tournament'}
              </button>
            </div>
          </form>
          )}
        </div>
      </div>
    </div>
    {successModal}
    </>
  );
}
