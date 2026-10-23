import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from 'lucide-react';
import { t } from '../../i18n';
import {
  checkCombinedDocument,
  DraftPayload,
  readFileHead,
  uploadDocument,
  UploadRejection,
} from '../../lib/onboardingApi';
import { flowErrorFrom, flowErrorText, WizardFlowError } from './wizardSteps';

/**
 * One upload surface of the onboarding document step (M5-D2, maps to M4-D2
 * W3). Client-side validation MIRRORS the server rules (services.
 * store_combined_document): extension, claimed MIME, size and magic-byte
 * agreement — in the server's rule order and with the server's exact verdict
 * bytes. Server-rule rejections render VERBATIM (F4); the client-only JPEG
 * constraint of the signature surface renders through t().
 *
 * The server keeps ONE document per draft (M4 owner decision): any upload
 * REPLACES the stored file, so a replace is always an explicit, user-visible
 * confirmation. Mutations never auto-retry (P5) — a failed upload surfaces
 * with a manual "Try again".
 */

interface UploadSurfaceProps {
  /** Always 'document' — the combined authority doc (jpeg/pdf). PI-signature surface removed (DEC1). */
  surface: 'document';
  draftId: string;
  token: string;
  /** Server truth: draft.document_uploaded (P4 — rendered, never recomputed). */
  documentUploaded: boolean;
  onUploaded: (draft: DraftPayload) => void;
}

export const UploadSurface: React.FC<UploadSurfaceProps> = ({
  surface,
  draftId,
  token,
  documentUploaded,
  onUploaded,
}) => {
  const [rejection, setRejection] = useState<UploadRejection | null>(null);
  const [error, setError] = useState<WizardFlowError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<File | null>(null);

  const inputId = `upload-${surface}`;

  const doUpload = async (file: File): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setRejection(null);
    try {
      const updated = await uploadDocument(draftId, token, file);
      onUploaded(updated);
      setLastFile(file);
      setNotice(t('Stored on the server.'));
    } catch (err) {
      setLastFile(file);
      setError(flowErrorFrom(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File): Promise<void> => {
    setRejection(null);
    setError(null);
    setNotice(null);
    try {
      const head = await readFileHead(file);
      const check = checkCombinedDocument(file, head);
      if (!check.ok) {
        setRejection(check);
        return;
      }
    } catch (err) {
      setError(flowErrorFrom(err));
      return;
    }
    if (documentUploaded) {
      // Replace is a mutation with real consequences — explicit, never silent.
      setConfirmReplace(file);
      return;
    }
    await doUpload(file);
  };

  const busyIcon = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;

  return (
    <div className="rounded-xl border border-[#E2ECE7] bg-[#F4F8F6] p-4">
      <div className="flex items-center space-x-2 mb-1.5">
        <FileUp className="h-4 w-4 text-[#0D7751]" aria-hidden="true" />
        <h4 className="text-xs font-extrabold text-[#103125]">
          {t('Combined authority document (charter + authority consents)')}
        </h4>
      </div>
      <p className="text-xs text-[#5A7366] mb-3">
        {t('PDF or JPEG, 1–10 MB.')}
      </p>

      <label htmlFor={inputId} className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
        {t('Choose file')}
      </label>
      <input
        id={inputId}
        type="file"
        disabled={busy}
        accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          // Reset so re-picking the same file still fires a change event.
          e.target.value = '';
          if (file !== null) void handleFile(file);
        }}
        className="block w-full text-xs text-[#2E4A3E] file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-[#1A503E] file:text-white file:text-xs file:font-bold file:cursor-pointer hover:file:bg-[#103125] disabled:opacity-60"
      />

      {/* Explicit replace confirmation (the server keeps one document). */}
      {confirmReplace !== null && (
        <div role="alert" className="mt-3 rounded-lg border border-[#B45309]/40 bg-[#B45309]/5 p-3">
          <p className="text-xs font-bold text-[#B45309]">
            {t('This replaces the stored document. The server keeps one document per draft.')}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const file = confirmReplace;
                setConfirmReplace(null);
                if (file !== null) void doUpload(file);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#B45309] text-white text-xs font-bold hover:bg-[#92400E] transition-colors"
            >
              {t('Upload anyway')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmReplace(null)}
              className="px-3 py-1.5 rounded-lg border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-white transition-colors"
            >
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}

      {busy && (
        <p role="status" className="mt-3 flex items-center space-x-1.5 text-xs text-[#5A7366]">
          {busyIcon}
          <span>{t('Uploading…')}</span>
        </p>
      )}

      {/* Server-rule rejections render the API's verdict bytes verbatim (F4). */}
      {rejection !== null && (
        <p role="alert" className="mt-3 flex items-start space-x-1.5 text-xs font-bold text-[#B45309]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{rejection.source === 'server-rule' ? rejection.detail : t(rejection.key)}</span>
        </p>
      )}
      {notice !== null && (
        <p role="status" className="mt-3 flex items-start space-x-1.5 text-xs text-[#0D7751]">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{notice}</span>
        </p>
      )}
      {error !== null && (
        <div className="mt-3">
          <p role="alert" className="flex items-start space-x-1.5 text-xs font-bold text-[#B45309]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{flowErrorText(error)}</span>
          </p>
          {/* P5: mutations never auto-retry — the user re-fires explicitly. */}
          {lastFile !== null && (
            <button
              type="button"
              onClick={() => void doUpload(lastFile)}
              disabled={busy}
              className="mt-2 flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-white transition-colors disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('Try again')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
