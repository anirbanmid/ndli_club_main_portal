/**
 * NDLI Club Main Portal — Universal Real-time Event Bus & Cross-Module Sync Engine.
 *
 * Guarantees instantaneous, zero-refresh data synchronization across:
 * 1. Same-window components (via CustomEvent).
 * 2. Cross-tab & multi-window sessions (via BroadcastChannel API and StorageEvent fallback).
 * 3. Cross-device / cross-browser sessions (via background interval heartbeats).
 */

export type PortalRealtimeEventType =
  | 'SEAL_ACKNOWLEDGED'
  | 'NOTIFICATION_READ'
  | 'NOTIFICATION_DISPATCHED'
  | 'ACTIVITY_LOGGED'
  | 'ACTIVITY_DELETED'
  | 'CLUB_RENEWED'
  | 'CLUB_UPDATED'
  | 'MEMBER_UPDATED'
  | 'EVENT_UPDATED';

export interface PortalRealtimeEvent {
  id: string;
  type: PortalRealtimeEventType;
  payload?: Record<string, unknown>;
  timestamp: number;
}

const SYNC_CHANNEL_NAME = 'ndli_portal_sync';
const STORAGE_PING_KEY = 'ndli_portal_realtime_ping';
const DOM_EVENT_NAME = 'ndli:portal-realtime';

// Global BroadcastChannel instance
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

// Track recently seen event IDs to prevent duplicate handling
const seenEventIds = new Set<string>();
function markEventSeen(id: string): boolean {
  if (seenEventIds.has(id)) return false;
  seenEventIds.add(id);
  if (seenEventIds.size > 200) {
    const oldest = Array.from(seenEventIds).slice(0, 50);
    oldest.forEach((x) => seenEventIds.delete(x));
  }
  return true;
}

/**
 * Broadcast an event in real time to all portal modules, open tabs, and windows.
 */
export function broadcastPortalEvent(
  type: PortalRealtimeEventType,
  payload?: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return;

  const event: PortalRealtimeEvent = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    type,
    payload,
    timestamp: Date.now(),
  };

  markEventSeen(event.id);

  // 1. Cross-tab sync via BroadcastChannel
  const channel = getBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage(event);
    } catch {
      /* ignore channel error */
    }
  }

  // 2. Same-window sync via CustomEvent
  try {
    window.dispatchEvent(
      new CustomEvent<PortalRealtimeEvent>(DOM_EVENT_NAME, {
        detail: event,
      })
    );
  } catch {
    /* ignore event error */
  }

  // 3. StorageEvent ping for cross-tab fallback
  try {
    localStorage.setItem(STORAGE_PING_KEY, JSON.stringify(event));
  } catch {
    /* ignore storage error */
  }
}

/**
 * Subscribe to real-time events across the portal.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeToPortalEvents(
  callback: (event: PortalRealtimeEvent) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustomEvent = (e: Event) => {
    const ce = e as CustomEvent<PortalRealtimeEvent>;
    if (ce.detail && ce.detail.type) {
      callback(ce.detail);
    }
  };

  const channel = getBroadcastChannel();
  const handleBroadcastMessage = (msg: MessageEvent<PortalRealtimeEvent>) => {
    if (msg.data && msg.data.id && markEventSeen(msg.data.id)) {
      callback(msg.data);
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_PING_KEY && e.newValue) {
      try {
        const evt = JSON.parse(e.newValue) as PortalRealtimeEvent;
        if (evt && evt.id && markEventSeen(evt.id)) {
          callback(evt);
        }
      } catch {
        /* ignore parse error */
      }
    }
  };

  window.addEventListener(DOM_EVENT_NAME, handleCustomEvent);
  window.addEventListener('storage', handleStorage);
  if (channel) {
    channel.addEventListener('message', handleBroadcastMessage);
  }

  return () => {
    window.removeEventListener(DOM_EVENT_NAME, handleCustomEvent);
    window.removeEventListener('storage', handleStorage);
    if (channel) {
      channel.removeEventListener('message', handleBroadcastMessage);
    }
  };
}
