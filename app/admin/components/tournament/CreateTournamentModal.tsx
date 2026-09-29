"use client";

import React, { useEffect, useRef, useState } from 'react';
import { X, Trophy, ChevronDown, Search } from 'lucide-react';
import { Ground } from '../../types/tournament';
import StatusModal from '@/app/components/auth/StatusModal';

interface CreateTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const initialFormData = {
  name: '',
  location: '',
  groundIds: [] as string[],
  category: '',
  teamCount: '',
  oversPerMatch: '',
  startDate: '',
  endDate: '',
};

export default function CreateTournamentModal({ isOpen, onClose, onCreated }: CreateTournamentModalProps) {
  const [formData, setFormData] = useState(initialFormData);
  const [grounds, setGrounds] = useState<Ground[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isGroundDropdownOpen, setIsGroundDropdownOpen] = useState(false);
  const [groundSearch, setGroundSearch] = useState('');
  const groundDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (groundDropdownRef.current && !groundDropdownRef.current.contains(e.target as Node)) {
        setIsGroundDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

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

    fetchGrounds();
  }, [isOpen]);

  const handleClose = () => {
    setFormData(initialFormData);
    setErrors({});
    setIsGroundDropdownOpen(false);
    setGroundSearch('');
    onClose();
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
    if (!formData.oversPerMatch || isNaN(Number(formData.oversPerMatch)) || Number(formData.oversPerMatch) <= 0) {
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          location: formData.location.trim(),
          category: formData.category.trim(),
          teamCount: parseInt(formData.teamCount, 10),
          oversPerMatch: parseInt(formData.oversPerMatch, 10),
          startDate: formData.startDate,
          endDate: formData.endDate,
          groundIds: formData.groundIds,
        }),
      });

      if (response.ok) {
        handleClose();
        onCreated();
        setShowSuccess(true);
      } else {
        const errorData = await response.json().catch(() => null);
        setErrors({ submit: errorData?.message || 'Failed to create tournament' });
      }
    } catch (error) {
      console.error('Error creating tournament:', error);
      setErrors({ submit: 'Network error. Failed to create tournament' });
    } finally {
      setSubmitting(false);
    }
  };

  const successModal = (
    <StatusModal
      isOpen={showSuccess}
      onClose={() => setShowSuccess(false)}
      type="success"
      title="Tournament Created"
      message="New Tournament Has been Created Successfully"
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
            <h2 className="text-2xl font-bold text-slate-900">Create Tournament</h2>
            <p className="text-slate-500 text-sm mt-1">Enter Tournament Details &amp; Configuration</p>
          </div>

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
                  type="number"
                  min={1}
                  placeholder="Enter no. of teams"
                  className={`w-full px-4 py-3 rounded-xl border ${errors.teamCount ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-700`}
                  value={formData.teamCount}
                  onChange={(e) => setFormData({ ...formData, teamCount: e.target.value })}
                />
                {errors.teamCount && <p className="text-red-500 text-xs mt-1">{errors.teamCount}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Over per Match</label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g.- 20"
                  className={`w-full px-4 py-3 rounded-xl border ${errors.oversPerMatch ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-700`}
                  value={formData.oversPerMatch}
                  onChange={(e) => setFormData({ ...formData, oversPerMatch: e.target.value })}
                />
                {errors.oversPerMatch && <p className="text-red-500 text-xs mt-1">{errors.oversPerMatch}</p>}
              </div>

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
                {submitting ? 'Starting...' : 'Start a Tournament →'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
    {successModal}
    </>
  );
}
