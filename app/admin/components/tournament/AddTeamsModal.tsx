"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { X, Users, Upload, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Team } from '../../types/tournament';

interface AddTeamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // The scoring service's own tournament id — teams live there, not in the
  // core backend, so this must be externalTournamentId, not the core id.
  tournamentExternalId: string;
  onTeamsAdded: () => void;
}

export default function AddTeamsModal({ isOpen, onClose, tournamentExternalId, onTeamsAdded }: AddTeamsModalProps) {
  const [manualRows, setManualRows] = useState<string[]>([]);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [existingTeams, setExistingTeams] = useState<Team[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchExistingTeams = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/teams/all-names`, {
          method: 'GET',
          headers: { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json();
          setExistingTeams(Array.isArray(data) ? data : data?.teams || []);
        }
      } catch (err) {
        console.error('Error fetching existing teams:', err);
      }
    };

    fetchExistingTeams();
  }, [isOpen]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setManualRows([]);
    setIsManualOpen(false);
    setIsDropdownOpen(false);
    setSelectedTeamIds([]);
    setFileName('');
    setError('');
    onClose();
  };

  const toggleManualSection = () => {
    setIsManualOpen((prev) => {
      const opening = !prev;
      if (opening) {
        setManualRows((rows) => (rows.length === 0 ? [''] : rows));
      }
      return opening;
    });
  };

  const addManualRow = () => setManualRows((prev) => [...prev, '']);
  const removeManualRow = (index: number) => setManualRows((prev) => prev.filter((_, i) => i !== index));
  const updateManualRow = (index: number, value: string) =>
    setManualRows((prev) => prev.map((n, i) => (i === index ? value : n)));

  const toggleExistingTeam = (id: string) => {
    setSelectedTeamIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(`Selected: ${file.name}`);
    setIsManualOpen(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const names = rows
          .filter((row, index) => index !== 0 && row?.[0] && String(row[0]).trim() !== '')
          .map((row) => String(row[0]).trim());

        setManualRows(names);
        setError('');
      } catch (err) {
        console.error('Error parsing file:', err);
        setError('Could not read that file. Try a .csv, .xls, or .xlsx export.');
      }
    };
    reader.readAsArrayBuffer(file);
    // Allow re-selecting the same file later
    e.target.value = '';
  };

  const handleSubmit = async () => {
    const manualPayload = manualRows
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ name, short_name: name.substring(0, 3).toUpperCase() }));
    const existingPayload = selectedTeamIds.map((team_id) => ({ team_id }));

    const payload = [...existingPayload, ...manualPayload];
    if (payload.length === 0) {
      setError('Add or select at least one team before submitting.');
      return;
    }
    if (!tournamentExternalId) {
      setError('This tournament is missing its scoring-service id — cannot add teams yet.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/tournaments/${tournamentExternalId}/teams/bulk`,
        {
          method: 'POST',
          headers: { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        onTeamsAdded();
        resetAndClose();
      } else {
        const errorData = await response.json().catch(() => null);
        setError(errorData?.error || errorData?.message || 'Failed to add teams');
      }
    } catch (err) {
      console.error('Error adding teams:', err);
      setError('Network error. Failed to add teams');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-[480px] h-[85vh] rounded-[24px] shadow-2xl relative flex flex-col">
        <button
          onClick={resetAndClose}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 transition-colors z-50"
          aria-label="Close modal"
        >
          <X className="w-6 h-6 text-slate-400 hover:text-slate-900" />
        </button>

        {/* Header */}
        <div className="pt-8 px-8 pb-2 text-center shrink-0">
          <div className="w-16 h-16 bg-[#F4F7FE] rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-[#5D5FEF]" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Add Teams</h2>
        </div>

        {/* Body — independently scrollable */}
        <div className="flex-1 overflow-y-auto px-8 pb-6">
          {/* Import Teams */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center gap-2 px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-sm text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Upload className="w-4 h-4" /> Import Teams
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileUpload}
          />
          {fileName && <p className="text-xs text-blue-600 text-center mt-1.5">{fileName}</p>}

          <p className="text-center text-slate-400 text-sm my-3">or</p>

          {/* Add Team Manually */}
          <button
            onClick={toggleManualSection}
            className="w-full flex items-center justify-between gap-2 px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-sm text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4" /> Add Team Manually
            </span>
            {isManualOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {isManualOpen && (
            <div className="max-h-[200px] min-h-[60px] overflow-y-auto border border-slate-200 rounded-xl bg-white p-2.5 mt-2.5 space-y-2">
              {manualRows.map((name, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Team Name"
                    className="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 focus:border-blue-500 outline-none text-sm text-gray-700"
                    value={name}
                    onChange={(e) => updateManualRow(i, e.target.value)}
                  />
                  <button
                    onClick={addManualRow}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg bg-emerald-500 text-white font-bold hover:bg-emerald-600"
                    aria-label="Add another row"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeManualRow(i)}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg bg-red-500 text-white font-bold hover:bg-red-600"
                    aria-label="Remove row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Select Teams */}
          <button
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-sm text-slate-600 hover:bg-slate-100 transition-colors mt-3"
          >
            Select Teams <span>▼</span>
          </button>

          {isDropdownOpen && (
            <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded-xl bg-white mt-2.5">
              {existingTeams.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No existing teams found.</p>
              ) : (
                existingTeams.map((team) => (
                  <label
                    key={team.id}
                    className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 cursor-pointer text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(team.id)}
                      onChange={() => toggleExistingTeam(team.id)}
                    />
                    {team.name}
                  </label>
                ))
              )}
            </div>
          )}

          {error && <p className="text-red-500 text-sm text-center mt-4">{error}</p>}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-[#0F1117] text-white py-3.5 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
