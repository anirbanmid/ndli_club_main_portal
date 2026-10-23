import React, { useState } from 'react';
import { t } from '../../i18n';
import { IdentityInput } from '../../lib/onboardingApi';

/**
 * Shared identity field group (M5-D2): used by the wizard's start form and by
 * the identity step. Required markers mirror the SERVER rules exactly (P4):
 * create_draft requires institution/club/zone/state/district; AISHE is
 * optional. Server rejections arrive as per-field verdict bytes (F4) and are
 * rendered verbatim under the field they reject.
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

const FIELDS: ReadonlyArray<{ key: keyof IdentityInput; labelKey: string; required: boolean }> = [
  { key: 'institution_name', labelKey: 'Institution name', required: true },
  { key: 'aishe_code', labelKey: 'AISHE code (optional)', required: false },
  { key: 'club_name', labelKey: 'Club name', required: true },
  { key: 'zone_code', labelKey: 'Zone code', required: true },
  { key: 'state_code', labelKey: 'State / UT code', required: true },
  { key: 'district_code', labelKey: 'District code', required: true },
];

export const IdentityForm: React.FC<IdentityFormProps> = ({
  initial,
  fieldErrors,
  busy,
  submitLabelKey,
  onSubmit,
}) => {
  // Current-step state only (P4): the form is re-mounted per step via `key`.
  const [values, setValues] = useState<IdentityInput>(() => ({
    institution_name: initial.institution_name ?? '',
    aishe_code: initial.aishe_code ?? '',
    club_name: initial.club_name ?? '',
    zone_code: initial.zone_code ?? '',
    state_code: initial.state_code ?? '',
    district_code: initial.district_code ?? '',
  }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <fieldset disabled={busy} className="space-y-4">
        <legend className="sr-only">{t('Institution & club identity')}</legend>
        {FIELDS.map((field) => {
          const error = fieldErrors[field.key];
          return (
            <div key={field.key}>
              <label htmlFor={`identity-${field.key}`} className="block text-xs font-bold text-[#2E4A3E] mb-1.5">
                {t(field.labelKey)}
              </label>
              <input
                id={`identity-${field.key}`}
                type="text"
                required={field.required}
                value={values[field.key]}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                aria-invalid={error !== undefined}
                aria-describedby={error !== undefined ? `identity-${field.key}-error` : undefined}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2ECE7] bg-[#F4F8F6] text-sm text-[#103125] focus:outline-none focus:ring-2 focus:ring-[#0D7751]/50 focus:border-[#0D7751]"
              />
              {/* Server verdict bytes, rendered verbatim (F4). */}
              {error !== undefined && (
                <p id={`identity-${field.key}-error`} role="alert" className="mt-1 text-xs font-bold text-[#B45309]">
                  {error}
                </p>
              )}
            </div>
          );
        })}
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
