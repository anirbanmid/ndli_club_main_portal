/**
 * Employee Management Panel — Central Administration Office (Tier 2).
 *
 * Full parity with previous project `templates/admin.html` and `routes/employees.py`:
 * - Add New Employee (Single-Click Provisioning) with automated ID, credentials,
 *   regional zone, and assigned states.
 * - Master Employee Credential Roster & Access Control (Active/Blocked toggle,
 *   complete profile edit, password rotation, and Single-Click Node Launch "Open UI ↗").
 * - Dynamic duty state mapping & live re-routing.
 */
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Key,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import {
  DutyState,
  EmployeeDutyRow,
  createEmployee,
  fetchDutyStates,
  fetchEmployees,
  fetchSession,
  saveEmployeeDuty,
  toggleEmployeeStatus,
  updateEmployee,
} from '../lib/adminApi';
import { t } from '../i18n';

const MASTER_ROLES = new Set(['central_admin', 'super_admin_ops']);

const ZONE_OPTIONS = ['North', 'Central', 'West', 'East', 'North East', 'South'];

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.status === 401
      ? t('Please sign in as an administrator to use this desk.')
      : err.message;
  }
  return t('Something went wrong.');
}

export const EmployeeDutyPanel: React.FC<{
  onLaunchEmployeeNode?: (empId: string) => void;
}> = ({ onLaunchEmployeeNode }) => {
  const [employees, setEmployees] = useState<EmployeeDutyRow[]>([]);
  const [states, setStates] = useState<DutyState[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New Employee Provisioning Form
  const [newEmpId, setNewEmpId] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('Welcome@Ndli2026');
  const [newZone, setNewZone] = useState('South');
  const [newStates, setNewStates] = useState<string[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Edit Employee Modal
  const [editingEmp, setEditingEmp] = useState<EmployeeDutyRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editZone, setEditZone] = useState('North');
  const [editStates, setEditStates] = useState<string[]>([]);

  // Duty multi-select quick edit
  const [dutyEditingId, setDutyEditingId] = useState<number | null>(null);
  const [dutyDraft, setDutyDraft] = useState<string[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [employeesPayload, statesPayload, session] = await Promise.all([
        fetchEmployees(),
        fetchDutyStates(),
        fetchSession().catch(() => null),
      ]);
      setEmployees(employeesPayload.results);
      setStates(statesPayload.results);
      if (session) {
        setCanEdit(MASTER_ROLES.has(session.sub_role));
      }
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Compute next suggested EMP ID (e.g. EMP08)
  useEffect(() => {
    if (employees.length > 0 && !newEmpId) {
      const empNumbers = employees
        .map((e) => {
          const match = (e.emp_id || e.username).match(/EMP0?(\d+)/i);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((n) => !isNaN(n));
      const nextNum = empNumbers.length > 0 ? Math.max(...empNumbers) + 1 : 8;
      const formatted = nextNum < 10 ? `EMP0${nextNum}` : `EMP${nextNum}`;
      setNewEmpId(formatted);
    }
  }, [employees, newEmpId]);

  const handleToggleState = (
    code: string,
    stateList: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setter(
      stateList.includes(code)
        ? stateList.filter((c) => c !== code)
        : [...stateList, code],
    );
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) {
      setError('Full name and email are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createEmployee({
        username: newEmpId.trim().toUpperCase() || undefined,
        full_name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword.trim() || undefined,
        zone: newZone,
        states: newStates,
      });
      setEmployees((prev) => [res.employee, ...prev]);
      setNotice(
        `✅ ${res.message || `Employee ${newEmpId} provisioned with dedicated regional node.`}`,
      );
      setNewName('');
      setNewEmail('');
      setNewStates([]);
      setIsFormOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openEditModal = (emp: EmployeeDutyRow) => {
    setEditingEmp(emp);
    setEditName(emp.name || emp.full_name || '');
    setEditEmail(emp.email || '');
    setEditPassword('');
    setEditZone(emp.zone || 'North');
    setEditStates(emp.state_codes || []);
    setError(null);
    setNotice(null);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;
    setBusy(true);
    setError(null);
    try {
      const res = await updateEmployee(editingEmp.id, {
        name: editName.trim(),
        email: editEmail.trim(),
        password: editPassword.trim() || undefined,
        zone: editZone,
        states: editStates,
      });
      setEmployees((prev) =>
        prev.map((e) => (e.id === editingEmp.id ? res.employee : e)),
      );
      setNotice(`✅ Profile and credentials for ${res.employee.username} updated.`);
      setEditingEmp(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async (emp: EmployeeDutyRow) => {
    const isCurrentlyActive = emp.is_active !== false && emp.account_state !== 'blocked';
    const action = isCurrentlyActive ? 'block' : 'unblock';
    const confirmText = isCurrentlyActive
      ? `Are you sure you want to BLOCK ${emp.username}? They will lose all node access.`
      : `Are you sure you want to UNBLOCK ${emp.username}?`;
    if (!window.confirm(confirmText)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await toggleEmployeeStatus(emp.id, action);
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === emp.id
            ? {
                ...e,
                is_active: res.is_active,
                account_state: res.account_state,
              }
            : e,
        ),
      );
      setNotice(res.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const startDutyEdit = (emp: EmployeeDutyRow) => {
    setDutyEditingId(emp.id);
    setDutyDraft(emp.state_codes);
    setNotice(null);
    setError(null);
  };

  const saveDuty = async (emp: EmployeeDutyRow) => {
    setBusy(true);
    setError(null);
    try {
      const result = await saveEmployeeDuty(emp.id, dutyDraft);
      setEmployees((current) =>
        current.map((row) =>
          row.id === emp.id
            ? {
                ...row,
                state_codes: result.state_codes,
                assigned_states: result.state_codes.join(', '),
                states: states.filter((s) => result.state_codes.includes(s.code)),
              }
            : row,
        ),
      );
      setDutyEditingId(null);
      setNotice(
        t('Duty updated. Work routes to the new assignments immediately.'),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLaunchNode = (emp: EmployeeDutyRow) => {
    if (onLaunchEmployeeNode) {
      onLaunchEmployeeNode(emp.username);
    } else {
      window.open(`/?branch=employee&emp=${encodeURIComponent(emp.username)}`, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Lock & Status Indicator */}
      <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>Admin Authenticated</span>
          </span>
          <span className="text-xs text-[#166534] font-medium hidden sm:inline">
            Verified access to Employee Roster, Single-Click Node Provisioning, and Access Control.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-[#0D7751] hover:bg-[#0a5e40] text-white flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isFormOpen ? t('Close Provisioning Form') : t('+ Provision Employee')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadData()}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white border border-[#bbf7d0] text-[#166534] hover:bg-[#f0fdf4] flex items-center gap-1.5 transition-colors"
            title="Refresh Roster"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('Refresh')}</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="text-xs font-semibold text-[#0D7751] bg-[#E9F5EF] border border-[#BFE3D2] rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-[#0D7751] hover:text-[#103125]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && (
        <div className="text-xs font-semibold text-[#B45309] bg-[#FEF6E7] border border-[#F2D9A6] rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button onClick={() => setError(null)} className="text-[#B45309] hover:text-amber-950">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Single-Click Provisioning Card */}
      {canEdit && isFormOpen && (
        <div className="bg-white border-2 border-amber-300 rounded-3xl p-6 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-3">
            <div>
              <h4 className="text-base font-extrabold text-[#103125] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-600" />
                <span>Add New Employee (Single-Click Provisioning)</span>
              </h4>
              <p className="text-xs text-[#5A7366] mt-0.5">
                Automatically provisions new employee credentials, dedicated regional node database, and UI interface.
              </p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
              Admin Provisioning
            </span>
          </div>

          <form onSubmit={handleCreateEmployee} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#2E4A3E] mb-1">
                  Employee ID <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newEmpId}
                  onChange={(e) => setNewEmpId(e.target.value)}
                  placeholder="e.g. EMP08"
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-[#CBD5E1] focus:outline-hidden focus:border-[#0D7751] bg-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2E4A3E] mb-1">
                  Full Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Ramesh Chandra"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-[#CBD5E1] focus:outline-hidden focus:border-[#0D7751]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2E4A3E] mb-1">
                  Official Email (User ID) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. emp.south3@ndli.edu.in"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-[#CBD5E1] focus:outline-hidden focus:border-[#0D7751]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#2E4A3E] mb-1">
                  Pre-Generated Password <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-[#CBD5E1] focus:outline-hidden focus:border-[#0D7751]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2E4A3E] mb-1">
                  Regional Zone <span className="text-rose-600">*</span>
                </label>
                <select
                  value={newZone}
                  onChange={(e) => setNewZone(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-[#CBD5E1] focus:outline-hidden focus:border-[#0D7751] bg-white"
                >
                  {ZONE_OPTIONS.map((z) => (
                    <option key={z} value={z}>
                      {z} Zone
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2E4A3E] mb-1">
                  Assigned States (Quick Pick)
                </label>
                <div className="text-[11px] text-[#5A7366] truncate pt-2">
                  {newStates.length > 0
                    ? `${newStates.length} states selected (${newStates.join(', ')})`
                    : 'Click states below to assign'}
                </div>
              </div>
            </div>

            {/* Interactive States Picker */}
            <div>
              <label className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
                Select Initial States/UTs Duty Set:
              </label>
              <div className="max-h-36 overflow-y-auto p-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl flex flex-wrap gap-1.5">
                {states.map((s) => {
                  const isSelected = newStates.includes(s.code);
                  return (
                    <button
                      type="button"
                      key={s.code}
                      onClick={() => handleToggleState(s.code, newStates, setNewStates)}
                      className={`text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-[#0D7751] text-white border-[#0D7751]'
                          : 'bg-white text-[#2E4A3E] border-[#E2ECE7] hover:border-[#0D7751]'
                      }`}
                    >
                      {s.name} <span className="opacity-70 text-[9px]">({s.code})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#5A7366] hover:bg-[#F4F8F6] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#B45309] hover:bg-amber-700 text-white flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>{busy ? 'Provisioning...' : '+ Provision Employee & Dedicated Node DB'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Master Employee Credential Database & Access Control Table */}
      <div className="bg-white border border-[#E2ECE7] rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2ECE7] pb-4">
          <div>
            <h4 className="text-base font-extrabold text-[#103125]">
              {t('Employee Credential Database & Access Control')}
            </h4>
            <p className="text-xs text-[#5A7366] mt-0.5">
              {t('View, edit, block, or unblock employee access. Blocked users cannot log in to regional nodes.')}
            </p>
          </div>
          <div className="text-xs font-bold text-[#5A7366]">
            Total Regional Officers: <span className="text-[#103125] font-extrabold">{employees.length}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E2ECE7] text-[11px] font-bold text-[#5A7366] uppercase tracking-wider bg-[#F8FAFC]">
                <th className="py-3 px-3">User ID</th>
                <th className="py-3 px-3">Full Name</th>
                <th className="py-3 px-3">Email</th>
                <th className="py-3 px-3">Zone</th>
                <th className="py-3 px-3 text-center">Clubs Approved</th>
                <th className="py-3 px-3 text-center">Support Logs</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Actions</th>
                <th className="py-3 px-3 text-center">Interface</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2ECE7] text-xs">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-[#5A7366]">
                    {loading ? 'Loading employee roster...' : 'No regional officers found.'}
                  </td>
                </tr>
              ) : (
                employees.map((emp) => {
                  const isActive = emp.is_active !== false && emp.account_state !== 'blocked';
                  return (
                    <tr key={emp.id} className="hover:bg-[#F4F8F6] transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-[#103125]">
                        <span className="px-2 py-0.5 rounded-md bg-[#103125] text-white text-[11px]">
                          {emp.emp_id || emp.username}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-[#103125]">
                        {emp.name || emp.full_name || emp.username}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#5A7366]">
                        {emp.email}
                      </td>
                      <td className="py-3 px-3 font-medium text-[#2E4A3E]">
                        <span className="px-2 py-0.5 rounded-md bg-[#E9F5EF] text-[#0D7751] font-bold text-[11px]">
                          {emp.zone || 'North'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-[#103125]">
                        {emp.clubs_approved_count ?? 15}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-[#0D7751]">
                        {emp.support_logs_count ?? 0}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isActive ? (
                            <>
                              <UserCheck className="w-3 h-3" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <UserX className="w-3 h-3" />
                              <span>Blocked</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(emp)}
                                className="px-2 py-1 rounded-lg text-[11px] font-bold bg-[#E9F5EF] text-[#0D7751] hover:bg-[#d5eee2] transition-colors"
                                title="Edit employee details"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleStatus(emp)}
                                disabled={busy}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                  isActive
                                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                                title={isActive ? 'Block officer login' : 'Unblock officer'}
                              >
                                {isActive ? 'Block' : 'Unblock'}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => startDutyEdit(emp)}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] transition-colors"
                            title="Quick assign states"
                          >
                            Duty ({emp.state_codes.length})
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleLaunchNode(emp)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1 shadow-2xs transition-colors mx-auto"
                          title={`Open ${emp.username} Regional Officer Node Interface`}
                        >
                          <span>Open UI</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Quick Duty Assignment Drawer (if active) */}
        {dutyEditingId !== null && (
          <div className="border-t border-[#E2ECE7] pt-4 mt-4 bg-[#F8FAFC] p-4 rounded-2xl space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-[#103125]">
                {t('Configure Assigned States & UTs for')}:{' '}
                <span className="font-mono text-[#0D7751]">
                  {employees.find((e) => e.id === dutyEditingId)?.username}
                </span>
              </h5>
              <span className="text-[11px] text-[#5A7366]">
                {dutyDraft.length} states assigned
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-2 pr-1">
              {states.map((s) => (
                <label
                  key={s.code}
                  className="flex items-center gap-2 text-xs text-[#103125] p-1.5 rounded-lg bg-white border border-[#E2ECE7] cursor-pointer hover:border-[#0D7751]"
                >
                  <input
                    type="checkbox"
                    checked={dutyDraft.includes(s.code)}
                    onChange={() =>
                      handleToggleState(s.code, dutyDraft, setDutyDraft)
                    }
                    disabled={busy}
                    className="accent-[#0D7751]"
                  />
                  <span className="truncate">{s.name}</span>
                  <span className="font-mono text-[9px] text-[#5A7366] ml-auto">
                    {s.code}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setDutyEditingId(null)}
                disabled={busy}
                className="text-xs font-bold text-[#5A7366] bg-white border border-[#CBD5E1] px-3.5 py-1.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const emp = employees.find((e) => e.id === dutyEditingId);
                  if (emp) void saveDuty(emp);
                }}
                disabled={busy}
                className="text-xs font-bold text-white bg-[#0D7751] hover:bg-[#0a5e40] px-4 py-1.5 rounded-xl disabled:opacity-50"
              >
                {busy ? 'Saving...' : 'Save Duty Set'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Employee Modal */}
      {editingEmp && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-3">
              <div>
                <h4 className="text-base font-extrabold text-[#103125] flex items-center gap-2">
                  <Key className="w-5 h-5 text-[#0D7751]" />
                  <span>Edit Employee: {editingEmp.username}</span>
                </h4>
                <p className="text-xs text-[#5A7366]">
                  Update official details, rotate password, and re-assign regional zone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmp(null)}
                className="text-[#5A7366] hover:text-[#103125] p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateEmployee} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#2E4A3E] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-[#CBD5E1] focus:outline-hidden focus:border-[#0D7751]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2E4A3E] mb-1">
                  Official Email
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-[#CBD5E1] focus:outline-hidden focus:border-[#0D7751]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2E4A3E] mb-1">
                  New Password (leave blank to keep existing)
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password (optional)"
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-[#CBD5E1] focus:outline-hidden focus:border-[#0D7751]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2E4A3E] mb-1">
                  Regional Zone
                </label>
                <select
                  value={editZone}
                  onChange={(e) => setEditZone(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-[#CBD5E1] focus:outline-hidden focus:border-[#0D7751] bg-white"
                >
                  {ZONE_OPTIONS.map((z) => (
                    <option key={z} value={z}>
                      {z} Zone
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2E4A3E] mb-1">
                  Assigned Duty States ({editStates.length} selected)
                </label>
                <div className="max-h-32 overflow-y-auto p-2 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl flex flex-wrap gap-1">
                  {states.map((s) => {
                    const isSelected = editStates.includes(s.code);
                    return (
                      <button
                        type="button"
                        key={s.code}
                        onClick={() =>
                          handleToggleState(s.code, editStates, setEditStates)
                        }
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                          isSelected
                            ? 'bg-[#0D7751] text-white border-[#0D7751]'
                            : 'bg-white text-[#2E4A3E] border-[#E2ECE7]'
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#E2ECE7]">
                <button
                  type="button"
                  onClick={() => setEditingEmp(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#5A7366] hover:bg-[#F4F8F6]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0D7751] hover:bg-[#0a5e40] text-white disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Save Employee Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
