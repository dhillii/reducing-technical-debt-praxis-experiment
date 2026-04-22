import {clsx, type ClassValue} from 'clsx';
import isEmail from 'validator/es/lib/isEmail';
import {twMerge} from 'tailwind-merge';
import moment, {Moment} from 'moment-timezone';

/* Generic helper functions
/* -------------------------------------------------------------------------- */

// Helper to merge Tailwind classes
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Helper to debounce a function
export function debounce<T extends unknown[]>(
    func: (...args: T) => void,
    wait: number,
    immediate: boolean = false
): (...args: T) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null;

    return function (this: unknown, ...args: T): void {
        const later = () => {
            timeoutId = null;
            if (!immediate) {
                func.apply(this, args);
            }
        };

        const callNow = immediate && !timeoutId;

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(later, wait);

        if (callNow) {
            func.apply(this, args);
        }
    };
}

// Check if string is a domain
export const isValidDomain = (value: string) =>
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(value);

/* Data formatters
/* -------------------------------------------------------------------------- */

/**
 * Convert kebab-case or snake_case to PascalCase.
 */
export const kebabToPascalCase = (str: string): string => {
    const processed = str.replace(/[-_]([a-z0-9])/gi, (_, c) => c.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

/**
 * Guard predicates for URL handling.
 */
const isEmpty = (value: string) => value.trim().length === 0;
const isEmailUrl = (url: string) => isEmail(url);
const isAnchorLink = (url: string) => /^#/.test(url);
const isProtocolRelative = (url: string) => /^(\/\/)/.test(url);
const isAbsoluteUrl = (url: string) => /^[a-zA-Z0-9-]+:/.test(url);
const isPathOrQuery = (url: string) => /^(\/|\?)/.test(url);

/**
 * Helper to display a URL from a base URL.
 */
const displayFromBase = (url: string, baseUrl: string) => {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
    return new URL(cleanUrl, base).toString();
};

/**
 * Format a URL, returning a saveable version and a display version.
 */
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    const raw = value.trim();
    if (isEmpty(raw)) {
        return baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};
    }

    if (isEmailUrl(raw)) {
        const mailto = `mailto:${raw}`;
        return {save: mailto, display: mailto};
    }

    if (isAnchorLink(raw) || isProtocolRelative(raw)) {
        return {save: raw, display: raw};
    }

    let url = raw;
    if (!baseUrl) {
        if (!url.startsWith('http')) {
            url = `https://${url}`;
        }
    }

    if (!isAbsoluteUrl(url) && !isPathOrQuery(url)) {
        return {save: url, display: url};
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url, baseUrl);
    } catch {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        const str = parsedUrl.toString();
        return {save: str, display: str};
    }

    const base = new URL(baseUrl);
    const isSameHost = parsedUrl.host === base.host;
    const isRelativePath = parsedUrl.pathname.startsWith(base.pathname) || `${parsedUrl.pathname}/` === base.pathname;

    if (isSameHost && isRelativePath) {
        url = url
            .replace(/^[a-zA-Z0-9-]+:/, '')
            .replace(/^\/\//, '')
            .replace(base.host, '')
            .replace(base.pathname, '');

        if (!url.startsWith('/')) {
            url = `/${url}`;
        }
    }

    if (!url.endsWith('/') && !/[.#?]/.test(url)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

/**
 * Format date for stats query.
 */
export const formatQueryDate = (date: Moment) => date.format('YYYY-MM-DD');

/**
 * Guard predicates for date handling.
 */
const isIsoFormat = (s: string) => s.includes('T') || s.includes('Z');
const hasTimeComponent = (s: string) => s.includes(':');

/**
 * Format date for UI.
 */
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    // Accept Date objects
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }

    if (!dateString || typeof dateString !== 'string') {
        return '';
    }

    const iso = isIsoFormat(dateString);
    const hasTime = hasTimeComponent(dateString);

    let day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean;

    if (timezone && iso) {
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

        if (hasTime && !iso) {
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

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNames[month];

    return isToday ? `${day} ${monthName}` : `${day} ${monthName}${isCurrentYear ? '' : ` ${year}`}`;
};

/**
 * Format a plain time in a given time zone.
 *
 * @example
 * formatDisplayTime('2020-04-20T18:09:12.345Z', 'Africa/Lagos')
 * // 7:09pm
 */
export const formatDisplayTime = (dateString: string, timezone: string): string =>
    moment(dateString).tz(timezone).format('h:mma');

/**
 * Guard predicates for timestamp handling.
 */
const isInvalidDate = (d: Date) => isNaN(d.getTime());

/**
 * Helper function to format timestamp.
 */
export const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isInvalidDate(date)) {
        return 'Unknown';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (diffMs < 0) {
        return 'Just now';
    }

    const mins = Math.floor(diffMs / (1000 * 60));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;

    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
    if (hrs < 24) return `${hrs} hr ago`;

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: days > 365 ? 'numeric' : undefined,
    });
};

