// Community-local time helpers. Every community carries an IANA timezone
// (`communities.timezone`); crons sweep all communities hourly and gate each
// one on ITS local hour, and "today"/"tomorrow" for reminders is the
// community-local calendar date (docs/tenancy-design.md §7).

/** YYYY-MM-DD for `now + offsetDays` in the given timezone. */
export function localDate(timezone: string, offsetDays = 0, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000)
  // en-CA formats as YYYY-MM-DD; timeZone makes it the community-local date.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone(timezone), year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(shifted)
}

/** 0–23 hour of `now` in the given timezone. */
export function localHour(timezone: string, now: Date = new Date()): number {
  const text = new Intl.DateTimeFormat('en-US', { timeZone: safeZone(timezone), hour: 'numeric', hour12: false }).format(now)
  const h = parseInt(text, 10)
  return Number.isFinite(h) ? h % 24 : now.getUTCHours()
}

/** Short zone label for admin copy ("PDT", "CEST"); falls back to the IANA name. */
export function zoneLabel(timezone: string, now: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: safeZone(timezone), timeZoneName: 'short' })
      .formatToParts(now).find(p => p.type === 'timeZoneName')
    return part?.value ?? timezone
  } catch {
    return timezone
  }
}

// An invalid IANA name would throw inside Intl; treat it as UTC and warn once.
const warned = new Set<string>()
function safeZone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return timezone
  } catch {
    if (!warned.has(timezone)) {
      warned.add(timezone)
      console.warn(`[community-time] invalid timezone "${timezone}" — using UTC`)
    }
    return 'UTC'
  }
}

// Per-community send hours (local). Overridable per community via
// communities.settings — { nudge_hour_local, reminder_morning_hour_local,
// reminder_evening_hour_local }; these defaults reproduce Glåüm's original
// UTC cron times in Pacific daylight time.
export const DEFAULT_NUDGE_HOUR_LOCAL = 9
export const DEFAULT_REMINDER_MORNING_HOUR_LOCAL = 8
export const DEFAULT_REMINDER_EVENING_HOUR_LOCAL = 19

export function settingHour(settings: Record<string, unknown>, key: string, fallback: number): number {
  const v = settings[key]
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback
}
