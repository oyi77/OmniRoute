/**
 * Badge unlock notification system.
 * Emits events that the dashboard can listen to for toast notifications.
 *
 * @module lib/gamification/notifications
 */

export interface BadgeUnlockEvent {
  badgeId: string;
  badgeName: string;
  badgeDescription: string;
  badgeIcon: string;
  badgeRarity: string;
  unlockedAt: string;
}

// In-memory event buffer for SSE streaming
const recentUnlocks: Map<string, BadgeUnlockEvent[]> = new Map();
const MAX_BUFFER_SIZE = 50;
const BUFFER_TTL_MS = 60_000; // 1 minute

/**
 * Record a badge unlock event for notification.
 */
export function recordBadgeUnlock(apiKeyId: string, event: BadgeUnlockEvent): void {
  if (!recentUnlocks.has(apiKeyId)) {
    recentUnlocks.set(apiKeyId, []);
  }
  const list = recentUnlocks.get(apiKeyId)!;
  list.push(event);

  // Trim old entries
  const cutoff = Date.now() - BUFFER_TTL_MS;
  while (list.length > 0 && new Date(list[0].unlockedAt).getTime() < cutoff) {
    list.shift();
  }
  if (list.length > MAX_BUFFER_SIZE) {
    list.splice(0, list.length - MAX_BUFFER_SIZE);
  }
}

/**
 * Get and clear recent badge unlocks for an API key.
 */
export function consumeBadgeUnlocks(apiKeyId: string): BadgeUnlockEvent[] {
  const events = recentUnlocks.get(apiKeyId) || [];
  recentUnlocks.delete(apiKeyId);
  return events;
}

/**
 * Create a ReadableStream for badge unlock notifications via SSE.
 */
export function createBadgeNotificationStream(
  apiKeyId: string,
  signal?: AbortSignal
): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Check for unlocks every 2s
      const interval = setInterval(() => {
        const events = consumeBadgeUnlocks(apiKeyId);
        for (const event of events) {
          controller.enqueue(
            encoder.encode(`event: badge_unlock\ndata: ${JSON.stringify(event)}\n\n`)
          );
        }
      }, 2000);

      // Heartbeat every 15s
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
      }, 15_000);

      // Cleanup on abort
      const cleanup = () => {
        clearInterval(interval);
        clearInterval(heartbeat);
        controller.close();
      };

      if (signal) {
        signal.addEventListener("abort", cleanup);
      }
    },
  });
}
