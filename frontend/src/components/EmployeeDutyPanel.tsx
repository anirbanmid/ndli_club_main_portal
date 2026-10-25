/**
 * Employee Management — the 'Assigned States & UTs' multi-select (M6 D5).
 *
 * Client change (2026-10-25): duty is a SET of States/UTs held in
 * OfficerAssignment rows; saving re-routes work immediately. Owner decision
 * (2026-10-26): every admin may VIEW who handles which states (coordination);
 * only the master roles (central_admin / super_admin_ops) may EDIT — and a
 * regional officer never edits their own duty.
 */
import React, { useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import {
  EmployeeDutyRow,
  DutyState,
  fetchDutyStates,
  fetchEmployees,
  fetchSession,
  saveEmployeeDuty,
} from '../lib/adminApi';
import { t } from '../i18n';

const MASTER_ROLES = new Set(['central_admin', 'super_admin_ops']);

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : t('Something went wrong.');
}

export const EmployeeDutyPanel: React.FC = () => {
  const [employees, setEmployees] = useState<EmployeeDutyRow[]>([]);
  const [states, setStates] = useState<DutyState[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [employeesPayload, statesPayload] = await Promise.all([
          fetchEmployees(),
          fetchDutyStates(),
        ]);
        if (cancelled) return;
        setEmployees(employeesPayload.results);
        setStates(statesPayload.results);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
      try {
        const session = await fetchSession();
        if (!cancelled) setCanEdit(MASTER_ROLES.has(session.sub_role));
      } catch {
        /* view-only fallback: the server enforces the write door anyway */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startEdit = (emp: EmployeeDutyRow) => {
    setEditingId(emp.id);
    setDraft(emp.state_codes);
    setNotice(null);
    setError(null);
  };

  const toggleCode = (code: string) => {
    setDraft((current) =>
      current.includes(code)
        ? current.filter((c) => c !== code)
        : [...current, code],
    );
  };

  const save = async (emp: EmployeeDutyRow) => {
    setBusy(true);
    setError(null);
    try {
      const result = await saveEmployeeDuty(emp.id, draft);
      setEmployees((current) =>
        current.map((row) =>
          row.id === emp.id
            ? {
                ...row,
                state_codes: result.state_codes,
                states: states.filter((s) => result.state_codes.includes(s.code)),
              }
            : row,
        ),
      );
      setEditingId(null);
      setNotice(
        t('Duty updated. Work routes to the new assignments immediately.'),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#103125]">
            {t('Employee Management — Assigned States & UTs')}
          </h3>
          <p className="text-xs text-[#5A7366]">
            {t('Duty is a set of States/UTs. Saving re-routes club, renewal and grievance work immediately.')}
          </p>
        </div>
        <div className="text-[11px] font-bold uppercase px-2 py-1 rounded bg-[#E9F5EF] text-[#0D7751]">
          {canEdit ? t('You can edit duty') : t('View only')}
        </div>
      </div>

      {notice && (
        <div className="text-xs font-semibold text-[#0D7751] bg-[#E9F5EF] border border-[#BFE3D2] rounded-xl px-4 py-2">
          {notice}
        </div>
      )}
      {error && (
        <div className="text-xs font-semibold text-[#B45309] bg-[#FEF6E7] border border-[#F2D9A6] rounded-xl px-4 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {employees.map((emp) => (
          <div
            key={emp.id}
            className="p-5 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] space-y-3"
          >
            <div className="flex justify-between items-center">
              <span className="font-mono text-xs font-bold text-white bg-[#103125] px-2 py-0.5 rounded">
                {emp.username}
              </span>
              <span className="text-[11px] font-bold text-[#0D7751] bg-[#E9F5EF] px-2 py-0.5 rounded">
                {emp.state_codes.length} {t('States/UTs')}
              </span>
            </div>

            <div>
              <h4 className="font-bold text-sm text-[#103125]">{emp.name}</h4>
              <div className="text-xs font-mono text-[#5A7366]">{emp.email}</div>
            </div>

            <div className="text-[11px] text-[#5A7366]">
              <strong>{t('States:')}</strong>{' '}
              {emp.states.length > 0
                ? emp.states.map((s) => s.name).join(', ')
                : t('No duty assigned')}
            </div>

            {canEdit && editingId !== emp.id && (
              <button
                type="button"
                onClick={() => startEdit(emp)}
                className="text-xs font-bold text-white bg-[#0D7751] px-3 py-1.5 rounded-lg"
              >
                {t('Edit duty')}
              </button>
            )}

            {canEdit && editingId === emp.id && (
              <div className="space-y-2 border-t border-[#E2ECE7] pt-3">
                <div className="text-[11px] font-bold text-[#103125]">
                  {t('Select the States/UTs this employee handles:')}
                </div>
                <div className="max-h-52 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 pr-1">
                  {states.map((s) => (
                    <label
                      key={s.code}
                      className="flex items-center gap-2 text-[11px] text-[#103125]"
                    >
                      <input
                        type="checkbox"
                        checked={draft.includes(s.code)}
                        onChange={() => toggleCode(s.code)}
                        disabled={busy}
                      />
                      <span>{s.name}</span>
                      <span className="font-mono text-[9px] text-[#5A7366]">
                        {s.code}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => save(emp)}
                    disabled={busy}
                    className="text-xs font-bold text-white bg-[#0D7751] px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {busy ? t('Saving…') : t('Save duty')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    disabled={busy}
                    className="text-xs font-bold text-[#5A7366] bg-[#E9F5EF] px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {t('Cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
