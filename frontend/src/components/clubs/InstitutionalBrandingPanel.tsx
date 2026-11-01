import React, { useEffect, useState } from 'react';
import {
  fetchClubBranding,
  saveClubBranding,
  type ClubBranding,
} from '../../lib/campusApi';

interface InstitutionalBrandingPanelProps {
  clubCode: string;
  isReadOnly?: boolean;
}

export const InstitutionalBrandingPanel: React.FC<InstitutionalBrandingPanelProps> = ({
  clubCode,
  isReadOnly = false,
}) => {
  const [branding, setBranding] = useState<ClubBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [authorityName, setAuthorityName] = useState('');
  const [authorityAffiliation, setAuthorityAffiliation] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string>('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const data = await fetchClubBranding(clubCode);
        if (active) {
          setBranding(data);
          setAuthorityName(data.signing_authority_name || '');
          setAuthorityAffiliation(data.signing_authority_affiliation || '');
          if (data.logo_url) setLogoPreview(data.logo_url);
          if (data.signature_url) setSignaturePreview(data.signature_url);
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Failed to load institutional branding.';
          setStatusMsg({ type: 'error', text: msg });
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    if (clubCode) {
      load();
    }
    return () => {
      active = false;
    };
  }, [clubCode]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png') {
      setStatusMsg({ type: 'error', text: 'Institutional logo must be a transparent PNG file.' });
      return;
    }
    if (file.size > 300 * 1024) {
      setStatusMsg({ type: 'error', text: 'Logo image exceeds 300KB limit.' });
      return;
    }

    setLogoFile(file);
    setStatusMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png') {
      setStatusMsg({ type: 'error', text: 'Authority signature must be a transparent PNG file.' });
      return;
    }
    if (file.size > 300 * 1024) {
      setStatusMsg({ type: 'error', text: 'Signature image exceeds 300KB limit.' });
      return;
    }

    setSignatureFile(file);
    setStatusMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      setSignaturePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setStatusMsg(null);

      const formData = new FormData();
      formData.append('signing_authority_name', authorityName);
      formData.append('signing_authority_affiliation', authorityAffiliation);
      if (logoFile) {
        formData.append('logo_image', logoFile);
      }
      if (signatureFile) {
        formData.append('signature_image', signatureFile);
      }

      const res = await saveClubBranding(clubCode, formData);
      setStatusMsg({ type: 'success', text: res.message || 'Branding assets updated successfully!' });
      // Re-fetch to synchronize state
      const updated = await fetchClubBranding(clubCode);
      setBranding(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update branding assets.';
      setStatusMsg({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-[#5A7366]">
        Loading institutional branding configuration...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#DCE4E0] p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EAF0EC] pb-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-[#1F3A2E] flex items-center gap-2">
            <span>🏛️</span> Institutional Branding & Digital Credentials
          </h3>
          <p className="text-xs text-[#5A7366] mt-1">
            Configures official transparent PNG letterhead insignia and signing authority signatures
            embedded dynamically into verifiable event and conductor certificates.
          </p>
        </div>
        {branding && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-[#E8F2EC] text-[#194D33]">
            {branding.institution_type === 'school' ? 'Type B: School' : 'Type A: HEI'}
          </span>
        )}
      </div>

      {statusMsg && (
        <div
          className={`mb-6 p-4 rounded-lg text-xs font-medium flex items-center gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-[#EAF5EF] text-[#196B3E] border border-[#BCE3CC]'
              : 'bg-[#FDF0ED] text-[#A62B17] border border-[#F5C2B8]'
          }`}
        >
          <span>{statusMsg.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{statusMsg.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Logo Section */}
          <div className="border border-[#E0E7E3] rounded-lg p-5 bg-[#F9FBFA]">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#1F3A2E] mb-2">
              Official Institutional Logo (Transparent PNG)
            </label>
            <p className="text-[11px] text-[#5A7366] mb-3">
              Must be transparent PNG (max 300KB). Displayed on the top-left of certificates.
            </p>

            {logoPreview ? (
              <div className="mb-4 flex items-center justify-center p-4 bg-white border border-dashed border-[#B8CCC1] rounded-lg min-h-[120px]">
                <img
                  src={logoPreview}
                  alt="Institutional Logo Preview"
                  className="max-h-24 max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="mb-4 flex flex-col items-center justify-center p-6 bg-white border border-dashed border-[#D2DDD6] rounded-lg text-center">
                <span className="text-2xl mb-1">🖼️</span>
                <span className="text-xs text-[#7A9386]">No institutional logo uploaded</span>
              </div>
            )}

            {!isReadOnly && (
              <input
                type="file"
                accept="image/png"
                onChange={handleLogoChange}
                className="block w-full text-xs text-[#5A7366] file:cursor-pointer file:transition-all file:duration-200 hover:file:scale-[1.04] active:file:scale-[0.96] file:shadow-xs hover:file:shadow-md hover:file:bg-[#0D7751] active:file:bg-[#084b33] file:mr-3.5 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#103125] file:text-white cursor-pointer"
              />
            )}
          </div>

          {/* Signature Section */}
          <div className="border border-[#E0E7E3] rounded-lg p-5 bg-[#F9FBFA]">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#1F3A2E] mb-2">
              Signing Authority Signature (Transparent PNG)
            </label>
            <p className="text-[11px] text-[#5A7366] mb-3">
              Must be transparent PNG (max 300KB). Displayed on the lower endorsement block.
            </p>

            {signaturePreview ? (
              <div className="mb-4 flex items-center justify-center p-4 bg-white border border-dashed border-[#B8CCC1] rounded-lg min-h-[120px]">
                <img
                  src={signaturePreview}
                  alt="Signing Authority Signature Preview"
                  className="max-h-24 max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="mb-4 flex flex-col items-center justify-center p-6 bg-white border border-dashed border-[#D2DDD6] rounded-lg text-center">
                <span className="text-2xl mb-1">✍️</span>
                <span className="text-xs text-[#7A9386]">No signature image uploaded</span>
              </div>
            )}

            {!isReadOnly && (
              <input
                type="file"
                accept="image/png"
                onChange={handleSignatureChange}
                className="block w-full text-xs text-[#5A7366] file:cursor-pointer file:transition-all file:duration-200 hover:file:scale-[1.04] active:file:scale-[0.96] file:shadow-xs hover:file:shadow-md hover:file:bg-[#0D7751] active:file:bg-[#084b33] file:mr-3.5 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#103125] file:text-white cursor-pointer"
              />
            )}
          </div>
        </div>

        {/* Text Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1F3A2E] mb-1">
              Signing Authority Full Name
            </label>
            <input
              type="text"
              value={authorityName}
              onChange={(e) => setAuthorityName(e.target.value)}
              disabled={isReadOnly}
              placeholder="e.g. Prof. Arvind Sharma"
              className="w-full px-3 py-2 text-xs border border-[#C5D4CB] rounded-md focus:outline-none focus:ring-1 focus:ring-[#194D33] disabled:bg-[#F2F5F3]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1F3A2E] mb-1">
              Designation & Affiliation
            </label>
            <input
              type="text"
              value={authorityAffiliation}
              onChange={(e) => setAuthorityAffiliation(e.target.value)}
              disabled={isReadOnly}
              placeholder="e.g. Patron & Vice Chancellor, Delhi University"
              className="w-full px-3 py-2 text-xs border border-[#C5D4CB] rounded-md focus:outline-none focus:ring-1 focus:ring-[#194D33] disabled:bg-[#F2F5F3]"
            />
          </div>
        </div>

        {!isReadOnly && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-[#194D33] hover:bg-[#133A27] text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {saving ? 'Saving Branding Assets...' : 'Save Branding Assets'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
