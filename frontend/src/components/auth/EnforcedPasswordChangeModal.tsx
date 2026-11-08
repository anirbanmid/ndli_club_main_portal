import React, { useState } from 'react';
import { Lock, ShieldAlert, CheckCircle2, AlertCircle, Loader2, KeyRound } from 'lucide-react';
import { changeAccountPassword, SessionPayload } from '../../lib/authApi';

interface EnforcedPasswordChangeModalProps {
  session: SessionPayload;
  onPasswordChanged: (updatedSession: SessionPayload) => void;
}

export const EnforcedPasswordChangeModal: React.FC<EnforcedPasswordChangeModalProps> = ({
  session,
  onPasswordChanged,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPassword.trim() || !newPassword.trim()) {
      setErrorMsg('Current password and new password are required.');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg('New password cannot be the same as your initial temporary password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New password confirmation does not match.');
      return;
    }

    setBusy(true);
    try {
      const updated = await changeAccountPassword(currentPassword, newPassword);
      setSuccessMsg('Your permanent password has been set successfully! Entering your workspace...');
      setTimeout(() => {
        onPasswordChanged(updated);
      }, 1000);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to update password. Please check your credentials.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-emerald-100 overflow-hidden animate-in zoom-in-95 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white text-center border-b border-emerald-900/40 space-y-2">
          <div className="w-12 h-12 bg-amber-400/20 text-amber-300 rounded-2xl flex items-center justify-center mx-auto border border-amber-300/30">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">First-Login Password Setup</h2>
          <p className="text-xs text-emerald-200">
            Welcome, <strong>{session.username}</strong> ({session.sub_role || 'Sub-Club Coordinator'}).
            For your account security, you must set your private permanent password before continuing.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 font-semibold flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 font-semibold flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Current / Temporary Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter the initial temporary password provided"
                required
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none pr-10"
              />
              <KeyRound className="h-4 w-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              New Private Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none pr-10"
              />
              <Lock className="h-4 w-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Confirm New Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new private password"
                required
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none pr-10"
              />
              <Lock className="h-4 w-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={busy || Boolean(successMsg)}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              <span>Set Permanent Password & Enter Workspace</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
