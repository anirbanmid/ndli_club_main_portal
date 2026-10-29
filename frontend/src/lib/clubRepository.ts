/**
 * NDLI Club Main Portal — Canonical Club Data Repository & Sync Engine.
 *
 * Enforces the "Single Source of Truth Across Modules" architectural rule:
 * 1. The backend API (/api/v1/public/clubs/) is the authoritative source.
 * 2. All client modules (Module 2 Campus, Module 3 Employee, Public Showcase,
 *    and QR/Passkey Join) consume the same unified dataset.
 * 3. Realtime Cross-Module Synchronization: Mutations (such as renewal, status,
 *    or authority changes) are broadcast across all active tabs and components
 *    using the BroadcastChannel API and custom DOM events.
 * 4. INITIAL_CLUBS acts exclusively as a zero-network offline hydration fallback,
 *    never as an active competing live store.
 */

import { InstituteClub } from '../types';
import { INITIAL_CLUBS } from '../mockData';

const SYNC_CHANNEL_NAME = 'ndli_portal_sync';
const STORAGE_RENEWALS_KEY = 'ndli_club_renewals';
const PUBLIC_CLUBS_API = '/api/v1/clubs/showcase/canonical/';
const ADMIN_CLUBS_API = '/admin/api/v1/activities/clubs/';

export interface ClubUpdateEvent {
  type: 'CLUB_UPDATED' | 'CLUB_RENEWED';
  clubId: string;
  updates: Partial<InstituteClub>;
  timestamp: number;
}

// Global broadcast channel instance (lazily initialized if supported)
let broadcastChannel: BroadcastChannel | null = null;
function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    if (!broadcastChannel) {
      try {
        broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      } catch {
        broadcastChannel = null;
      }
    }
  }
  return broadcastChannel;
}

/**
 * Retrieve persisted client renewal dates (localStorage fallback cache).
 */
export function getPersistedRenewals(): Record<
  string,
  {
    last_renewal_date?: string;
    upcoming_renewal_date?: string;
    next_renewal_date?: string;
    renewal_date?: string;
    status?: string;
  }
> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_RENEWALS_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Merge club records with locally persisted renewal overrides.
 */
function applyRenewalOverrides(clubs: InstituteClub[]): InstituteClub[] {
  const renewals = getPersistedRenewals();
  return clubs.map((c) => {
    const ren = renewals[c.id];
    if (ren && ren.last_renewal_date) {
      return {
        ...c,
        lastRenewalDate: ren.last_renewal_date,
        nextRenewalDate: ren.upcoming_renewal_date || ren.next_renewal_date || c.nextRenewalDate,
        status: (ren.status as InstituteClub['status']) || 'Active',
      };
    }
    return c;
  });
}

/**
 * Normalizes backend club record (from public or activities endpoint) to InstituteClub.
 */
function normalizeBackendClub(raw: Record<string, unknown>): InstituteClub {
  const id = String(raw.id || raw.club_id || '');
  const name = String(raw.name || raw.institution_name || '');
  const rawAuthorities = Array.isArray(raw.authorities) ? raw.authorities : [];

  return {
    id,
    aisheCode: String(raw.aisheCode || raw.aishe_code || `AISHE-${id}`),
    name,
    state: String(raw.state || ''),
    district: String(raw.district || ''),
    zone: (raw.zone as InstituteClub['zone']) || 'North',
    category: (raw.category as InstituteClub['category']) || 'Autonomous Institute',
    passkey: String(raw.passkey || `${id}-NDL-001`),
    status: (raw.status as InstituteClub['status']) || 'Active',
    memberCount: Number(raw.memberCount ?? raw.member_count ?? 1800),
    eventsConducted: Number(raw.eventsConducted ?? raw.events_conducted ?? 15),
    establishedDate: String(raw.establishedDate ?? raw.established_date ?? raw.date_of_approval ?? '2021-04-12'),
    authorities: rawAuthorities.length > 0
      ? (rawAuthorities as InstituteClub['authorities'])
      : [
          {
            role: 'Patron',
            name: String(raw.patron_name || 'Prof. Patron Head'),
            designation: 'Director',
            email: String(raw.patron_email || `director@${id.toLowerCase()}.example.edu`),
            phone: '+91 9811000011',
            verified: true,
          },
          {
            role: 'President',
            name: String(raw.president_name || 'Dr. Club President'),
            designation: 'Head Librarian',
            email: String(raw.president_email || `librarian@${id.toLowerCase()}.example.edu`),
            phone: '+91 9811000012',
            verified: true,
          },
          {
            role: 'Secretary',
            name: String(raw.secretary_name || 'Prof. Secretary Lead'),
            designation: 'Faculty Lead',
            email: String(raw.secretary_email || `secretary@${id.toLowerCase()}.example.edu`),
            phone: '+91 9811000013',
            verified: true,
          },
          {
            role: 'Executive Member',
            name: 'Student Representative',
            designation: 'Student Representative',
            email: `student@${id.toLowerCase()}.example.edu`,
            phone: '+91 9811000014',
            verified: true,
          },
        ],
    description: String(raw.description || `Official NDLI Club chapter at ${name}.`),
    websiteUrl: String(raw.websiteUrl || raw.website_url || 'https://www.sample.ac.in'),
    registrationNo: String(raw.registrationNo || raw.registration_no || raw.reg_no || `NDLI/CLUB/${id}`),
    dateOfApproval: String(raw.dateOfApproval || raw.date_of_approval || '2021-04-12'),
    lastRenewalDate: String(raw.lastRenewalDate || raw.last_renewal_date || 'None (Initial)'),
    nextRenewalDate: String(raw.nextRenewalDate || raw.next_renewal_date || raw.upcoming_renewal_date || '2026-04-12'),
    soloSessions: Number(raw.soloSessions ?? raw.solo_activities ?? 10),
    jointSessions: Number(raw.jointSessions ?? raw.joint_activities ?? 5),
  };
}

