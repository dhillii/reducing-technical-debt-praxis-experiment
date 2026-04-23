```ts
import {clsx, type ClassValue} from 'clsx';
import isEmail from 'validator/es/lib/isEmail';
import {twMerge} from 'tailwind-merge';
import moment, {Moment} from 'moment-timezone';

/* Generic helper functions
/* -------------------------------------------------------------------------- */

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function debounce<T extends unknown[]>(
  func: (...args: T) => void,
  wait: number,
  immediate = false
): (...args: T) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null;

  return function (this: unknown, ...args: T): void {
    const later = () => {
      timeoutId = null;
      if (!immediate) func.apply(this, args);
    };

    const callNow = immediate && !timeoutId;

    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(later, wait);

    if (callNow) func.apply(this, args);
  };
}

export const isValidDomain = (value: string) =>
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(
    value
  );

/* Data formatters
/* -------------------------------------------------------------------------- */

export const kebabToPascalCase = (str: string): string => {
  const processed = str.replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
  return processed.charAt(0).toUpperCase() + processed.slice(1);
};

const isAnchorLink = (url: string) => url.startsWith('#');
const isProtocolRelative = (url: string) => url.startsWith('//');

const ensureTrailingSlash = (url: string) =>
  !/[.#?]/.test(url) && !url.endsWith('/') ? `${url}/` : url;

const displayFromBase = (url: string, baseUrl: string) => {
  const base = new URL(baseUrl);
  const relative = url.replace(base.origin, '');
  return new URL(relative, base).toString();
};

export const formatUrl = (
  value: string,
  baseUrl?: string,
  nullable?: boolean
) => {
  if (nullable && !value) return {save: null, display: ''};

  const trimmed = value.trim();
  if (!trimmed) {
    if (baseUrl) return {save: '/', display: baseUrl};
    return {save: '', display: ''};
  }

  if (isEmail(trimmed)) {
    const mailto = `mailto:${trimmed}`;
    return {save: mailto, display: mailto};
  }

  if (isAnchorLink(trimmed) || isProtocolRelative(trimmed)) {
    return {save: trimmed, display: trimmed};
  }

  let url = trimmed;
  if (!baseUrl && !url.startsWith('http')) url = `https://${url}`;

  if (!url.match(/^[a-zA-Z0-9-]+:/) && !url.match(/^(\/|\?)/)) {
    return {save: url, display: url};
  }

  let parsed: URL;
  try {
    parsed = new URL(url, baseUrl);
  } catch {
    return {save: url, display: url};
  }

  if (!baseUrl) return {save: parsed.toString(), display: parsed.toString()};

  const base = new URL(baseUrl);
  const isSameHost = parsed.host === base.host;
  const isRelative = parsed.pathname.startsWith(base.pathname);

  if (isSameHost && isRelative) {
    let relative = parsed.pathname + parsed.search + parsed.hash;
    if (!relative.startsWith('/')) relative = '/' + relative;
    relative = ensureTrailingSlash(relative);
    return {save: relative, display: displayFromBase(relative, baseUrl)};
  }

  url = ensureTrailingSlash(url);
  return {save: url, display: displayFromBase(url, baseUrl)};
};

export const formatQueryDate = (date: Moment) => date.format('YYYY-MM-DD');

export const formatDisplayDate = (
  dateString: string,
  timezone?: string
): string => {
  if (dateString instanceof Date) dateString = dateString.toISOString();
  if (!dateString || typeof dateString !== 'string') return '';

  const hasTime = dateString.includes(':');
  const isISO = dateString.includes('T') || dateString.includes('Z');

  let day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean;

  if (timezone && isISO) {
    const d = moment.tz(dateString, timezone);
    const today = moment.tz(timezone);
    day = d.date();
    month = d.month();
    year = d.year();
    isToday = d.isSame(today, 'day');
    isCurrentYear = year === today.year();
  } else {
    const d = new Date(dateString);
    const today = new Date();
    if (hasTime && !isISO) {
      day = d.getDate();
      month = d.getMonth();
      year = d.getFullYear();
      isToday = d.toDateString() === today.toDateString();
      isCurrentYear = year === today.getFullYear();
    } else {
      day = d.getUTCDate();
      month = d.getUTCMonth();
      year = d.getUTCFullYear();
      isToday = d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
      isCurrentYear = year === today.getUTCFullYear();
    }
  }

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  const monthName = months[month];

  if (isToday) return `${day} ${monthName}`;
  return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

export const formatDisplayTime = (dateString: string, timezone: string) =>
  moment(dateString).tz(timezone).format('h:mma');

export const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  if (isNaN(date.getTime())) return 'Unknown';

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: diffDays > 365 ? 'numeric' : undefined
  });
};

