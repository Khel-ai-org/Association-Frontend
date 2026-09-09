"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { X, Trophy } from 'lucide-react';
import { Team, Ground } from '../../types/tournament';

interface GenerateFixtureModalProps {
  isOpen: boolean;
  onClose: () => void;
  // The scoring service's own tournament id — fixtures live there, not in
  // the core backend, so this must be externalTournamentId, not the core id.
  tournamentExternalId: string;
  teams: Team[];
  grounds: Ground[];
  isGroupMode: boolean;
  startDate?: string;
  onGenerated: () => void;
}

const GROUP_LETTERS = 'ABCDEFGHIJ';

export default function GenerateFixtureModal({
  isOpen,
  onClose,
  tournamentExternalId,
  teams,
  grounds,
  isGroupMode,
  startDate,
  onGenerated,
}: GenerateFixtureModalProps) {
  const [groupCount, setGroupCount] = useState(2);
  const [groupAssignments, setGroupAssignments] = useState<Record<string, string[]>>({});
  const [playoffTeams, setPlayoffTeams] = useState('2');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const groupNames = useMemo(
    () => Array.from({ length: groupCount }, (_, i) => `Group ${GROUP_LETTERS[i] || i + 1}`),
    [groupCount]
  );

  useEffect(() => {
    // Keep only the buckets that still exist when groupCount shrinks/grows
    setGroupAssignments((prev) => {
      const next: Record<string, string[]> = {};
      groupNames.forEach((g) => {
        next[g] = prev[g] || [];
      });
      return next;
    });
  }, [groupNames]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setError('');
    onClose();
  };

  const assignedTeamIds = new Set(Object.values(groupAssignments).flat());

  const availableForGroup = (group: string) =>
    teams.filter((t) => !assignedTeamIds.has(t.id) || groupAssignments[group]?.includes(t.id));

  const toggleTeamInGroup = (group: string, teamId: string) => {
    setGroupAssignments((prev) => {
      const current = prev[group] || [];
      const next = current.includes(teamId) ? current.filter((id) => id !== teamId) : [...current, teamId];
      return { ...prev, [group]: next };
    });
  };

  const handleSubmit = async () => {
    if (teams.length === 0) {
      setError('Add teams before generating fixtures.');
      return;
    }
    if (!tournamentExternalId) {
      setError('This tournament is missing its scoring-service id — cannot generate fixtures yet.');
      return;
    }

    const team_ids = isGroupMode ? Array.from(assignedTeamIds) : teams.map((t) => t.id);
    if (isGroupMode && team_ids.length === 0) {
      setError('Assign at least one team to a group.');
      return;
    }

    const group_configuration = isGroupMode
      ? Object.fromEntries(groupNames.map((g) => [g, groupAssignments[g] || []]))
      : null;

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/tournaments/${tournamentExternalId}/fixtures`,
        {
          method: 'POST',
          headers: { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            team_ids,
            group_configuration,
            // No visible Date/Venue fields in this modal (matching the
            // reference app) — derived silently from the tournament itself.
            start_date: startDate ? startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
            venues: grounds.length ? grounds.map((g) => g.id) : null,
            no_of_teams_qualify_playoffs: parseInt(playoffTeams, 10),
          }),
        }
      );

      if (response.ok) {
        onGenerated();
        resetAndClose();
      } else {
        const errorData = await response.json().catch(() => null);
        setError(errorData?.message || 'Failed to generate fixtures');
      }
    } catch (err) {
      console.error('Error generating fixtures:', err);
      setError('Network error. Failed to generate fixtures');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-[620px] rounded-[32px] shadow-2xl relative max-h-[90vh] overflow-y-auto">
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
              <Trophy className="w-7 h-7 text-[#5D5FEF]" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Generate Tournament Fixtures</h2>
            <p className="text-slate-500 text-sm mt-1 text-center">Configure your tournament structure and generate fixtures</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">No. of Total Teams</label>
                <input
                  type="text"
                  readOnly
                  value={teams.length}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none text-sm text-gray-600"
                />
              </div>

              {isGroupMode ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-500 mb-1.5">No. of Groups</label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={groupCount}
                    onChange={(e) => setGroupCount(Math.max(2, Math.min(10, Number(e.target.value) || 2)))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm text-gray-700"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-500 mb-1.5">Teams Qualifying for Playoffs</label>
                  <select
                    value={playoffTeams}
                    onChange={(e) => setPlayoffTeams(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm text-gray-700 bg-white"
                  >
                    <option value="2">2 Teams</option>
                    <option value="4">4 Teams</option>
                  </select>
                </div>
              )}
            </div>

            {isGroupMode && (
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-2">Select Teams in Each Group</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groupNames.map((group) => (
                    <div key={group} className="border border-slate-200 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-600 mb-2">{group}</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(groupAssignments[group] || []).map((teamId) => {
                          const team = teams.find((t) => t.id === teamId);
                          return (
                            <span
                              key={teamId}
                              className="flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium px-2 py-1 rounded-full"
                            >
                              {team?.name || teamId}
                              <button onClick={() => toggleTeamInGroup(group, teamId)} className="text-slate-400 hover:text-red-500">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) toggleTeamInGroup(group, e.target.value);
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none text-xs text-gray-600 bg-white"
                      >
                        <option value="">Add team...</option>
                        {availableForGroup(group)
                          .filter((t) => !(groupAssignments[group] || []).includes(t.id))
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isGroupMode && (
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Teams Qualifying for Playoffs</label>
                <select
                  value={playoffTeams}
                  onChange={(e) => setPlayoffTeams(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm text-gray-700 bg-white"
                >
                  <option value="2">2 Teams each Group</option>
                  <option value="4">4 Teams each Group</option>
                </select>
              </div>
            )}

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={resetAndClose}
                className="flex-1 border border-slate-200 text-slate-700 py-3.5 rounded-2xl font-semibold text-sm hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-[#0F1117] text-white py-3.5 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                {submitting ? 'Generating...' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
