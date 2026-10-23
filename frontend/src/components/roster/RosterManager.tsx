/**
 * NDLI Club Main Portal — M5-D4 club roster manager (BRIEF_M5 §3 D4).
 *
 * Replaces the M0 demo roster tab (client-side CSV paste + a faked
 * "Successfully imported N students" toast) with the REAL M4-D4 surface:
 * every number on screen is a server response.
 *
 * Contract behaviour this view owns (lib/rosterApi.ts pins the details):
 * - The list is SCOPED by the server (W6). A club authority sees their own
 *   club's rows; a student sees only their own. The count shown is the
 *   server's `total`, never a client recount.
 * - Inline edits are single-field + optimistic-locked: the write carries the
 *   row `version`, and a 409 `version_conflict` ADOPTS the server's `current`
 *   row instead of retrying or overwriting (P2 / W6).
 * - Import is a three-step wizard and NEVER fakes completion (P5, BRIEF_M5
 *   §3 D4): upload -> DRY-RUN preview (writes nothing) -> explicit confirm ->
 *   the commit job's own report. The summary shows the job's totals verbatim,
 *   flags a `replayed` no-op commit as a no-op, and lists every failing row
 *   with its server `reason` code.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileUp, Loader2, Pencil, Plus, Search, Upload, X } from 'lucide-react';

import { t } from '../../i18n';
import { useModalBehavior } from '../../utils/useModalBehavior';
import { ApiError } from '../../lib/api';
import {
  CONTRACT_COLUMNS,
  DryRunResult,
  EditableField,
  ImportJob,
  ROSTER_ROLES,
  ROSTER_STATUSES,
  RosterApiError,
  RosterEntry,
  RosterStatus,
  VALID_TRANSITIONS,
  addRosterEntry,
  changeRosterStatus,
  commitRosterCsv,
  downloadRosterCsv,
  dryRunRosterCsv,
  listRoster,
  patchRosterField,
  reasonLabel,
  uploadRosterCsv,
} from '../../lib/rosterApi';

// --- Small presentational helpers ------------------------------------------

const badge = (tone: 'ok' | 'warn' | 'mute' | 'danger'): string => {
  if (tone === 'ok') return 'bg-[#E9F5EF] text-[#0D7751] border-[#0D7751]/20';
  if (tone === 'warn') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (tone === 'danger') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-[#F4F8F6] text-[#5A7366] border-[#E2ECE7]';
};

const statusTone = (status: RosterStatus): 'ok' | 'warn' | 'mute' =>
  status === 'active' ? 'ok' : status === 'suspended' ? 'warn' : 'mute';

const roleTone = (role: string): 'ok' | 'warn' | 'mute' =>
  role === 'core_team' ? 'ok' : role === 'volunteer' ? 'warn' : 'mute';

// --- Inline cell editor ----------------------------------------------------

interface CellEditorProps {
  entry: RosterEntry;
  field: EditableField;
  onCancel: () => void;
  onSave: (entry: RosterEntry, field: EditableField, value: string | null) => void;
  busy: boolean;
}

const CellEditor: React.FC<CellEditorProps> = ({ entry, field, onCancel, onSave, busy }) => {
  const initial = field === 'batch_year' ? (entry.batch_year === null ? '' : String(entry.batch_year)) : entry[field];
  const [value, setValue] = useState(String(initial ?? ''));
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (busy) return;
    const trimmed = value.trim();
    if (trimmed === String(initial ?? '')) {
      onCancel();
      return;
    }
    onSave(entry, field, trimmed === '' ? null : trimmed);
  };

  if (field === 'role') {
    return (
      <select
        value={value}
        disabled={busy}
        onChange={(e) => {
          setValue(e.target.value);
          onSave(entry, 'role', e.target.value);
        }}
        onBlur={onCancel}
        className="w-full min-w-[8rem] px-1.5 py-1 text-[11px] rounded-lg border border-[#0D7751]/40 bg-white focus:ring-2 focus:ring-[#0D7751]"
      >
        {ROSTER_ROLES.map((role) => (
          <option key={role} value={role}>
            {t(role)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={ref}
      value={value}
      disabled={busy}
      inputMode={field === 'batch_year' ? 'numeric' : undefined}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
      }}
      className="w-full min-w-[7rem] px-1.5 py-1 text-[11px] rounded-lg border border-[#0D7751]/40 bg-white focus:ring-2 focus:ring-[#0D7751]"
    />
  );
};

// --- Add-row dialog --------------------------------------------------------

interface AddDialogProps {
  onClose: () => void;
  onAdded: (entry: RosterEntry) => void;
}

const AddStudentDialog: React.FC<AddDialogProps> = ({ onClose, onAdded }) => {
  const [cells, setCells] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useModalBehavior(true, onClose);

  const set = (column: string, value: string) => setCells((prev) => ({ ...prev, [column]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const entry = await addRosterEntry(Object.fromEntries(CONTRACT_COLUMNS.map((c) => [c, cells[c] ?? ''])));
      onAdded(entry);
    } catch (err) {
      setError(err instanceof RosterApiError ? t(err.message) : t('That request failed.'));
    } finally {
      setBusy(false);
    }
  };

  const placeholders: Record<string, string> = {
    name: t('Full name'),
    email: 'student@example.edu',
    phone: '9876543210',
    admission_no: '22CS30045',
    program: 'B.Tech Computer Science',
    batch_year: '2026',
    role: 'member',
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-xs p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('Add student to roster')}
        tabIndex={-1}
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E2ECE7] space-y-4 animate-in fade-in max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#103125]">{t('Add student to roster')}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-[#F4F8F6] rounded-lg" aria-label={t('Close')}>
            <X className="h-4 w-4 text-[#5A7366]" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3 text-xs">
          {CONTRACT_COLUMNS.map((column) => (
            <label key={column} className="block space-y-1">
              <span className="font-bold text-[#2E4A3E]">
                {t(column)}
                {column === 'name' ? '' : ` (${t('optional')})`}
              </span>
              <input
                value={cells[column] ?? ''}
                onChange={(e) => set(column, e.target.value)}
                placeholder={placeholders[column]}
                disabled={busy}
                required={column === 'name'}
                className="w-full px-3 py-2 rounded-xl border border-[#E2ECE7] bg-[#F4F8F6] focus:ring-2 focus:ring-[#0D7751] focus:outline-hidden"
              />
            </label>
          ))}

          <p className="text-[11px] text-[#5A7366]">
            {t('Admission number or email is required. Role defaults to member when left blank.')}
          </p>

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-lg font-semibold">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-xs font-bold text-[#5A7366] hover:bg-[#F4F8F6]"
            >
              {t('Cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-lg bg-[#1A503E] text-white text-xs font-bold shadow-xs hover:bg-[#103125] disabled:opacity-60 flex items-center gap-1.5"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('Save to roster')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Bulk CSV import wizard -------------------------------------------------

interface ImportDialogProps {
  onClose: () => void;
  onImported: () => void;
}

type ImportStep = 'pick' | 'preview' | 'result';

const ImportDialog: React.FC<ImportDialogProps> = ({ onClose, onImported }) => {
  const [step, setStep] = useState<ImportStep>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [receipt, setReceipt] = useState<{ upload_id: string; size_bytes: number } | null>(null);

  useModalBehavior(true, onClose);

  const fail = (err: unknown) => {
    setError(err instanceof RosterApiError ? t(err.message) : t('That request failed.'));
  };

  const handleFile = async (picked: File) => {
    setFile(picked);
    setError(null);
    setBusy(true);
    try {
      const uploaded = await uploadRosterCsv(picked);
      setReceipt({ upload_id: uploaded.upload_id, size_bytes: uploaded.size_bytes });
      const preview = await dryRunRosterCsv(uploaded.upload_id);
      setDryRun(preview);
      setStep('preview');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    if (!receipt) return;
    setBusy(true);
    setError(null);
    try {
      const result = await commitRosterCsv(receipt.upload_id);
      setJob(result);
      setStep('result');
      onImported();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const rows = step === 'preview' ? (dryRun?.rows ?? []) : (job?.row_report ?? []);
  const problemRows = rows.filter((row) => row.status !== 'ok');

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-xs p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('Bulk import roster from CSV')}
        tabIndex={-1}
        className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-[#E2ECE7] space-y-4 animate-in fade-in max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-3">
          <h3 className="text-base font-bold text-[#103125]">{t('Bulk import roster from CSV')}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-[#F4F8F6] rounded-lg" aria-label={t('Close')}>
            <X className="h-4 w-4 text-[#5A7366]" />
          </button>
        </div>

        {/* Step indicator */}
        <ol className="flex items-center gap-2 text-[11px] font-bold text-[#5A7366]">
          {[
            { key: 'pick', label: t('1. Choose file') },
            { key: 'preview', label: t('2. Review dry-run') },
            { key: 'result', label: t('3. Result') },
          ].map((item) => (
            <li
              key={item.key}
              className={`px-2.5 py-1 rounded-full border ${
                step === item.key
                  ? 'bg-[#E9F5EF] text-[#0D7751] border-[#0D7751]/30'
                  : 'bg-white border-[#E2ECE7]'
              }`}
            >
              {item.label}
            </li>
          ))}
        </ol>

        {/* STEP 1 — pick */}
        {step === 'pick' && (
          <div className="space-y-3">
            <p className="text-xs text-[#5A7366]">
              {t('The file must use the exact template header. Nothing is written until you confirm the dry-run.')}
            </p>
            <div className="text-[11px] text-[#2E4A3E] font-mono bg-[#F4F8F6] border border-[#E2ECE7] rounded-lg p-2.5 overflow-x-auto">
              {CONTRACT_COLUMNS.join(',')}
            </div>
            <button
              type="button"
              onClick={() => downloadRosterCsv('template')}
              className="text-xs text-[#0D7751] font-bold hover:underline inline-flex items-center gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              {t('Download the import template')}
            </button>

            <label className="block border-2 border-dashed border-[#E2ECE7] rounded-2xl p-8 text-center cursor-pointer hover:border-[#0D7751]/40 hover:bg-[#F4F8F6]/60 transition-colors">
              <FileUp className="h-7 w-7 mx-auto text-[#0D7751] mb-2" />
              <span className="block text-xs font-bold text-[#103125]">
                {busy ? t('Uploading and checking…') : t('Choose a .csv file')}
              </span>
              <span className="block text-[11px] text-[#5A7366] mt-1">
                {t('UTF-8, comma delimited, up to 10,000 rows')}
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                className="sr-only"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) void handleFile(picked);
                }}
              />
            </label>
          </div>
        )}

        {/* STEP 2 — dry-run preview (nothing written yet) */}
        {step === 'preview' && dryRun && (
          <div className="space-y-4">
            <div className="text-xs text-[#2E4A3E] bg-[#F4F8F6] border border-[#E2ECE7] rounded-xl p-3">
              {file?.name} · {(receipt?.size_bytes ?? 0).toLocaleString()} {t('bytes')}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t('Rows in file'), value: dryRun.totals.total, tone: 'mute' as const },
                { label: t('Will import'), value: dryRun.totals.ok, tone: 'ok' as const },
                { label: t('Will be skipped (duplicate)'), value: dryRun.totals.duplicates, tone: 'warn' as const },
                { label: t('Will be rejected'), value: dryRun.totals.errors, tone: 'danger' as const },
              ].map((cell) => (
                <div key={cell.label} className={`rounded-xl border p-3 ${badge(cell.tone)}`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{cell.label}</div>
                  <div className="text-xl font-extrabold">{cell.value.toLocaleString()}</div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-[#5A7366]">
              {t('Dry-run only — no roster row has been created yet.')}
            </p>

            {problemRows.length > 0 && (
              <div className="border border-[#E2ECE7] rounded-2xl overflow-hidden">
                <div className="px-3 py-2 bg-rose-50 text-rose-700 text-[11px] font-bold uppercase tracking-wider">
                  {t('Rows that will not import')}
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-[11px] divide-y divide-[#E2ECE7]">
                    <thead className="bg-[#F4F8F6] text-[#5A7366] uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2 px-3">{t('Row')}</th>
                        <th className="py-2 px-3">{t('Fate')}</th>
                        <th className="py-2 px-3">{t('Reason')}</th>
                        <th className="py-2 px-3">{t('Name')}</th>
                        <th className="py-2 px-3">{t('Email')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
                      {problemRows.map((row) => (
                        <tr key={`${row.row}-${row.reason}`} className="align-top">
                          <td className="py-2 px-3 font-mono">{row.row}</td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${badge(row.status === 'duplicate' ? 'warn' : 'danger')}`}>
                              {row.status === 'duplicate' ? t('Duplicate') : t('Error')}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-semibold">{t(reasonLabel(row.reason))}</td>
                          <td className="py-2 px-3">{String(row.data.name ?? '')}</td>
                          <td className="py-2 px-3">{String(row.data.email ?? '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep('pick');
                  setDryRun(null);
                  setReceipt(null);
                  setFile(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold text-[#5A7366] hover:bg-[#F4F8F6]"
              >
                {t('Choose another file')}
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={busy || dryRun.totals.ok === 0}
                className="px-5 py-2 rounded-lg bg-[#1A503E] text-white text-xs font-bold shadow-xs hover:bg-[#103125] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {dryRun.totals.ok === 0 ? t('Nothing to import') : t(`Import ${dryRun.totals.ok} rows`)}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — the server's own report */}
        {step === 'result' && job && (
          <div className="space-y-4">
            {job.replayed && (
              <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                {t('Already imported. This exact file was committed before, so nothing changed.')}
              </div>
            )}

            <div className={`text-xs font-bold rounded-xl p-3 border ${job.status === 'completed' ? badge('ok') : badge('danger')}`}>
              {job.status === 'completed'
                ? t('Import finished. The numbers below come from the import job.')
                : t('Import did not finish. No rows were guaranteed to be written.')}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t('Rows processed'), value: job.totals.total, tone: 'mute' as const },
                { label: t('Imported'), value: job.totals.ok, tone: 'ok' as const },
                { label: t('Duplicated'), value: job.totals.duplicates, tone: 'warn' as const },
                { label: t('Rejected'), value: job.totals.errors, tone: 'danger' as const },
              ].map((cell) => (
                <div key={cell.label} className={`rounded-xl border p-3 ${badge(cell.tone)}`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{cell.label}</div>
                  <div className="text-xl font-extrabold">{cell.value.toLocaleString()}</div>
                </div>
              ))}
            </div>

            {problemRows.length > 0 && (
              <div className="border border-[#E2ECE7] rounded-2xl overflow-hidden">
                <div className="px-3 py-2 bg-[#F4F8F6] text-[#103125] text-[11px] font-bold uppercase tracking-wider">
                  {t('Row report')}
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-[11px] divide-y divide-[#E2ECE7]">
                    <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
                      {problemRows.map((row) => (
                        <tr key={`${row.row}-${row.reason}`}>
                          <td className="py-2 px-3 font-mono w-14">{row.row}</td>
                          <td className="py-2 px-3">{t(reasonLabel(row.reason))}</td>
                          <td className="py-2 px-3">{String(row.data.name ?? '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-[#1A503E] text-white text-xs font-bold shadow-xs hover:bg-[#103125]"
              >
                {t('Done')}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-lg font-semibold">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

// --- The manager ------------------------------------------------------------

type SortKey = 'name' | 'admission_no' | 'program' | 'batch_year' | 'role' | 'status' | 'updated_at';

interface RosterManagerProps {}

export const RosterManager: React.FC<RosterManagerProps> = () => {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<RosterEntry | null>(null);
  const [allowed, setAllowed] = useState<RosterStatus[] | null>(null);

  const [statusFilter, setStatusFilter] = useState<RosterStatus | ''>('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const [editing, setEditing] = useState<{ id: number; field: EditableField } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    listRoster({ status: statusFilter || undefined })
      .then((page) => {
        setEntries(page.entries);
        setTotal(page.total);
      })
      .catch((err: unknown) => {
        if (err instanceof RosterApiError) {
          setError(
            err.status === 403 || err.status === 404
              ? t('Roster access is limited to this club.')
              : err.message,
          );
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError(t('That request failed.'));
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? entries.filter((entry) =>
          [entry.name, entry.email, entry.admission_no, entry.program, entry.phone].some((value) =>
            value.toLowerCase().includes(needle),
          ),
        )
      : entries;
    const sorted = [...filtered].sort((a, b) => {
      const left = a[sortKey] ?? '';
      const right = b[sortKey] ?? '';
      if (typeof left === 'number' && typeof right === 'number') return left - right;
      return String(left).localeCompare(String(right));
    });
    return sortAsc ? sorted : sorted.reverse();
  }, [entries, search, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((asc) => !asc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const adoptRow = (updated: RosterEntry) => {
    setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
    setConflict(null);
  };

  const saveField = async (entry: RosterEntry, field: EditableField, value: string | null) => {
    setBusyId(entry.id);
    setError(null);
    setConflict(null);
    setAllowed(null);
    try {
      const updated = await patchRosterField(entry.id, field, value, entry.version);
      adoptRow(updated);
      setEditing(null);
    } catch (err) {
      if (err instanceof RosterApiError && err.code === 'version_conflict' && err.current) {
        setConflict(err.current);
        setEntries((prev) => prev.map((row) => (row.id === err.current!.id ? err.current! : row)));
        setEditing(null);
      } else if (err instanceof RosterApiError && err.code === 'invalid_transition') {
        setAllowed(err.allowed);
      } else {
        setError(err instanceof RosterApiError ? t(err.message) : t('That request failed.'));
      }
      setEditing(null);
    } finally {
      setBusyId(null);
    }
  };

  const moveStatus = async (entry: RosterEntry, status: RosterStatus) => {
    setBusyId(entry.id);
    setError(null);
    setConflict(null);
    setAllowed(null);
    try {
      const updated = await changeRosterStatus(entry.id, status, entry.version);
      adoptRow(updated);
    } catch (err) {
      if (err instanceof RosterApiError && err.code === 'version_conflict' && err.current) {
        setConflict(err.current);
        setEntries((prev) => prev.map((row) => (row.id === err.current!.id ? err.current! : row)));
      } else if (err instanceof RosterApiError && err.code === 'invalid_transition') {
        setAllowed(err.allowed);
        setError(err.message);
      } else {
        setError(err instanceof RosterApiError ? t(err.message) : t('That request failed.'));
      }
    } finally {
      setBusyId(null);
    }
  };

  const sortHeader = (key: SortKey, label: string) => (
    <th className="py-3 px-4">
      <button type="button" onClick={() => toggleSort(key)} className="uppercase tracking-wider hover:text-[#0D7751]">
        {label}
        <span className="ml-1 text-[9px]">{sortKey === key ? (sortAsc ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );

  return (
    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-4">
        <div>
          <h3 className="text-lg font-bold text-[#103125] flex items-center space-x-2">
            <span>{t('Student Member Enrollment & Roster Management')}</span>
          </h3>
          <p className="text-xs text-[#5A7366] mt-0.5">
            {t('Live roster. Inline edits are single-field and checked against the server on save.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadRosterCsv('export')}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F4F8F6] text-[#2E4A3E] text-xs font-bold flex items-center space-x-1.5 transition-colors border border-[#E2ECE7]"
          >
            <Download className="h-4 w-4" />
            <span>{t('Export CSV')}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="px-3.5 py-2 rounded-xl bg-[#E9F5EF] hover:bg-[#d3ede0] text-[#0D7751] text-xs font-bold flex items-center space-x-1.5 transition-colors border border-[#0D7751]/30"
          >
            <Upload className="h-4 w-4" />
            <span>{t('Bulk CSV Upload')}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>{t('Add Student')}</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#5A7366]" />
          <input
            type="text"
            placeholder={t('Search by name, admission no, program...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-[#E2ECE7] bg-[#F4F8F6] focus:ring-2 focus:ring-[#0D7751] focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RosterStatus | '')}
            className="px-3 py-2 text-xs rounded-xl border border-[#E2ECE7] bg-[#F4F8F6] focus:ring-2 focus:ring-[#0D7751]"
            aria-label={t('Filter by status')}
          >
            <option value="">{t('All statuses')}</option>
            {ROSTER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(status)}
              </option>
            ))}
          </select>
          <div className="text-xs font-semibold text-[#5A7366]">
            {t('Showing')} <span className="font-bold text-[#103125]">{visible.length}</span> {t('of')}{' '}
            <span className="font-bold text-[#103125]">{total}</span> {t('rows')}
          </div>
        </div>
      </div>

      {/* Server-side conflict / error banners */}
      {conflict && (
        <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
          {t('The row changed since you loaded it. The table now shows the server version — please re-apply your edit.')}
          <button type="button" onClick={() => setConflict(null)} className="ml-2 underline">
            {t('Dismiss')}
          </button>
        </div>
      )}
      {allowed && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
          {t('Allowed from here:')} {allowed.map((s) => t(s)).join(', ') || t('none (terminal status)')}
        </div>
      )}
      {error && (
        <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
        <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
          <thead className="bg-[#F4F8F6] text-[#5A7366] font-bold uppercase tracking-wider text-[11px]">
            <tr>
              {sortHeader('name', t('Name'))}
              {sortHeader('admission_no', t('Admission No'))}
              <th className="py-3 px-4">{t('Contact')}</th>
              {sortHeader('program', t('Program'))}
              {sortHeader('batch_year', t('Batch'))}
              {sortHeader('role', t('Role'))}
              {sortHeader('status', t('Status'))}
              {sortHeader('updated_at', t('Updated'))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
            {loading && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-[#5A7366]">
                  <Loader2 className="h-4 w-4 inline animate-spin mr-2" />
                  {t('Loading roster…')}
                </td>
              </tr>
            )}

            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[#5A7366]">
                  {search || statusFilter
                    ? t('No roster row matches this filter.')
                    : t('This roster is empty. Add a student or import a CSV.')}
                </td>
              </tr>
            )}

            {!loading &&
              visible.map((entry) => {
                const busy = busyId === entry.id;
                const next = VALID_TRANSITIONS[entry.status];
                return (
                  <tr key={entry.id} className="hover:bg-[#F4F8F6]/60 transition-colors align-top">
                    <td className="py-3 px-4 font-bold text-[#103125]">
                      {editing?.id === entry.id && editing.field === 'name' ? (
                        <CellEditor entry={entry} field="name" busy={busy} onCancel={() => setEditing(null)} onSave={saveField} />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditing({ id: entry.id, field: 'name' })}
                          className="text-left hover:text-[#0D7751] group"
                          title={t('Edit name')}
                        >
                          {entry.name}
                          <Pencil className="h-3 w-3 inline ml-1 opacity-0 group-hover:opacity-60" />
                        </button>
                      )}
                      {entry.user_id && (
                        <span className="block font-normal text-[11px] text-[#5A7366]">{t('linked account')}</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono font-semibold text-[#2E4A3E]">
                      {editing?.id === entry.id && editing.field === 'admission_no' ? (
                        <CellEditor entry={entry} field="admission_no" busy={busy} onCancel={() => setEditing(null)} onSave={saveField} />
                      ) : (
                        <button type="button" onClick={() => setEditing({ id: entry.id, field: 'admission_no' })} className="hover:text-[#0D7751]">
                          {entry.admission_no || <span className="text-[#5A7366] italic font-normal">{t('—')}</span>}
                        </button>
                      )}
                    </td>

                    <td className="py-3 px-4 text-[#5A7366]">
                      {editing?.id === entry.id && editing.field === 'email' ? (
                        <CellEditor entry={entry} field="email" busy={busy} onCancel={() => setEditing(null)} onSave={saveField} />
                      ) : (
                        <button type="button" onClick={() => setEditing({ id: entry.id, field: 'email' })} className="hover:text-[#0D7751] block text-left">
                          {entry.email || <span className="italic">{t('no email')}</span>}
                        </button>
                      )}
                      {editing?.id === entry.id && editing.field === 'phone' ? (
                        <CellEditor entry={entry} field="phone" busy={busy} onCancel={() => setEditing(null)} onSave={saveField} />
                      ) : (
                        <button type="button" onClick={() => setEditing({ id: entry.id, field: 'phone' })} className="hover:text-[#0D7751] block text-left font-mono text-[11px]">
                          {entry.phone || <span className="italic font-sans">{t('no phone')}</span>}
                        </button>
                      )}
                    </td>

                    <td className="py-3 px-4 text-[#5A7366]">
                      {editing?.id === entry.id && editing.field === 'program' ? (
                        <CellEditor entry={entry} field="program" busy={busy} onCancel={() => setEditing(null)} onSave={saveField} />
                      ) : (
                        <button type="button" onClick={() => setEditing({ id: entry.id, field: 'program' })} className="hover:text-[#0D7751] text-left">
                          {entry.program || <span className="italic">{t('—')}</span>}
                        </button>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono">
                      {editing?.id === entry.id && editing.field === 'batch_year' ? (
                        <CellEditor entry={entry} field="batch_year" busy={busy} onCancel={() => setEditing(null)} onSave={saveField} />
                      ) : (
                        <button type="button" onClick={() => setEditing({ id: entry.id, field: 'batch_year' })} className="hover:text-[#0D7751]">
                          {entry.batch_year ?? <span className="text-[#5A7366] italic font-sans">{t('—')}</span>}
                        </button>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {editing?.id === entry.id && editing.field === 'role' ? (
                        <CellEditor entry={entry} field="role" busy={busy} onCancel={() => setEditing(null)} onSave={saveField} />
                      ) : (
                        <button type="button" onClick={() => setEditing({ id: entry.id, field: 'role' })} className="text-left w-full">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${badge(roleTone(entry.role))}`}>
                            {t(entry.role)}
                          </span>
                        </button>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {next.length > 0 ? (
                        <select
                          value={entry.status}
                          disabled={busy}
                          onChange={(e) => void moveStatus(entry, e.target.value as RosterStatus)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${badge(statusTone(entry.status))}`}
                          aria-label={t('Change status')}
                        >
                          <option value={entry.status}>{t(entry.status)}</option>
                          {next.map((status) => (
                            <option key={status} value={status}>
                              {t(status)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${badge(statusTone(entry.status))}`}>
                          {t(entry.status)}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-[11px] text-[#5A7366] font-mono">
                      {new Date(entry.updated_at).toLocaleDateString()}
                      <span className="block opacity-70">v{entry.version}</span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddStudentDialog
          onClose={() => setShowAdd(false)}
          onAdded={(entry) => {
            setEntries((prev) => [entry, ...prev]);
            setTotal((count) => count + 1);
            setShowAdd(false);
          }}
        />
      )}

      {showImport && <ImportDialog onClose={() => setShowImport(false)} onImported={() => void load()} />}
    </div>
  );
};

export default RosterManager;