/**
 * Add thousands indicator to numbers.
 */
export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

/**
 * Abbreviate numbers.
 */
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

/**
 * Format time duration.
 */
export const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

/**
 * Format a fraction to percentage.
 */
export const formatPercentage = (value: number) => {
    const pct = value * 100;
    if (pct === 0) return '0%';
    if (pct < 0.1) return `${pct.toFixed(2)}%`;
    if (pct < 1) return `${pct.toFixed(1)}%`;
    const rounded = Math.round(pct);
    return `${new Intl.NumberFormat('en-US').format(rounded)}%`;
};

/**
 * Convert cents to dollars.
 */
export const centsToDollars = (value: number) => Math.round(value / 100);

/* Chart formatters
/* -------------------------------------------------------------------------- */

/**
 * Helper to round a number to the nearest multiple of its magnitude.
 */
const roundToNearestMultiple = (num: number): number => {
    if (num === 0) return 0;
    const magnitude = Math.floor(Math.log10(num));
    const multiple = Math.pow(10, magnitude);
    return Math.round(num / multiple) * multiple;
};

/**
 * Calculates the Y-axis range with large padding.
 */
export const getYRangeWithLargePadding = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) return {min: 0, max: 1};

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    const magnitude = Math.floor(Math.log10(Math.max(max, 1)));
    const padding = Math.pow(10, magnitude);

    min = Math.max(0, min - padding);
    max = max + padding;

    return {min: roundToNearestMultiple(min), max: roundToNearestMultiple(max)};
};

/**
 * Calculates the Y-axis range with standard padding.
 */
export const getYRange = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) return {min: 0, max: 1};

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
        const v = min;
        return {min: Math.max(0, v - 1), max: v + 1};
    }

    const paddingFactor = 0.02;
    min = Math.max(0, min - min * paddingFactor);
    max = max + max * paddingFactor;

    const range = max - min;
    const magnitude = Math.floor(Math.log10(range));
    const step = Math.pow(10, magnitude);

    const roundedMax = Math.round(max / step) * step;
    max = roundedMax < max ? Math.ceil(max / step) * step : roundedMax;

    const roundedMin = Math.round(min / step) * step;
    min = roundedMin > min ? Math.floor(min / step) * step : roundedMin;
    min = Math.max(0, min);

    if (min === max) {
        const mid = (min + max) / 2;
        const extra = Math.max(Math.abs(mid) * paddingFactor, step);
        min = Math.max(0, Math.floor(mid - extra));
        max = Math.ceil(mid + extra);
    }

    return {min, max};
};

/**
 * Adds minimal padding when the Y-axis starts at zero.
 */
export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) return [range.min, range.max];
    const padding = 0.005;
    const minPad = -2;
    return [Math.min(range.min - range.max * padding, minPad), range.max];
};

/**
 * Calculates the width needed for the Y-axis based on tick formatting.
 */
export const calculateYAxisWidth = (ticks: number[], formatter: (v: number) => string): number => {
    if (!ticks.length) return 40;
    const maxLen = Math.max(...ticks.map(t => formatter(t).length));
    return Math.max(20, maxLen * 8 + 20);
};

/**
 * Get range for start date.
 */
export const getRangeForStartDate = (startDate: string) => {
    const published = new Date(startDate);
    const today = new Date();
    const diff = today.getTime() - published.getTime();
    const days = Math.ceil(diff / (1000 * 3600 * 24));
    return Math.max(days, 1);
};

