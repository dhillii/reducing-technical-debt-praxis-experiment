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
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(value);

/* Data formatters
/* -------------------------------------------------------------------------- */

export const kebabToPascalCase = (str: string): string => {
    const processed = str.replace(/[-_]([a-z0-9])/gi, (_, c) => c.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

const isAnchorLink = (url: string) => /^#/.test(url);
const isProtocolRelative = (url: string) => /^\/\//.test(url);
const looksLikeUrl = (url: string) =>
    /^[a-zA-Z0-9-]+:/.test(url) || /^(\/|\?)/.test(url);
const ensureHttp = (url: string) => (url.startsWith('http') ? url : `https://${url}`);

const parseUrl = (url: string, baseUrl?: string): URL | null => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};

const computeRelativeUrl = (parsedUrl: URL, baseUrl: string): string => {
    const base = new URL(baseUrl);
    const isSameHost = parsedUrl.host === base.host;
    const isPathWithinBase =
        parsedUrl.pathname.startsWith(base.pathname) ||
        `${parsedUrl.pathname}/` === base.pathname;

    if (!isSameHost || !isPathWithinBase) return parsedUrl.toString();

    let relative = parsedUrl.href
        .replace(/^[a-zA-Z0-9-]+:/, '')
        .replace(/^\/\//, '')
        .replace(base.host, '')
        .replace(base.pathname, '');

    if (!relative.startsWith('/')) relative = `/${relative}`;
    if (!relative.endsWith('/') && !/[.#?]/.test(relative)) relative += '/';
    return relative;
};

export const formatUrl = (
    value: string,
    baseUrl?: string,
    nullable?: boolean
) => {
    if (nullable && !value) return {save: null, display: ''};

    const trimmed = value.trim();

    if (!trimmed) {
        return baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};
    }

    if (isEmail(trimmed)) {
        const mailto = `mailto:${trimmed}`;
        return {save: mailto, display: mailto};
    }

    if (isAnchorLink(trimmed) || isProtocolRelative(trimmed)) {
        return {save: trimmed, display: trimmed};
    }

    const urlToParse = baseUrl ? trimmed : ensureHttp(trimmed);
    if (!looksLikeUrl(urlToParse)) return {save: trimmed, display: trimmed};

    const parsed = parseUrl(urlToParse, baseUrl);
    if (!parsed) return {save: trimmed, display: trimmed};

    if (!baseUrl) {
        const str = parsed.toString();
        return {save: str, display: str};
    }

    const save = computeRelativeUrl(parsed, baseUrl);
    return {save, display: displayFromBase(save, baseUrl)};
};

const displayFromBase = (url: string, baseUrl: string) => {
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    if (url.startsWith('/')) url = url.substring(1);
    return new URL(url, baseUrl).toString();
};

export const formatQueryDate = (date: Moment) => date.format('YYYY-MM-DD');

export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (dateString instanceof Date) dateString = dateString.toISOString();
    if (!dateString || typeof dateString !== 'string') return '';

    const hasTime = dateString.includes(':');
    const isISO = dateString.includes('T') || dateString.includes('Z');

    let day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean;

    if (timezone && isISO) {
        const m = moment.tz(dateString, timezone);
        const now = moment.tz(timezone);
        day = m.date();
        month = m.month();
        year = m.year();
        isToday = m.isSame(now, 'day');
        isCurrentYear = year === now.year();
    } else {
        const d = new Date(dateString);
        const now = new Date();

        if (hasTime && !isISO) {
            day = d.getDate();
            month = d.getMonth();
            year = d.getFullYear();
            isToday = d.toDateString() === now.toDateString();
            isCurrentYear = year === now.getFullYear();
        } else {
            day = d.getUTCDate();
            month = d.getUTCMonth();
            year = d.getUTCFullYear();
            isToday = d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
            isCurrentYear = year === now.getUTCFullYear();
        }
    }

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthName = months[month];

    return isToday ? `${day} ${monthName}` : `${day} ${monthName}${isCurrentYear ? '' : ` ${year}`}`;
};

export const formatDisplayTime = (dateString: string, timezone: string): string =>
    moment(dateString).tz(timezone).format('h:mma');

export const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (isNaN(date.getTime())) return 'Unknown';
    const diff = now.getTime() - date.getTime();

    if (diff < 0) return 'Just now';
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    if (hrs < 24) return `${hrs} hr ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: days > 365 ? 'numeric' : undefined,
    });
};

export const formatNumber = (value: number): string => {
    if (!isFinite(value) || isNaN(value)) return '0';
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

export function abbreviateNumber(number: number) {
    const num = Number(number);
    if (num < 1000) return formatNumber(num);
    if (num < 1_000_000) {
        const roundTo = num < 100_000 ? 100 : 1_000;
        const rounded = Math.round(num / roundTo) * roundTo;
        const abbrev = rounded / 1000;
        if (abbrev === 1000) return '1M';
        const formatted = abbrev % 1 === 0 ? abbrev.toString() : abbrev.toFixed(1);
        return `${formatted}k`;
    }
    const roundTo = 100_000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbrev = rounded / 1_000_000;
    const formatted = abbrev % 1 === 0 ? abbrev.toString() : abbrev.toFixed(1);
    return `${formatted}M`;
}

export const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
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

    const roundToNearestMultiple = (num: number) => {
        if (num === 0) return 0;
        const mag = Math.floor(Math.log10(num));
        const mult = Math.pow(10, mag);
        return Math.round(num / mult) * mult;
    };

    const magnitude = Math.floor(Math.log10(Math.max(max, 1)));
    const padding = Math.pow(10, magnitude);
    min = Math.max(0, min - padding);
    max += padding;

    min = roundToNearestMultiple(min);
    max = roundToNearestMultiple(max);
    return {min, max};
};

export const getYRange = (data: {value: number}[]) => {
    if (!data.length) return {min: 0, max: 1};
    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) return {min: Math.max(0, min - 1), max: min + 1};

    const padding = 0.02;
    min = Math.max(0, min - min * padding);
    max += max * padding;

    const range = max - min;
    const rangeMag = Math.floor(Math.log10(range));
    const roundTo = Math.pow(10, rangeMag);

    const roundedMax = Math.round(max / roundTo) * roundTo;
    max = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    const roundedMin = Math.round(min / roundTo) * roundTo;
    min = roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin;
    min = Math.max(0, min);

    if (min === max) {
        const mid = (min + max) / 2;
        const small = Math.max(Math.abs(mid) * padding, roundTo);
        min = Math.max(0, Math.floor(mid - small));
        max = Math.ceil(mid + small);
    }
    return {min: Math.max(0, min), max};
};

export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) return [range.min, range.max];
    const padding = 0.005;
    const minPad = -2;
    return [Math.min(range.min - range.max * padding, minPad), range.max];
};

export const calculateYAxisWidth = (ticks: number[], formatter: (v: number) => string) => {
    if (!ticks.length) return 40;
    const maxLen = Math.max(...ticks.map(t => formatter(t).length));
    return Math.max(20, maxLen * 8 + 20);
};

export const getRangeForStartDate = (startDate: string) => {
    const published = new Date(startDate);
    const today = new Date();
    const diffDays = Math.ceil((today.getTime() - published.getTime()) / (1000 * 3600 * 24));
    return Math.max(diffDays, 1);
};

export const getRangeDates = (range: number) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const end = moment().tz(tz).endOf('day');
    const start =
        range === -1
            ? moment().tz(tz).startOf('year')
            : moment().tz(tz).subtract(range - 1, 'days').startOf('day');
    return {startDate: start, endDate: end, timezone: tz};
};

export function getCountryFlag(countryCode: string) {
    if (!countryCode || ['NULL', 'ᴺᵁᴸᴸ', 'ᴺᵁ'].includes(countryCode.toUpperCase())) return '🏳️';
    return countryCode
        .toUpperCase()
        .replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
}

/**
 * Sanitizes chart data based on the date range
 */
export const sanitizeChartData = <T extends {date: string}>(
    data: T[],
    range: number,
    fieldName: keyof T = 'value' as keyof T,
    aggregationType: 'sum' | 'avg' | 'exact' = 'avg'
): T[] => {
    if (!data.length) return [];

    const aggregate = (total: number, count: number, last: number) => {
        if (aggregationType === 'sum') return total;
        if (aggregationType === 'avg') return count ? total / count : 0;
        return last;
    };

    const process = (unit: moment.unitOfTime.StartOf) => {
        const result: T[] = [];
        let periodStart = moment(data[0].date).startOf(unit);
        let total = 0;
        let count = 0;
        let last = 0;

        data.forEach((item, idx) => {
            const itemMoment = moment(item.date);
            if (itemMoment.isSame(periodStart, unit)) {
                total += Number(item[fieldName]);
                count++;
                last = Number(item[fieldName]);
            } else {
                result.push({
                    ...data[idx - 1],
                    date: periodStart.format('YYYY-MM-DD'),
                    [fieldName]: aggregate(total, count, last),
                } as T);
                periodStart = itemMoment.startOf(unit);
                total = Number(item[fieldName]);
                count = 1;
                last = Number(item[fieldName]);
            }
            if (idx === data.length - 1) {
                result.push({
                    ...item,
                    date: periodStart.format('YYYY-MM-DD'),
                    [fieldName]: aggregate(total, count, last),
                } as T);
            }
        });
        return result;
    };

    if (range >= 91 && range <= 356) return process('week');
    if (range > 356) return process('month');
    return data;
};

export const formatDisplayDateWithRange = (
    date: string,
    range: number,
    showHours = false,
    hoursOnly = false
): string => {
    if (range === 1 && hoursOnly) return moment(date).format('h:mma');
    if (range === 1 && showHours) return moment(date).format('MMM D, h:mma');
    if (range > 365) return moment(date).format('MMM YYYY');
    if (range >= 91) return `Week of ${formatDisplayDate(date)}`;
    return formatDisplayDate(date);
};

/* Member formatters
/* -------------------------------------------------------------------------- */

export const formatMemberName = (member: {name?: string; email?: string}) =>
    (member.name?.trim()) || member.email || 'Unknown Member';

export const getMemberInitials = (member: {name?: string}) => {
    const name = formatMemberName(member);
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
};

export const stringToHslColor = (str: string, saturation: string, lightness: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, ${saturation}%, ${lightness}%)`;
};