"use client";

import React, { useEffect, useState } from 'react';
import { X, CalendarDays, ChevronDown } from 'lucide-react';
import { Fixture, Ground } from '../../types/tournament';
import StatusModal from '@/app/components/auth/StatusModal';

interface ScheduleMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  fixture: Fixture | null;
  // Core backend id — used only for the core admin-match-record POST below.
  tournamentId: string;
  // Scoring service's own tournament id — the PATCH that actually schedules
  // the fixture lives there, so it must be keyed by this, not tournamentId.
  tournamentExternalId: string;
  grounds: Ground[];
  onScheduled: () => void;
}

export default function ScheduleMatchModal({
  isOpen,
  onClose,
  fixture,
  tournamentId,
  tournamentExternalId,
  grounds,
  onScheduled,
}: ScheduleMatchModalProps) {
  const [scheduleDate, setScheduleDate] = useState('');
  const [selectedGroundId, setSelectedGroundId] = useState('');
  const [groundDropdownOpen, setGroundDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Always start unselected — the user must actively pick a ground,
      // rather than one being silently defaulted for them.
      setSelectedGroundId('');
      setGroundDropdownOpen(false);
    }
  }, [isOpen, fixture]);

  const successModal = (
    <StatusModal
      isOpen={showSuccess}
      onClose={() => setShowSuccess(false)}
      type="success"
      title="Match Scheduled"
      message="The Match Has been Scheduled for the Tournament"
    />
  );

  if (!isOpen || !fixture) return successModal;

  const resetAndClose = () => {
    setScheduleDate('');
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!scheduleDate) {
      setError('Please pick a schedule date.');
      return;
    }
    if (!selectedGroundId) {
      setError('This tournament has no ground linked yet.');
      return;
    }
    if (!tournamentExternalId) {
      setError('This tournament is missing its scoring-service id — cannot schedule yet.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      // venue_id is validated server-side as a real UUID — sending the
      // ground's name there 500s. The live match's own `ground_name` ending
      // up as a UUID instead of a name is a separate backend bug (it copies
      // this value verbatim rather than resolving it) that can't be worked
      // around from here without breaking this endpoint; send the real id.
      const scheduleResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/tournaments/${tournamentExternalId}/matches/${fixture.id}`,
        {
          method: 'PATCH',
          headers: { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduled_date: scheduleDate,
            venue: grounds.find((g) => g.id === selectedGroundId)?.name || 'Unknown Ground',
            venue_id: selectedGroundId,
          }),
        }
      );

      if (!scheduleResponse.ok) {
        const errorData = await scheduleResponse.json().catch(() => null);
        setError(errorData?.message || 'Failed to schedule match');
        setSubmitting(false);
        return;
      }

      // Create/link the core-API admin match record so the existing
      // /matches/tournament/:id-backed list keeps working unmodified.
      await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/matches`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${fixture.home_team?.name || 'TBD'} vs ${fixture.away_team?.name || 'TBD'}`,
          date: scheduleDate,
          tournament_id: tournamentId,
          ground_id: selectedGroundId,
          scoring_match_id: fixture.id,
        }),
      });

      onScheduled();
      resetAndClose();
      setShowSuccess(true);
    } catch (err) {
      console.error('Error scheduling match:', err);
      setError('Network error. Failed to schedule match');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-[440px] rounded-[32px] shadow-2xl relative">
        <button
          onClick={resetAndClose}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 transition-colors z-50"
          aria-label="Close modal"
        >
          <X className="w-6 h-6 text-slate-400 hover:text-slate-900" />
        </button>

        <div className="p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 bg-[#F4F7FE] rounded-full flex items-center justify-center mb-4">
              <CalendarDays className="w-7 h-7 text-[#5D5FEF]" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Schedule Match</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-500 mb-1.5">Schedule Date</label>
              <input
                type="date"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm text-gray-700"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
            <div className="relative">
              <label className="block text-sm font-semibold text-slate-500 mb-1.5">Ground</label>
              {grounds.length > 0 ? (
                <>
                  <div
                    onClick={() => setGroundDropdownOpen((prev) => !prev)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm cursor-pointer flex justify-between items-center outline-none transition-all"
                  >
                    <span className={selectedGroundId ? 'text-gray-700' : 'text-gray-400'}>
                      {selectedGroundId
                        ? (() => {
                            const g = grounds.find((g) => g.id === selectedGroundId);
                            return g ? `${g.name} (${g.location})` : 'Select Ground';
                          })()
                        : 'Select Ground'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${groundDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                  {groundDropdownOpen && (
                    <div className="absolute left-0 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                      {grounds.map((g) => (
                        <div
                          key={g.id}
                          onClick={() => {
                            setSelectedGroundId(g.id);
                            setGroundDropdownOpen(false);
                          }}
                          className="px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 cursor-pointer"
                        >
                          {g.name} ({g.location})
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <input
                  type="text"
                  readOnly
                  value="No ground linked to this tournament"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none text-sm text-gray-600"
                />
              )}
            </div>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-[#0F1117] text-white py-3.5 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all disabled:opacity-50"
            >
              {submitting ? 'Scheduling...' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
    {successModal}
    </>
  );
}
