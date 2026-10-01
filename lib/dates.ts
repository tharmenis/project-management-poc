import { formatInTimeZone } from "date-fns-tz";

export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

export function dateLabel(timeZone: string, now: Date = new Date()): string {
  return formatInTimeZone(now, timeZone, "EEE d MMM");
}

export function weekdayLabel(timeZone: string, now: Date = new Date()): string {
  return formatInTimeZone(now, timeZone, "EEEE");
}

export function isoDateLabel(iso: string, timeZone: string): string {
  return formatInTimeZone(new Date(`${iso}T12:00:00Z`), timeZone, "EEE d MMM");
}

export function shiftIsoDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
