import type { Page } from '@playwright/test';

/**
 * Hermetic API fixtures for the M3 public endpoints.
 * Shapes mirror the backend byte-for-byte (apps/public_api/views.py):
 * - verify: exactly six fields + status; failure body = six nulls + "invalid"
 * - telemetry: {states:[{code,name,kind,zone,institutions,clubs,members}],totals}
 * - directory: DRF page {count,next,previous,results}
 */

export const VALID_ID = 'NDLI-DEAL-2345';
export const REVOKED_ID = 'NDLI-JKLM-6789';
export const UNKNOWN_ID = 'NDLI-ZZZZ-9999'; // well-formed, not registered
export const MALFORMED_ID = 'ABC123'; // fails the NDLI-XXXX-XXXX format

export const TELEMETRY = {
  states: [
    { code: 'IN-AN', name: 'Andaman & Nicobar Islands', kind: 'UT', zone: 'S', institutions: 0, clubs: 0, members: 0 },
    { code: 'IN-MH', name: 'Maharashtra', kind: 'State', zone: 'W', institutions: 3, clubs: 5, members: 120 },
    { code: 'IN-WB', name: 'West Bengal', kind: 'State', zone: 'E', institutions: 2, clubs: 2, members: 60 },
  ],
  totals: { states: 3, institutions: 5, clubs: 7, members: 180 },
};

const SIX_FIELDS = {
  name: 'Ananya Sharma',
  club: 'NDLI Reading Club',
  institution: 'Sample Engineering College Pune',
  event_title: 'National Reading Marathon 2026',
  date: '2026-03-14',
};

export const VALID_VERDICT = { ...SIX_FIELDS, status: 'valid' };
export const REVOKED_VERDICT = { ...SIX_FIELDS, status: 'revoked' };
export const INVALID_VERDICT = {
  name: null,
  club: null,
  institution: null,
  event_title: null,
  date: null,
  status: 'invalid',
};

function inst(
  code: string,
  name: string,
  stateCode: string,
  stateName: string,
  district: string | null,
  aishe: string | null,
) {
  return {
    code,
    name,
    aishe_code: aishe,
    state: { code: stateCode, name: stateName },
    district: district ? { code: `${stateCode}-${district}`, name: district } : null,
  };
}

const PAGE_1_RESULTS = Array.from({ length: 20 }, (_, i) =>
  inst(
    `INST-MH-${String(i + 1).padStart(3, '0')}`,
    `Sample Institution ${i + 1} Maharashtra`,
    'IN-MH',
    'Maharashtra',
    'Pune',
    `U-${1000 + i}`,
  ),
);

const PAGE_2_RESULTS = [
  inst('INST-WB-001', 'Sample Institution West Bengal', 'IN-WB', 'West Bengal', 'Kolkata', 'U-2001'),
];

function directoryPage(pageParam: string) {
  const base = 'http://127.0.0.1:4173/api/v1/public/directory/';
  if (pageParam === '2') {
    return { count: 21, next: null, previous: base, results: PAGE_2_RESULTS };
  }
  return { count: 21, next: `${base}?page=2`, previous: null, results: PAGE_1_RESULTS };
}

export interface MockOptions {
  /** Override the directory response entirely (e.g. an empty page). */
  emptyDirectory?: boolean;
}

/** Install route mocks for all three public endpoints. */
export async function mockApi(page: Page, options: MockOptions = {}): Promise<void> {
  await page.route('**/api/v1/public/telemetry/**', (route) =>
    route.fulfill({ status: 200, json: TELEMETRY }),
  );

  await page.route('**/api/v1/public/directory/**', (route) => {
    if (options.emptyDirectory) {
      return route.fulfill({
        status: 200,
        json: { count: 0, next: null, previous: null, results: [] },
      });
    }
    const pageParam = new URL(route.request().url()).searchParams.get('page') ?? '1';
    return route.fulfill({ status: 200, json: directoryPage(pageParam) });
  });

  await page.route('**/api/v1/public/verify/**', (route) => {
    const id = (new URL(route.request().url()).searchParams.get('id') ?? '').toUpperCase();
    const json =
      id === VALID_ID ? VALID_VERDICT : id === REVOKED_ID ? REVOKED_VERDICT : INVALID_VERDICT;
    return route.fulfill({ status: 200, json });
  });
}
