import React, { useState } from 'react';
import { Mail, AlertCircle, CheckCircle2, Loader2, X, KeyRound } from 'lucide-react';
import { requestForgotPassword } from '../../lib/campusApi';
import { useModalBehavior } from '../../utils/useModalBehavior';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Club Authority' | 'Club Member (Student Only)'>('Club Authority');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useModalBehavior(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Please enter your registered email address.');
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await requestForgotPassword(email.trim(), role);
      setSuccessMsg(res.message);
    } catch (err: any) {
      setErrorMsg(err.message || 'No database found, please register yourself first.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-password-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-emerald-100 overflow-hidden relative">
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-emerald-200 hover:text-white p-1 rounded-full transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-400/30">
              <KeyRound className="h-6 w-6 text-emerald-300" />
            </div>
            <div>
              <h2 id="forgot-password-title" className="text-xl font-bold tracking-tight">
                Reset Password
              </h2>
              <p className="text-xs text-emerald-200">NDLI Institutional Club Portal</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {successMsg ? (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-gray-900">Email Dispatched</h3>
                <p className="text-sm text-gray-700 bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200/60 leading-relaxed font-medium">
                  {successMsg}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full mt-4 py-2.5 px-4 bg-[#103125] hover:bg-[#1A503E] text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-950/20"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div
                  className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-semibold flex items-start space-x-2.5"
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Select Your Portal Role <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all"
                  >
                    <option value="Club Authority">Club Authority (Patron / President / Secretary / Executive)</option>
                    <option value="Club Member (Student Only)">Club Member (Student Only)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Registered Email Address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. librarian@institution.edu.in"
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 px-4 bg-gradient-to-r from-[#103125] to-[#1A503E] hover:from-[#0d281e] hover:to-[#154233] text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-950/20 disabled:opacity-60 flex items-center justify-center space-x-2"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Checking...</span>
                    </>
                  ) : (
                    <span>Check</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