export const formatNumber = (value: number): string => {
  if (isNaN(value) || !isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US').format(Math.round(value));
};

export function abbreviateNumber(number: number) {
  const num = Number(number);
  if (num < 1000) return formatNumber(num);

  if (num < 1_000_000) {
    const roundTo = num < 100_000 ? 100 : 1_000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1_000;
    if (abbreviated === 1_000) return '1M';
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}k`;
  }

  const roundTo = 100_000;
  const rounded = Math.round(num / roundTo) * roundTo;
  const abbreviated = rounded / 1_000_000;
  const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
  return `${formatted}M`;
}

export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h <= 0) return m <= 0 ? `${s}s` : `${m}m ${s}s`;
  return `${h}h ${m}m ${s}s`;
};

export const formatPercentage = (value: number) => {
  const pct = value * 100;
  if (pct === 0) return '0%';
  if (pct < 0.1) return `${pct.toFixed(2)}%`;
  if (pct < 1) return `${pct.toFixed(1)}%`;
  const rounded = Math.round(pct);
  return `${new Intl.NumberFormat('en-US').format(rounded)}%`;
};

export const centsToDollars = (value: number) => Math.round(value / 100);

/* Chart formatters
/* -------------------------------------------------------------------------- */

export const getYRangeWithLargePadding = (data: {value: number}[]) => {
  if (!data.length) return {min: 0, max: 1};

  const values = data.map(d => Number(d.value));
  let min = Math.min(...values);
  let max = Math.max(...values);

  const roundToNearest = (num: number) => {
    if (num === 0) return 0;
    const magnitude = Math.floor(Math.log10(num));
    const multiple = Math.pow(10, magnitude);
    return Math.round(num / multiple) * multiple;
  };

  const magnitude = Math.floor(Math.log10(Math.max(max, 1)));
  const padding = Math.pow(10, magnitude);

  min = Math.max(0, min - padding);
  max += padding;

  min = roundToNearest(min);
  max = roundToNearest(max);

  return {min, max};
};

export const getYRange = (data: {value: number}[]) => {
  if (!data.length) return {min: 0, max: 1};

  const values = data.map(d => Number(d.value));
  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) return {min: Math.max(0, min - 1), max: max + 1};

  const padding = 0.02;
  min = Math.max(0, min - min * padding);
  max += max * padding;

  const range = max - min;
  const roundTo = Math.pow(10, Math.floor(Math.log10(range)));

  const roundMax = Math.round(max / roundTo) * roundTo;
  max = roundMax < max ? Math.ceil(max / roundTo) * roundTo : roundMax;

  const roundMin = Math.round(min / roundTo) * roundTo;
  min = roundMin > min ? Math.floor(min / roundTo) * roundTo : roundMin;
  min = Math.max(0, min);

  if (min === max) {
    const mid = (min + max) / 2;
    const small = Math.max(Math.abs(mid) * padding, roundTo);
    min = Math.max(0, Math.floor(mid - small));
    max = Math.ceil(mid + small);
  }

  return {min, max};
};

export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
  if (range.min !== 0) return [range.min, range.max];
  const padding = 0.005;
  const minPadding = -2;
  return [Math.min(range.min - range.max * padding, minPadding), range.max];
};

export const calculateYAxisWidth = (
  ticks: number[],
  formatter: (value: number) => string
) => {
  if (!ticks.length) return 40;
  const maxLen = Math.max(...ticks.map(t => formatter(t).length));
  return Math.max(20, maxLen * 8 + 20);
};

export const getRangeForStartDate = (startDate: string) => {
  const published = new Date(startDate);
  const today = new Date();
  const diff = Math.ceil((today.getTime() - published.getTime()) / (1000 * 3600 * 24));
  return Math.max(diff, 1);
};

export const getRangeDates = (range: number) => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const end = moment().tz(tz).endOf('day');
  const start = range === -1
    ? moment().tz(tz).startOf('year')
    : moment().tz(tz).subtract(range - 1, 'days').startOf('day');
  return {startDate: start, endDate: end, timezone: tz};
};

export function getCountryFlag(countryCode: string) {
  if (!countryCode || countryCode === null || countryCode.toUpperCase() === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ')
    return '🏳️';
  return countryCode
    .toUpperCase()
    .replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
}

export const sanitizeChartData = <T extends {date: string}>(
  data: T[],
  range: number,
  fieldName: keyof T = 'value' as keyof T,
  aggregationType: 'sum' | 'avg' | 'exact' = 'avg'
): T[] => {
  if (!data.length) return [];

  const aggregate = (total: number, count: number, last: number) => {
    if (aggregationType === 'sum') return total;
    if (aggregationType === 'avg') return count > 0 ? total / count : 0;
    return last;
  };

  const process = (
    items: T[],
    unit: 'week' | 'month'
  ): T[] => {
    const result: T[] = [];
    let current = moment(items[0].date)[unit]('startOf');
    let total = 0;
    let count = 0;
    let last = 0;

    items.forEach((item, idx) => {
      const itemDate = moment(item.date);
      const sameUnit = itemDate.isSame(current, unit);
      const value = Number(item[fieldName]);

      if (sameUnit) {
        total += value;
        count += 1;
        last = value;
      } else {
        result.push({
          ...items[idx - 1],
          date: current.format('YYYY-MM-DD'),
          [fieldName]: aggregate(total, count, last)
        } as T);

        current = itemDate[unit]('startOf');
        total = value;
        count = 1;
        last = value;
      }

      if (idx === items.length - 1) {
        result.push({
          ...item,
          date: current.format('YYYY-MM-DD'),
          [fieldName]: aggregate(total, count, last)
        } as T);
      }
    });

    return result;
  };

  if (range >= 91 && range <= 356) return process(data, 'week');
  if (range > 356) return process(data, 'month');
  return data;
};

export const formatDisplayDateWithRange = (
  date: string,
  range: number,
  showHours = false,
  hoursOnly = false
) => {
  if (range === 1 && hoursOnly) return moment(date).format('h:mma');
  if (range === 1 && showHours) return moment(date).format('MMM D, h:mma');
  if (range > 365) return moment(date).format('MMM YYYY');
  if (range >= 91) return `Week of ${formatDisplayDate(date)}`;
  return formatDisplayDate(date);
};

export const formatMemberName = (member: {name?: string; email?: string}) =>
  (member.name && member.name.trim()) || member.email || 'Unknown Member';

export const getMemberInitials = (member: {name?: string}) => {
  const name = formatMemberName(member);
  const words = name.split(' ');
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

export const stringToHslColor = (str: string, saturation: string, lightness: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = hash % 360;
  return `hsl(${h}, ${saturation}%, ${lightness}%)`;
};
```