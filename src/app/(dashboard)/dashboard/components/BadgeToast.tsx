"use client";

import { useState, useEffect, useCallback } from "react";

interface BadgeUnlockEvent {
  badgeId: string;
  badgeName: string;
  badgeIcon: string;
  badgeRarity: string;
}

const RARITY_COLORS: Record<string, string> = {
  common: "border-gray-500 bg-gray-800",
  uncommon: "border-green-500 bg-green-900/30",
  rare: "border-blue-500 bg-blue-900/30",
  legendary: "border-yellow-500 bg-yellow-900/30",
};

export function BadgeToast({ apiKeyId }: { apiKeyId: string }) {
  const [toasts, setToasts] = useState<BadgeUnlockEvent[]>([]);

  const addToast = useCallback((event: BadgeUnlockEvent) => {
    setToasts((prev) => [...prev, event]);
    // Auto-dismiss after 5s
    setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 5000);
  }, []);

  useEffect(() => {
    const es = new EventSource(`/api/gamification/notifications?apiKeyId=${apiKeyId}`);

    es.addEventListener("badge_unlock", (event) => {
      try {
        const data = JSON.parse(event.data) as BadgeUnlockEvent;
        addToast(data);
      } catch {
        // ignore parse errors
      }
    });

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [apiKeyId, addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast, i) => (
        <div
          key={`${toast.badgeId}-${i}`}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 shadow-lg animate-slide-in ${RARITY_COLORS[toast.badgeRarity] || RARITY_COLORS.common}`}
        >
          <span className="text-2xl">🏆</span>
          <div>
            <div className="font-semibold text-white">Badge Unlocked!</div>
            <div className="text-sm text-text-muted">{toast.badgeName}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
