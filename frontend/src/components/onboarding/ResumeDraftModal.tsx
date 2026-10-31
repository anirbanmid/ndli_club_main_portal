import React, { useState } from 'react';
import { KeyRound, X, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { resumeDraft, DraftPayload } from '../../lib/onboardingApi';
import { saveResumeCapability } from '../../lib/onboardingResume';
import { useModalBehavior } from '../../utils/useModalBehavior';

interface ResumeDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDraftResumed: (draft: DraftPayload, token: string) => void;
}

export const ResumeDraftModal: React.FC<ResumeDraftModalProps> = ({
  isOpen,
  onClose,
  onDraftResumed,
}) => {
  const [tokenInput, setTokenInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useModalBehavior(isOpen, onClose);

  if (!isOpen) return null;

  const handleResume = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = tokenInput.trim();
    if (!cleanToken) {
      setErrorMsg('Please enter your 7-day resume token.');
      return;
    }

    setBusy(true);
    setErrorMsg(null);

    try {
      const draft = await resumeDraft(cleanToken);
      saveResumeCapability({ token: cleanToken, draftId: draft.id });
      onDraftResumed(draft, cleanToken);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Draft not found or resume token has expired after 7 days.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-draft-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-emerald-100 overflow-hidden relative">
        <div className="bg-gradient-to-r from-[#103125] to-[#1A503E] p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-emerald-200 hover:text-white p-1 rounded-full transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-400/30">
              <KeyRound className="h-6 w-6 text-emerald-300" />
            </div>
            <div>
              <h2 id="resume-draft-title" className="text-xl font-bold tracking-tight">
                Resume Application
              </h2>
              <p className="text-xs text-emerald-200">7-Day Auto-Save Token Engine</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleResume} className="p-6 space-y-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            Enter the 24–32 character resume token generated when you started your Institutional Club application.
          </p>

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
              Resume Token <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="e.g. sK9_xL02mN..."
              required
              autoFocus
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all"
            />
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
                  <span>Locating Draft...</span>
                </>
              ) : (
                <>
                  <span>Restore My Application</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
