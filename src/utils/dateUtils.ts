export function formatRelativeTime(dateInput?: string | number | Date): string {
  if (!dateInput) return 'Just now';

  const strInput = String(dateInput).trim();
  if (
    strInput === 'Just now' ||
    strInput === 'Sponsored' ||
    strInput.endsWith(' ago') ||
    strInput.endsWith('m ago') ||
    strInput.endsWith('h ago') ||
    strInput.endsWith('d ago')
  ) {
    return strInput;
  }

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    return strInput;
  }

  const now = new Date();
  const secondsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsAgo < 10) {
    return 'Just now';
  }
  if (secondsAgo < 60) {
    return `${secondsAgo} seconds ago`;
  }

  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) {
    return `${minutesAgo} ${minutesAgo === 1 ? 'minute' : 'minutes'} ago`;
  }

  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) {
    return `${hoursAgo} ${hoursAgo === 1 ? 'hour' : 'hours'} ago`;
  }

  const daysAgo = Math.floor(hoursAgo / 24);
  if (daysAgo < 7) {
    return `${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago`;
  }

  const weeksAgo = Math.floor(daysAgo / 7);
  if (weeksAgo < 4) {
    return `${weeksAgo} ${weeksAgo === 1 ? 'week' : 'weeks'} ago`;
  }

  const monthsAgo = Math.floor(daysAgo / 30);
  if (monthsAgo < 12) {
    return `${monthsAgo} ${monthsAgo === 1 ? 'month' : 'months'} ago`;
  }

  const yearsAgo = Math.floor(daysAgo / 365);
  return `${yearsAgo} ${yearsAgo === 1 ? 'year' : 'years'} ago`;
}

export function getTimestampAgeInMinutes(timestampStr?: string): number {
  if (!timestampStr) return 0;
  const str = String(timestampStr).trim();

  // Handle ISO date format (e.g. 2026-08-04T04:25:00.000Z) or standard date parseable strings
  if (/^\d{4}-\d{2}-\d{2}/.test(str) || (str.includes('T') && (str.includes('Z') || str.includes('+')))) {
    const ms = Date.parse(str);
    if (!isNaN(ms)) {
      const ageMinutes = (Date.now() - ms) / (1000 * 60);
      return Math.max(0, ageMinutes);
    }
  }

  const lower = str.toLowerCase();
  if (lower.includes('just now') || lower.includes('30s') || lower.includes('sec')) return 0.1;
  if (lower.includes('min') || lower.includes('m ago') || lower.endsWith('m')) {
    const match = lower.match(/\d+/);
    return match ? parseInt(match[0], 10) : 3;
  }
  if (lower.includes('hr') || lower.includes('h ago') || lower.includes('hour') || lower.endsWith('h')) {
    const match = lower.match(/\d+/);
    return match ? parseInt(match[0], 10) * 60 : 120;
  }
  if (lower.includes('yesterday')) return 1440;
  if (lower.includes('day') || lower.includes('d ago') || lower.endsWith('d')) {
    const match = lower.match(/\d+/);
    return match ? parseInt(match[0], 10) * 1440 : 1440;
  }
  if (lower.includes('sponsored') || lower.includes('live desk')) return 0;

  const ms = Date.parse(str);
  if (!isNaN(ms)) {
    const ageMinutes = (Date.now() - ms) / (1000 * 60);
    return Math.max(0, ageMinutes);
  }

  return 9999;
}

export function getTimestampMs(timestampStr?: string): number {
  if (!timestampStr) return Date.now();
  const str = String(timestampStr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str) || (str.includes('T') && (str.includes('Z') || str.includes('+')))) {
    const ms = Date.parse(str);
    if (!isNaN(ms)) return ms;
  }
  const ageInMinutes = getTimestampAgeInMinutes(str);
  return Date.now() - ageInMinutes * 60 * 1000;
}

export function formatExactDateTime(dateInput?: string | number | Date): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    return String(dateInput);
  }
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

