import React, { useState } from 'react';
import { AlertTriangle, Download, FileCheck2, Loader2 } from 'lucide-react';
import { t } from '../../i18n';
import { downloadStoredDocument, DraftPayload } from '../../lib/onboardingApi';
import { flowErrorFrom, flowErrorText, WizardFlowError } from './wizardSteps';
import { UploadSurface } from './UploadSurface';

/**
 * Supporting-documents step (M5-D2, owner-locked 2026-10-23 DEC1): ONE upload
 * surface — the combined authority document (M4 owner decision 2026-10-21:
 * charter + consents combined, jpeg/pdf). The PI-signature surface is removed
 * entirely (club application = applicants forming club authority; there is no
 * PI role in onboarding — a PI signature exists only in the M3 certificate
 * issuance domain, not here).
 *
 * Server truth is rendered as returned (P4): `document_uploaded` and the
 * attachment-only download. The API stores ONE document per draft, so the last
 * upload wins — the step states this up-front instead of hiding it.
 */

interface DocumentStepProps {
  draft: DraftPayload;
  token: string;
  onDraft: (draft: DraftPayload) => void;
}

export const DocumentStep: React.FC<DocumentStepProps> = ({ draft, token, onDraft }) => {
  const [error, setError] = useState<WizardFlowError | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (): Promise<void> => {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadStoredDocument(draft.id, token);
    } catch (err) {
      setError(flowErrorFrom(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-extrabold text-[#103125] mb-2">{t('Supporting documents')}</h3>
      <p className="text-xs text-[#5A7366] mb-4">
        {t('The API keeps ONE document per draft (charter + authority consents combined). The last uploaded file becomes the stored one.')}
      </p>

      <div className="space-y-4">
        <UploadSurface
          surface="document"
          draftId={draft.id}
          token={token}
          documentUploaded={draft.document_uploaded}
          onUploaded={onDraft}
        />
      </div>

      {/* Server truth block — rendered from the draft payload (P4). */}
      <div className="mt-4 rounded-xl border border-[#E2ECE7] bg-white p-4">
        <div className="flex items-center space-x-2 mb-2">
          <FileCheck2 className="h-4 w-4 text-[#0D7751]" aria-hidden="true" />
          <h4 className="text-xs font-extrabold text-[#103125]">{t('Stored document')}</h4>
        </div>
        {draft.document_uploaded ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-bold text-[#0D7751]">{t('On file')}</span>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#E2ECE7] text-xs font-bold text-[#2E4A3E] hover:bg-[#F4F8F6] transition-colors disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{t('Download stored document')}</span>
            </button>
          </div>
        ) : (
          <p className="text-xs text-[#5A7366]">{t('No document stored yet.')}</p>
        )}
        {error !== null && (
          <p role="alert" className="mt-2 flex items-start space-x-1.5 text-xs font-bold text-[#B45309]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{flowErrorText(error)}</span>
          </p>
        )}
      </div>
    </div>
  );
};