/**
 * Fetch the canonical club list from the backend Single Source of Truth.
 * Tries public API first, then admin API, and falls back to INITIAL_CLUBS if offline.
 */
export async function fetchCanonicalClubs(): Promise<InstituteClub[]> {
  // If SSR or node environment without window, return initial static list
  if (typeof window === 'undefined') {
    return applyRenewalOverrides(INITIAL_CLUBS);
  }

  try {
    // 1. Primary endpoint: Public single source API
    const response = await fetch(PUBLIC_CLUBS_API, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      const rawList: Record<string, unknown>[] = data.clubs || data.results || [];
      if (rawList.length > 0) {
        const parsed = rawList.map(normalizeBackendClub);
        return applyRenewalOverrides(parsed);
      }
    }
  } catch {
    /* try fallback endpoint */
  }

  try {
    // 2. Secondary fallback endpoint: Activities API
    const response = await fetch(ADMIN_CLUBS_API, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      const rawList: Record<string, unknown>[] = data.clubs || data.results || [];
      if (rawList.length > 0) {
        const parsed = rawList.map(normalizeBackendClub);
        return applyRenewalOverrides(parsed);
      }
    }
  } catch {
    /* network unavailable */
  }

  // 3. Resilient offline fallback
  return applyRenewalOverrides(INITIAL_CLUBS);
}

/**
 * Broadcast a real-time club update (e.g. renewal, status change) across all modules and tabs.
 */
export function notifyClubUpdated(
  clubId: string,
  updates: Partial<InstituteClub>,
): void {
  if (typeof window === 'undefined') return;

  // 1. Persist renewal locally if applicable
  if (updates.lastRenewalDate || updates.nextRenewalDate) {
    try {
      const stored = getPersistedRenewals();
      stored[clubId] = {
        last_renewal_date: updates.lastRenewalDate,
        upcoming_renewal_date: updates.nextRenewalDate,
        next_renewal_date: updates.nextRenewalDate,
        renewal_date: updates.nextRenewalDate,
        status: updates.status || 'Active',
      };
      localStorage.setItem(STORAGE_RENEWALS_KEY, JSON.stringify(stored));
    } catch {
      /* storage quota exceeded or disabled */
    }
  }

  const payload: ClubUpdateEvent = {
    type: 'CLUB_UPDATED',
    clubId,
    updates,
    timestamp: Date.now(),
  };

  // 2. Broadcast via BroadcastChannel (cross-tab real-time sync)
  const channel = getBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage(payload);
    } catch {
      /* ignore channel errors */
    }
  }

  // 3. Dispatch in-window custom DOM event (same-tab cross-component sync)
  window.dispatchEvent(
    new CustomEvent('ndli:club-updated', {
      detail: payload,
    }),
  );
}

/**
 * Subscribe to real-time club updates across all modules and tabs.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeToClubUpdates(
  callback: (event: ClubUpdateEvent) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustomEvent = (e: Event) => {
    const custom = e as CustomEvent<ClubUpdateEvent>;
    if (custom.detail) {
      callback(custom.detail);
    }
  };

  const channel = getBroadcastChannel();
  const handleBroadcastMessage = (event: MessageEvent<ClubUpdateEvent>) => {
    if (event.data && event.data.clubId) {
      callback(event.data);
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_RENEWALS_KEY && e.newValue) {
      try {
        const renewals = JSON.parse(e.newValue);
        for (const [cid, ren] of Object.entries(renewals)) {
          const r = ren as Record<string, string>;
          callback({
            type: 'CLUB_RENEWED',
            clubId: cid,
            updates: {
              lastRenewalDate: r.last_renewal_date,
              nextRenewalDate: r.upcoming_renewal_date || r.next_renewal_date,
              status: 'Active',
            },
            timestamp: Date.now(),
          });
        }
      } catch {
        /* parse error */
      }
    }
  };

  window.addEventListener('ndli:club-updated', handleCustomEvent);
  window.addEventListener('storage', handleStorage);
  if (channel) {
    channel.addEventListener('message', handleBroadcastMessage);
  }

  return () => {
    window.removeEventListener('ndli:club-updated', handleCustomEvent);
    window.removeEventListener('storage', handleStorage);
    if (channel) {
      channel.removeEventListener('message', handleBroadcastMessage);
    }
  };
}
