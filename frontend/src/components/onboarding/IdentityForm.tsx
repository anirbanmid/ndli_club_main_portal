import React, { useState } from 'react';
import { t } from '../../i18n';
import { IdentityInput } from '../../lib/onboardingApi';
import {
  INDIAN_STATES_AND_UTS,
  findStateByQuery,
  StateUT,
} from '../../utils/indiaGeography';

/**
 * Shared identity field group (M5-D2): used by the wizard's start form and by
 * the identity step.
 *
 * Rules:
 * 1. All fields are mandatory except AISHE code (which is optional); server rejects if missing.
 * 2. State/UT provides a full dropdown of all 36 Indian States and Union Territories.
 * 3. Zone is automatically fetched / mapped from the State/UT database mapping.
 * 4. District is labeled as "District" (not "District code").
 * 5. Server rejections arrive as per-field verdict bytes (F4) and render verbatim.
 */

interface IdentityFormProps {
  /** Initial values (the server draft payload on the identity step). */
  initial: Partial<IdentityInput>;
  /** Per-field server verdicts — rendered VERBATIM (F4). */
  fieldErrors: Record<string, string>;
  busy: boolean;
  submitLabelKey: string;
  onSubmit: (input: IdentityInput) => void;
}

export const IdentityForm: React.FC<IdentityFormProps> = ({
  initial,
  fieldErrors,
  busy,
  submitLabelKey,
  onSubmit,
}) => {
  // Derive initial state match if available
  const initialMatchedState = findStateByQuery(initial.state_code);

  const [values, setValues] = useState<IdentityInput>(() => ({
    institution_name: initial.institution_name ?? '',
    aishe_code: initial.aishe_code ?? '',
    club_name: initial.club_name ?? '',
    zone_code: initialMatchedState?.zoneCode ?? initial.zone_code ?? '',
    state_code: initialMatchedState?.code ?? initial.state_code ?? '',
    district_code: initial.district_code ?? '',
  }));

  const selectedState: StateUT | undefined = findStateByQuery(values.state_code);

  const handleStateChange = (newCode: string): void => {
    const matched = INDIAN_STATES_AND_UTS.find((s) => s.code === newCode);
    const autoZone = matched ? matched.zoneCode : '';
    setValues((prev) => ({
      ...prev,
      state_code: newCode,
      zone_code: autoZone,
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <fieldset disabled={busy} className="space-y-4">
        <legend className="sr-only">{t('Institution & club identity')}</legend>

        {/* 1. Institution Name (Mandatory) */}
        <div>
          <label htmlFor="identity-institution_name" className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
            {t('Institution name')} <span className="text-rose-600">*</span>
          </label>
          <input
            id="identity-institution_name"
            type="text"
            required
            placeholder={t('e.g. Indian Institute of Technology Kharagpur')}
            value={values.institution_name}
            onChange={(e) => setValues((prev) => ({ ...prev, institution_name: e.target.value }))}
            aria-invalid={fieldErrors.institution_name !== undefined}
            aria-describedby={fieldErrors.institution_name !== undefined ? 'identity-institution_name-error' : undefined}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          {fieldErrors.institution_name !== undefined && (
            <p id="identity-institution_name-error" role="alert" className="mt-1 text-xs font-bold text-[#B45309]">
              {t(fieldErrors.institution_name)}
            </p>
          )}
        </div>

        {/* 2. AISHE Code (Optional) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="identity-aishe_code" className="block text-xs font-bold text-[#2E4A3E]">
              {t('AISHE code (optional)')}
            </label>
            <span className="text-[11px] font-semibold text-[#5A7366] bg-ink-100 px-2 py-0.5 rounded">
              {t('Optional')}
            </span>
          </div>
          <input
            id="identity-aishe_code"
            type="text"
            placeholder={t('e.g. U-0570 or C-41295')}
            value={values.aishe_code}
            onChange={(e) => setValues((prev) => ({ ...prev, aishe_code: e.target.value }))}
            aria-invalid={fieldErrors.aishe_code !== undefined}
            aria-describedby={fieldErrors.aishe_code !== undefined ? 'identity-aishe_code-error' : undefined}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          <span className="text-[11px] text-[#5A7366] block mt-1">
            {t('Ministry of Education All India Survey on Higher Education Code (leave blank if not applicable).')}
          </span>
          {fieldErrors.aishe_code !== undefined && (
            <p id="identity-aishe_code-error" role="alert" className="mt-1 text-xs font-bold text-[#B45309]">
              {t(fieldErrors.aishe_code)}
            </p>
          )}
        </div>

        {/* 3. Club Name (Mandatory) */}
        <div>
          <label htmlFor="identity-club_name" className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
            {t('Club name')} <span className="text-rose-600">*</span>
          </label>
          <input
            id="identity-club_name"
            type="text"
            required
            placeholder={t('e.g. NDLI Readers Club')}
            value={values.club_name}
            onChange={(e) => setValues((prev) => ({ ...prev, club_name: e.target.value }))}
            aria-invalid={fieldErrors.club_name !== undefined}
            aria-describedby={fieldErrors.club_name !== undefined ? 'identity-club_name-error' : undefined}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          {fieldErrors.club_name !== undefined && (
            <p id="identity-club_name-error" role="alert" className="mt-1 text-xs font-bold text-[#B45309]">
              {t(fieldErrors.club_name)}
            </p>
          )}
        </div>

        {/* 4. State / UT (Dropdown, Mandatory) */}
        <div>
          <label htmlFor="identity-state_code" className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
            {t('State / UT')} <span className="text-rose-600">*</span>
          </label>
          <select
            id="identity-state_code"
            required
            value={values.state_code}
            onChange={(e) => handleStateChange(e.target.value)}
            aria-invalid={fieldErrors.state_code !== undefined}
            aria-describedby={fieldErrors.state_code !== undefined ? 'identity-state_code-error' : undefined}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          >
            <option value="">{t('-- Select State / UT (36 States & UTs) --')}</option>
            <optgroup label={t('States')}>
              {INDIAN_STATES_AND_UTS.filter((s) => s.kind === 'state').map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={t('Union Territories')}>
              {INDIAN_STATES_AND_UTS.filter((s) => s.kind === 'ut').map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          </select>
          {fieldErrors.state_code !== undefined && (
            <p id="identity-state_code-error" role="alert" className="mt-1 text-xs font-bold text-[#B45309]">
              {t(fieldErrors.state_code)}
            </p>
          )}
        </div>

        {/* 5. Zone (Auto-fetched from State/UT, Mandatory) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="identity-zone_code" className="block text-xs font-bold text-[#2E4A3E]">
              {t('Zone')} <span className="text-rose-600">*</span>
            </label>
            <span className="text-[11px] font-bold text-[#0D7751]">
              ⚡ {t('Auto-fetched from database')}
            </span>
          </div>
          <input
            id="identity-zone_code"
            type="text"
            readOnly
            value={selectedState ? `${selectedState.zoneName} (${selectedState.zoneCode})` : (values.zone_code || '')}
            placeholder={t('Auto-derived upon selecting State / UT')}
            aria-invalid={fieldErrors.zone_code !== undefined}
            aria-describedby={fieldErrors.zone_code !== undefined ? 'identity-zone_code-error' : undefined}
            className={`w-full px-3.5 py-2.5 rounded-lg border text-sm font-semibold transition-colors focus:outline-none cursor-default ${
              selectedState
                ? 'border-[#0D7751]/40 bg-[#EBF5F0] text-[#103125]'
                : 'border-[#E2ECE7] bg-[#F4F8F6] text-[#5A7366]'
            }`}
          />
          {fieldErrors.zone_code !== undefined && (
            <p id="identity-zone_code-error" role="alert" className="mt-1 text-xs font-bold text-[#B45309]">
              {t(fieldErrors.zone_code)}
            </p>
          )}
        </div>

        {/* 6. District (Mandatory, labeled as "District") */}
        <div>
          <label htmlFor="identity-district_code" className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
            {t('District')} <span className="text-rose-600">*</span>
          </label>
          <input
            id="identity-district_code"
            type="text"
            required
            placeholder={t('e.g. Paschim Medinipur or Kolkata')}
            value={values.district_code}
            onChange={(e) => setValues((prev) => ({ ...prev, district_code: e.target.value }))}
            aria-invalid={fieldErrors.district_code !== undefined}
            aria-describedby={fieldErrors.district_code !== undefined ? 'identity-district_code-error' : undefined}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
          />
          {fieldErrors.district_code !== undefined && (
            <p id="identity-district_code-error" role="alert" className="mt-1 text-xs font-bold text-[#B45309]">
              {t(fieldErrors.district_code)}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#1A503E] text-white text-sm font-bold hover:bg-[#103125] transition-colors disabled:opacity-60"
        >
          <span>{busy ? t('Saving…') : t(submitLabelKey)}</span>
        </button>
      </fieldset>
    </form>
  );
};
