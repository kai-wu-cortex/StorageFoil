const DAILY_SYNC_TIMES = [
  { hours: 12, minutes: 30 },
  { hours: 17, minutes: 0 },
];

export function getNextDailySyncDelayMs(now: Date = new Date()): number {
  return Math.min(
    ...DAILY_SYNC_TIMES.map(({ hours, minutes }) => {
      const candidate = new Date(now);
      candidate.setHours(hours, minutes, 0, 0);
      if (candidate.getTime() <= now.getTime()) {
        candidate.setDate(candidate.getDate() + 1);
      }
      return candidate.getTime() - now.getTime();
    }),
  );
}
