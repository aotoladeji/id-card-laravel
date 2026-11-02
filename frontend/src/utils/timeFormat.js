// Converts a "HH:MM" or "HH:MM:SS" 24-hour time string to 12-hour clock format, e.g. "14:00" -> "2:00 PM".
export function formatTime12Hour(time) {
  if (!time) return 'N/A';

  const [hourStr, minuteStr] = String(time).split(':');
  const hour24 = parseInt(hourStr, 10);
  if (Number.isNaN(hour24)) return time;

  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;

  return `${hour12}:${(minuteStr || '00').padStart(2, '0')} ${period}`;
}
