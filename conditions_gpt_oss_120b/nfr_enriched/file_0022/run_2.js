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
export function debounce<T extends unknown[]>(func: (...args: T) => void, wait: number, immediate: boolean = false): (...args: T) => void {
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
export const isValidDomain = (value: string) => {
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(value);
};

/* Data formatters
/* -------------------------------------------------------------------------- */

// Helper to convert kebab-case to PascalCase with numbers
export const kebabToPascalCase = (str: string): string => {
    const processed = str.replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

/**
 * Resolve a URL into a save/display pair.
 * Handles emails, anchors, protocol‑relative URLs, absolute URLs,
 * and conversion to a relative path when a base URL is supplied.
 */
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

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

    const absolute = ensureAbsoluteUrl(trimmed, baseUrl);
    const parsed = tryParseUrl(absolute, baseUrl);
    if (!parsed) {
        return {save: absolute, display: absolute};
    }

    if (!baseUrl) {
        return {save: parsed.toString(), display: parsed.toString()};
    }

    const relative = makeRelativeIfPossible(parsed, baseUrl);
    const finalUrl = ensureTrailingSlash(relative);
    return {save: finalUrl, display: displayFromBase(finalUrl, baseUrl)};
};

const isAnchorLink = (url: string) => /^#/.test(url);
const isProtocolRelative = (url: string) => /^(\/\/)/.test(url);
const ensureAbsoluteUrl = (url: string, baseUrl?: string) => {
    if (!baseUrl && !url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
};
const tryParseUrl = (url: string, baseUrl?: string) => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};
const makeRelativeIfPossible = (parsedUrl: URL, baseUrl: string) => {
    const base = new URL(baseUrl);
    const sameHost = parsedUrl.host === base.host;
    const pathStartsWithBase = parsedUrl.pathname.startsWith(base.pathname);
    const pathMatchesTrailingSlash = `${parsedUrl.pathname}/` === base.pathname;

    if (sameHost && (pathStartsWithBase || pathMatchesTrailingSlash)) {
        let relative = parsedUrl.href
            .replace(/^[a-zA-Z0-9-]+:/, '')
            .replace(/^\/\//, '')
            .replace(base.host, '')
            .replace(base.pathname, '');

        if (!relative.startsWith('/')) {
            relative = `/${relative}`;
        }
        return relative;
    }
    return parsedUrl.href;
};
const ensureTrailingSlash = (url: string) => {
    if (!url.endsWith('/') && !/[.#?]/.test(url)) {
        return `${url}/`;
    }
    return url;
};

/**
 * Build a display URL from a relative URL and a base URL.
 */
const displayFromBase = (url: string, baseUrl: string) => {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const clean = url.startsWith('/') ? url.substring(1) : url;
    return new URL(clean, base).toString();
};

/**
 * Format a Moment for query usage.
 */
export const formatQueryDate = (date: Moment) => date.format('YYYY-MM-DD');

/**
 * Format a date string for UI display.
 * Handles ISO strings, local strings, and optional timezone conversion.
 */
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }
    if (!dateString || typeof dateString !== 'string') {
        return '';
    }

    const {day, month, year, isToday, isCurrentYear} = extractDateParts(dateString, timezone);
    const monthName = monthNames[month];

    return isToday ? `${day} ${monthName}` : `${day} ${monthName}${isCurrentYear ? '' : ` ${year}`}`;
};

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const extractDateParts = (input: string, timezone?: string) => {
    const hasTime = input.includes(':');
    const isISO = input.includes('T') || input.includes('Z');

    if (timezone && isISO) {
        const m = moment.tz(input, timezone);
        const now = moment.tz(timezone);
        return {
            day: m.date(),
            month: m.month(),
            year: m.year(),
            isToday: m.isSame(now, 'day'),
            isCurrentYear: m.year() === now.year()
        };
    }

    const date = new Date(input);
    const today = new Date();

    if (hasTime && !isISO) {
        return {
            day: date.getDate(),
            month: date.getMonth(),
            year: date.getFullYear(),
            isToday: date.toDateString() === today.toDateString(),
            isCurrentYear: date.getFullYear() === today.getFullYear()
        };
    }

    return {
        day: date.getUTCDate(),
        month: date.getUTCMonth(),
        year: date.getUTCFullYear(),
        isToday: date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10),
        isCurrentYear: date.getUTCFullYear() === today.getUTCFullYear()
    };
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
 * Format a timestamp into a human‑readable relative string.
 */
export const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (isNaN(date.getTime())) {
        return 'Unknown';
    }

    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) {
        return 'Just now';
    }

    const mins = Math.floor(diffMs / (1000 * 60));
    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    if (hrs < 24) return `${hrs} hr ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: days > 365 ? 'numeric' : undefined
    });
};

/**
 * Format a number with thousands separators.
 */
export const formatNumber = (value: number): string => {
    if (!Number.isFinite(value) || isNaN(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

/**
 * Abbreviate a number (e.g. 12 300 → “12.3k”).
 */
export function abbreviateNumber(number: number) {
    const num = Number(number);
    if (num < 1_000) return formatNumber(num);
    if (num < 1_000_000) return abbreviateThousands(num);
    return abbreviateMillions(num);
}
const abbreviateThousands = (num: number) => {
    const roundTo = num < 100_000 ? 100 : 1_000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbrev = rounded / 1_000;
    if (abbrev === 1_000) return '1M';
    const formatted = abbrev % 1 === 0 ? abbrev.toString() : abbrev.toFixed(1);
    return `${formatted}k`;
};
const abbreviateMillions = (num: number) => {
    const roundTo = 100_000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbrev = rounded / 1_000_000;
    const formatted = abbrev % 1 === 0 ? abbrev.toString() : abbrev.toFixed(1);
    return `${formatted}M`;
};

/**
 * Format a duration given in seconds.
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
 * Format a fraction as a percentage string.
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
 * Convert cents to whole dollars.
 */
export const centsToDollars = (value: number) => Math.round(value / 100);

/* Chart formatters
/* -------------------------------------------------------------------------- */

/**
 * Compute Y‑axis range with generous padding.
 */
export const getYRangeWithLargePadding = (data: {value: number}[]) => {
    if (!data.length) return {min: 0, max: 1};

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    const roundToNearestMultiple = (num: number) => {
        if (num === 0) return 0;
        const magnitude = Math.floor(Math.log10(num));
        const multiple = Math.pow(10, magnitude);
        return Math.round(num / multiple) * multiple;
    };

    const magnitude = Math.floor(Math.log10(Math.max(max, 1)));
    const padding = Math.pow(10, magnitude);

    min = Math.max(0, min - padding);
    max = max + padding;

    min = roundToNearestMultiple(min);
    max = roundToNearestMultiple(max);

    return {min, max};
};

/**
 * Compute Y‑axis range with modest padding.
 */
export const getYRange = (data: {value: number}[]) => {
    if (!data.length) return {min: 0, max: 1};

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
        return {min: Math.max(0, min - 1), max: min + 1};
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
 * Add minimal padding when the Y‑axis starts at zero.
 */
export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) return [range.min, range.max];
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - range.max * padding, minPadding), range.max];
};

/**
 * Estimate required Y‑axis width based on tick label lengths.
 */
export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string) => {
    if (!ticks.length) return 40;
    const longest = Math.max(...ticks.map(t => formatter(t).length));
    return Math.max(20, longest * 8 + 20);
};

/**
 * Compute day range from a start date to today (minimum 1).
 */
export const getRangeForStartDate = (startDate: string) => {
    const start = new Date(startDate);
    const today = new Date();
    const diff = Math.ceil((today.getTime() - start.getTime()) / (1000 * 3600 * 24));
    return Math.max(diff, 1);
};

/**
 * Return start/end dates for a chart range.
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
    if (!countryCode || ['NULL', 'ᴺᵁᴸᴸ', 'ᴺᵁ'].includes(countryCode.toUpperCase())) {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
}

/**
 * Aggregate chart data by week or month depending on range.
 */
export const sanitizeChartData = <T extends {date: string}>(
    data: T[],
    range: number,
    fieldName: keyof T = 'value' as keyof T,
    aggregationType: 'sum' | 'avg' | 'exact' = 'avg'
): T[] => {
    if (!data.length) return [];

    if (range >= 91 && range <= 356) {
        return aggregateByPeriod(data, 'week', fieldName, aggregationType);
    }
    if (range > 356) {
        return aggregateByPeriod(data, 'month', fieldName, aggregationType);
    }
    return data;
};

/**
 * Helper to aggregate data by a given moment unit.
 */
const aggregateByPeriod = <T extends {date: string}>(
    data: T[],
    unit: moment.unitOfTime.StartOf,
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T[] => {
    const result: T[] = [];
    let periodStart = moment(data[0].date).startOf(unit);
    let total = 0;
    let count = 0;
    let lastValue = 0;

    data.forEach((item, idx) => {
        const itemMoment = moment(item.date);
        if (itemMoment.isSame(periodStart, unit)) {
            total += Number(item[fieldName]);
            count += 1;
            lastValue = Number(item[fieldName]);
        } else {
            result.push(buildAggregatedItem(data[idx - 1], periodStart, total, count, lastValue, fieldName, aggregationType));
            periodStart = itemMoment.startOf(unit);
            total = Number(item[fieldName]);
            count = 1;
            lastValue = Number(item[fieldName]);
        }

        if (idx === data.length - 1) {
            result.push(buildAggregatedItem(item, periodStart, total, count, lastValue, fieldName, aggregationType));
        }
    });

    return result;
};

/**
 * Construct an aggregated data point.
 */
const buildAggregatedItem = <T extends {date: string}>(
    source: T,
    periodStart: moment.Moment,
    total: number,
    count: number,
    lastValue: number,
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T => {
    const value = aggregationType === 'sum'
        ? total
        : aggregationType === 'avg'
            ? count > 0 ? total / count : 0
            : lastValue;

    return {
        ...source,
        date: periodStart.format('YYYY-MM-DD'),
        [fieldName]: value
    } as T;
};

/**
 * Format a date based on the selected range.
 */
export const formatDisplayDateWithRange = (date: string, range: number, showHours = false, hoursOnly = false): string => {
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