/**
 * Return start and end dates for charts.
 */
export const getRangeDates = (range: number) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const end = moment().tz(tz).endOf('day');
    const start = range === -1
        ? moment().tz(tz).startOf('year')
        : moment().tz(tz).subtract(range - 1, 'days').startOf('day');
    return {startDate: start, endDate: end, timezone: tz};
};

/**
 * Convert a country code to its flag emoji.
 */
export function getCountryFlag(countryCode: string) {
    if (!countryCode || countryCode.toUpperCase() === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ') {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
}

/**
 * Predicate to determine if weekly aggregation is needed.
 */
const shouldAggregateWeekly = (range: number) => range >= 91 && range <= 356;

/**
 * Predicate to determine if monthly aggregation is needed.
 */
const shouldAggregateMonthly = (range: number) => range > 356;

/**
 * Process weekly aggregation.
 */
function aggregateWeekly<T extends {date: string}>(
    data: T[],
    field: keyof T,
    type: 'sum' | 'avg' | 'exact'
): T[] {
    const result: T[] = [];
    let weekStart = moment(data[0].date).startOf('week');
    let total = 0;
    let count = 0;
    let last = 0;

    data.forEach((item, idx) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(weekStart, 'week')) {
            total += Number(item[field]);
            count += 1;
            last = Number(item[field]);
        } else {
            result.push({
                ...data[idx - 1],
                date: weekStart.format('YYYY-MM-DD'),
                [field]: type === 'sum' ? total : type === 'avg' ? (count ? total / count : 0) : last,
            } as T);
            weekStart = itemDate.startOf('week');
            total = Number(item[field]);
            count = 1;
            last = Number(item[field]);
        }

        if (idx === data.length - 1) {
            result.push({
                ...item,
                date: weekStart.format('YYYY-MM-DD'),
                [field]: type === 'sum' ? total : type === 'avg' ? (count ? total / count : 0) : last,
            } as T);
        }
    });

    return result;
}

/**
 * Process monthly aggregation.
 */
function aggregateMonthly<T extends {date: string}>(
    data: T[],
    field: keyof T,
    type: 'sum' | 'avg' | 'exact'
): T[] {
    const result: T[] = [];
    let monthStart = moment(data[0].date).startOf('month');
    let total = 0;
    let count = 0;
    let last = 0;

    data.forEach((item, idx) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(monthStart, 'month')) {
            total += Number(item[field]);
            count += 1;
            last = Number(item[field]);
        } else {
            result.push({
                ...data[idx - 1],
                date: monthStart.format('YYYY-MM-DD'),
                [field]: type === 'sum' ? total : type === 'avg' ? (count ? total / count : 0) : last,
            } as T);
            monthStart = itemDate.startOf('month');
            total = Number(item[field]);
            count = 1;
            last = Number(item[field]);
        }

        if (idx === data.length - 1) {
            result.push({
                ...item,
                date: monthStart.format('YYYY-MM-DD'),
                [field]: type === 'sum' ? total : type === 'avg' ? (count ? total / count : 0) : last,
            } as T);
        }
    });

    return result;
}

/**
 * Sanitizes chart data based on the date range.
 */
export const sanitizeChartData = <T extends {date: string}>(
    data: T[],
    range: number,
    fieldName: keyof T = 'value' as keyof T,
    aggregationType: 'sum' | 'avg' | 'exact' = 'avg'
): T[] => {
    if (!data.length) return [];

    if (shouldAggregateWeekly(range)) {
        return aggregateWeekly(data, fieldName, aggregationType);
    }

    if (shouldAggregateMonthly(range)) {
        return aggregateMonthly(data, fieldName, aggregationType);
    }

    return data;
};

/**
 * Formats a date based on the range.
 */
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

/**
 * Member formatters.
 */
export const formatMemberName = (member: {name?: string; email?: string}) =>
    (member.name && member.name.trim()) || member.email || 'Unknown Member';

export const getMemberInitials = (member: {name?: string}) => {
    const name = formatMemberName(member);
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

export const stringToHslColor = (str: string, saturation: string, lightness: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, ${saturation}%, ${lightness}%)`;
};