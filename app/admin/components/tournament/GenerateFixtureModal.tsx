"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { X, Trophy, ChevronDown } from 'lucide-react';
import { Team, Ground } from '../../types/tournament';
import StatusModal from '@/app/components/auth/StatusModal';

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
  // Raw text so the field can be edited freely; clamped to 2-10 on blur.
  const [groupCountInput, setGroupCountInput] = useState('2');
  const [groupAssignments, setGroupAssignments] = useState<Record<string, string[]>>({});
  // Empty until the user picks one — no default.
  const [playoffTeams, setPlayoffTeams] = useState('');
  const [qualifyDropdownOpen, setQualifyDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [openGroupDropdown, setOpenGroupDropdown] = useState<string | null>(null);

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

  const successModal = (
    <StatusModal
      isOpen={showSuccess}
      onClose={() => setShowSuccess(false)}
      type="success"
      title="Fixture Generated"
      message="Tournament Fixtures Have been Generated Successfully"
    />
  );

  if (!isOpen) return successModal;

  const resetAndClose = () => {
    setError('');
    onClose();
  };

  const assignedTeamIds = new Set(Object.values(groupAssignments).flat());

  // Upper bound for teams that can qualify for the playoffs: all the teams. In group mode the
  // count is per group, so it can't exceed the smallest group that has teams assigned.
  const groupSizes = groupNames.map((g) => groupAssignments[g]?.length || 0).filter((n) => n > 0);
  const maxQualify = Math.max(1, isGroupMode && groupSizes.length > 0 ? Math.min(...groupSizes) : teams.length);
  // 0 = nothing chosen yet (or the earlier choice no longer fits, e.g. after groups changed).
  const chosenQualify = Number(playoffTeams);
  // For now only 2 or 4 can qualify, and only those that fit (all teams in a league, the smallest group in group mode).
  const qualifyOptions = [2, 4].filter((n) => n <= maxQualify);
  const qualifyValue = qualifyOptions.includes(chosenQualify) ? chosenQualify : 0;
  // At most half the teams (rounded for odd counts), and always within 2-10.
  const maxGroups = Math.max(2, Math.min(10, Math.round(teams.length / 2)));

  const renderQualifyDropdown = (suffix: string, openUp: boolean) => (
    <div className="relative">
      <div
        onClick={() => setQualifyDropdownOpen((o) => !o)}
        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm cursor-pointer flex justify-between items-center outline-none transition-all"
      >
        <span className={qualifyValue ? 'text-gray-700' : 'text-gray-400'}>
          {qualifyValue ? `${qualifyValue} ${qualifyValue === 1 ? 'Team' : 'Teams'}${suffix}` : 'Select teams'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${qualifyDropdownOpen ? 'rotate-180' : ''}`} />
      </div>
      {qualifyDropdownOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setQualifyDropdownOpen(false)} />
          <div className={`absolute left-0 w-full ${openUp ? 'bottom-full mb-1' : 'mt-1'} bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto`}>
            {qualifyOptions.length === 0 && (
              <div className="px-4 py-2.5 text-sm text-gray-400">Not enough teams{suffix ? ' in a group' : ''}</div>
            )}
            {qualifyOptions.map((n) => (
              <div
                key={n}
                onClick={() => {
                  setPlayoffTeams(String(n));
                  setQualifyDropdownOpen(false);
                }}
                className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-slate-50 ${qualifyValue === n ? 'text-[#5D5FEF] font-semibold bg-indigo-50/50' : 'text-gray-700'}`}
              >
                {n} {n === 1 ? 'Team' : 'Teams'}{suffix}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

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

    if (isGroupMode && (Number(groupCountInput) < 2 || Number(groupCountInput) > 10)) {
      setError('Number of groups must be between 2 and 10.');
      return;
    }
    if (isGroupMode && Number(groupCountInput) > maxGroups) {
      setError(`Number of groups can't be more than ${maxGroups} for ${teams.length} teams.`);
      return;
    }

    const team_ids = isGroupMode ? Array.from(assignedTeamIds) : teams.map((t) => t.id);
    if (isGroupMode && team_ids.length === 0) {
      setError('Assign at least one team to a group.');
      return;
    }

    if (!qualifyValue) {
      setError('Select how many teams qualify for the playoffs.');
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
            //start_date: startDate ? startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
            venues: null,
            no_of_teams_qualify_playoffs: qualifyValue,
          }),
        }
      );

      if (response.ok) {
        onGenerated();
        resetAndClose();
        setShowSuccess(true);
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
    <>
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
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={groupCountInput}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                      setGroupCountInput(digits);
                      const n = Number(digits);
                      if (n >= 2 && n <= Math.min(10, maxGroups)) setGroupCount(n);
                    }}
                    onBlur={() => {
                      const n = Math.max(2, Math.min(Math.max(2, maxGroups), Number(groupCountInput) || 2));
                      setGroupCount(n);
                      setGroupCountInput(String(n));
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm text-gray-700"
                  />
                  {groupCountInput !== '' && Number(groupCountInput) < 2 && (
                    <p className="text-red-500 text-xs mt-1">Minimum 2 groups required</p>
                  )}
                  {Number(groupCountInput) > maxGroups && (
                    <p className="text-red-500 text-xs mt-1">Maximum {maxGroups} groups for {teams.length} teams</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-500 mb-1.5">Teams Qualifying for Playoffs</label>
                  {renderQualifyDropdown('', false)}
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
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenGroupDropdown((prev) => (prev === group ? null : group))}
                          className="w-full flex justify-between items-center px-3 py-2 rounded-lg border border-slate-200 outline-none text-xs text-gray-600 bg-white cursor-pointer"
                        >
                          <span>Add team...</span>
                          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${openGroupDropdown === group ? 'rotate-180' : ''}`} />
                        </button>
                        {openGroupDropdown === group && (
                          <div className="absolute left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
                            {availableForGroup(group).filter((t) => !(groupAssignments[group] || []).includes(t.id)).length === 0 ? (
                              <div className="px-3 py-2 text-xs text-slate-400">No teams available</div>
                            ) : (
                              availableForGroup(group)
                                .filter((t) => !(groupAssignments[group] || []).includes(t.id))
                                .map((t) => (
                                  <div
                                    key={t.id}
                                    onClick={() => {
                                      toggleTeamInGroup(group, t.id);
                                      setOpenGroupDropdown(null);
                                    }}
                                    className="px-3 py-2 text-xs text-gray-700 hover:bg-slate-50 cursor-pointer"
                                  >
                                    {t.name}
                                  </div>
                                ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isGroupMode && (
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Teams Qualifying for Playoffs</label>
                {renderQualifyDropdown(' each Group', true)}
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
    {successModal}
    </>
  );
}
