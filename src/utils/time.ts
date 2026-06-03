/**
 * Turkey time utility
 * Backend stores UTC time. Frontend displays with timeZone: 'Europe/Istanbul'.
 * Turkey no longer observes DST, so +3 is year-round.
 */

function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

/** Returns current time as ISO string in UTC (for published_at) */
export function turkeyNowISO(): string {
  return new Date().toISOString();
}

/** Returns current time as 'YYYY-MM-DD HH:MM:SS' in UTC (for D1 TEXT fields) */
export function turkeyNowSQL(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}
