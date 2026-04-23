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
 * Build the display value from a base URL and a relative URL.
 */
const buildDisplayFromBase = (url: string, baseUrl: string) => {
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }
    if (url.startsWith('/')) {
        url = url.substring(1);
    }
    return new URL(url, baseUrl).toString();
};

/**
 * Resolve a URL relative to a base URL and return both the saved and display forms.
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

    if (/^#/.test(trimmed) || /^(\/\/)/.test(trimmed)) {
        return {save: trimmed, display: trimmed};
    }

    const absolute = resolveAbsoluteUrl(trimmed, baseUrl);
    const parsed = safeParseUrl(absolute, baseUrl);

    if (!parsed) {
        return {save: trimmed, display: trimmed};
    }

    if (!baseUrl) {
        return {save: parsed.toString(), display: parsed.toString()};
    }

    const relative = makeRelativeIfPossible(parsed, baseUrl);
    const finalUrl = ensureTrailingSlash(relative);
    return {save: finalUrl, display: buildDisplayFromBase(finalUrl, baseUrl)};
};

/**
 * Resolve a possibly protocol‑relative URL to an absolute URL.
 */
const resolveAbsoluteUrl = (url: string, baseUrl?: string) => {
    if (!baseUrl && !url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
};

/**
 * Safely parse a URL, returning undefined on failure.
 */
const safeParseUrl = (url: string, baseUrl?: string) => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return undefined;
    }
};

/**
 * If the URL shares host and path prefix with the base, convert it to a relative URL.
 */
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

/**
 * Ensure a URL ends with a slash unless it already contains a file‑like segment.
 */
const ensureTrailingSlash = (url: string) => {
    if (!/\/$/.test(url) && !/[.#?]/.test(url)) {
        return `${url}/`;
    }
    return url;
};

/**
 * Format date for stats query.
 */
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

/**
 * Format a date string for UI display.
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

/**
 * Extract day, month, year and flags from a date string, handling optional timezone.
 */
const extractDateParts = (dateString: string, timezone?: string) => {
    const hasTime = dateString.includes(':');
    const isISO = dateString.includes('T') || dateString.includes('Z');

    if (timezone && isISO) {
        const m = moment.tz(dateString, timezone);
        const now = moment.tz(timezone);
        return {
            day: m.date(),
            month: m.month(),
            year: m.year(),
            isToday: m.isSame(now, 'day'),
            isCurrentYear: m.year() === now.year()
        };
    }

    const date = new Date(dateString);
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
export const formatDisplayTime = (dateString: string, timezone: string): string => (
    moment(dateString).tz(timezone).format('h:mma')
);

/**
 * Helper function to format timestamp.
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
 * Abbreviate numbers (e.g., 12.3k, 1.2M).
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
    const abbreviated = rounded / 1_000;
    if (abbreviated === 1_000) return '1M';
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}k`;
};

const abbreviateMillions = (num: number) => {
    const roundTo = 100_000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1_000_000;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}M`;
};

/**
 * Format time duration.
 */
export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
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
 * Calculate the Y‑axis range with generous padding.
 */
export const getYRangeWithLargePadding = (data: {value: number}[]) => {
    if (!data.length) return {min: 0, max: 1};

    const values = data.map(d => Number(d.value));
    const min = Math.min(...values);
    const max = Math.max(...values);

    const magnitude = Math.floor(Math.log10(Math.max(max, 1)));
    const padding = Math.pow(10, magnitude);

    const paddedMin = Math.max(0, min - padding);
    const paddedMax = max + padding;

    return {
        min: roundToNearestMultiple(paddedMin),
        max: roundToNearestMultiple(paddedMax)
    };
};

/**
 * Round a number to the nearest multiple of its order of magnitude.
 */
const roundToNearestMultiple = (num: number) => {
    if (num === 0) return 0;
    const magnitude = Math.floor(Math.log10(num));
    const multiple = Math.pow(10, magnitude);
    return Math.round(num / multiple) * multiple;
};

/**
 * Calculate a standard Y‑axis range with percentage‑based padding.
 */
export const getYRange = (data: {value: number}[]) => {
    if (!data.length) return {min: 0, max: 1};

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
        return {min: Math.max(0, min - 1), max: min + 1};
    }

    const padded = applyPercentagePadding(min, max);
    const rounded = applyMagnitudeRounding(padded.min, padded.max);
    return ensureNonZeroRange(rounded.min, rounded.max);
};

const applyPercentagePadding = (min: number, max: number) => {
    const padding = 0.02;
    return {
        min: Math.max(0, min - min * padding),
        max: max + max * padding
    };
};

const applyMagnitudeRounding = (min: number, max: number) => {
    const range = max - min;
    const magnitude = Math.floor(Math.log10(range));
    const step = Math.pow(10, magnitude);

    const roundedMax = Math.round(max / step) * step;
    const finalMax = roundedMax < max ? Math.ceil(max / step) * step : roundedMax;

    const roundedMin = Math.round(min / step) * step;
    const finalMin = roundedMin > min ? Math.floor(min / step) * step : roundedMin;

    return {min: Math.max(0, finalMin), max: finalMax};
};

const ensureNonZeroRange = (min: number, max: number) => {
    if (min === max) {
        const mid = (min + max) / 2;
        const small = Math.max(Math.abs(mid) * 0.02, Math.pow(10, Math.floor(Math.log10(mid))));
        return {
            min: Math.max(0, Math.floor(mid - small)),
            max: Math.ceil(mid + small)
        };
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
 * Calculate the width needed for the Y‑axis based on tick labels.
 */
export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string) => {
    if (!ticks.length) return 40;
    const longest = Math.max(...ticks.map(t => formatter(t).length));
    return Math.max(20, longest * 8 + 20);
};

/**
 * Get range for a start date (in days).
 */
export const getRangeForStartDate = (startDate: string) => {
    const published = new Date(startDate);
    const today = new Date();
    const diff = Math.ceil((today.getTime() - published.getTime()) / (1000 * 3600 * 24));
    return Math.max(diff, 1);
};

/**
 * Return start and end moments for a chart range.
 */
export const getRangeDates = (range: number) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const endDate = moment().tz(tz).endOf('day');
    const startDate = range === -1
        ? moment().tz(tz).startOf('year')
        : moment().tz(tz).subtract(range - 1, 'days').startOf('day');
    return {startDate, endDate, timezone: tz};
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
 * Sanitize chart data based on the date range.
 */
export const sanitizeChartData = <T extends {date: string}>(
    data: T[],
    range: number,
    fieldName: keyof T = 'value' as keyof T,
    aggregationType: 'sum' | 'avg' | 'exact' = 'avg'
): T[] => {
    if (!data.length) return [];

    if (range >= 91 && range <= 356) {
        return aggregateWeekly(data, fieldName, aggregationType);
    }

    if (range > 356) {
        return aggregateMonthly(data, fieldName, aggregationType);
    }

    return data;
};

/**
 * Aggregate data on a weekly basis.
 */
const aggregateWeekly = <T extends {date: string}>(
    data: T[],
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T[] => {
    const result: T[] = [];
    let weekStart = moment(data[0].date).startOf('week');
    let weekTotal = 0;
    let weekCount = 0;
    let lastValue = 0;

    data.forEach((item, idx) => {
        const itemMoment = moment(item.date);
        if (itemMoment.isSame(weekStart, 'week')) {
            weekTotal += Number(item[fieldName]);
            weekCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            result.push(buildAggregatedItem(data[idx - 1], weekStart, weekTotal, weekCount, lastValue, fieldName, aggregationType));
            weekStart = itemMoment.startOf('week');
            weekTotal = Number(item[fieldName]);
            weekCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (idx === data.length - 1) {
            result.push(buildAggregatedItem(item, weekStart, weekTotal, weekCount, lastValue, fieldName, aggregationType));
        }
    });

    return result;
};

/**
 * Aggregate data on a monthly basis.
 */
const aggregateMonthly = <T extends {date: string}>(
    data: T[],
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T[] => {
    const result: T[] = [];
    let monthStart = moment(data[0].date).startOf('month');
    let monthTotal = 0;
    let monthCount = 0;
    let lastValue = 0;

    data.forEach((item, idx) => {
        const itemMoment = moment(item.date);
        if (itemMoment.isSame(monthStart, 'month')) {
            monthTotal += Number(item[fieldName]);
            monthCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            result.push(buildAggregatedItem(data[idx - 1], monthStart, monthTotal, monthCount, lastValue, fieldName, aggregationType));
            monthStart = itemMoment.startOf('month');
            monthTotal = Number(item[fieldName]);
            monthCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (idx === data.length - 1) {
            result.push(buildAggregatedItem(item, monthStart, monthTotal, monthCount, lastValue, fieldName, aggregationType));
        }
    });

    return result;
};

/**
 * Build an aggregated data point for weekly/monthly aggregation.
 */
const buildAggregatedItem = <T extends {date: string}>(
    original: T,
    periodStart: moment.Moment,
    total: number,
    count: number,
    last: number,
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T => {
    const value = aggregationType === 'sum'
        ? total
        : aggregationType === 'avg'
            ? count > 0 ? total / count : 0
            : last;

    return {
        ...original,
        date: periodStart.format('YYYY-MM-DD'),
        [fieldName]: value
    } as T;
};

/**
 * Format a date based on the range.
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

/* Member formatters
/* -------------------------------------------------------------------------- */

/**
 * Format member name with fallback to email.
 */
export const formatMemberName = (member: {name?: string; email?: string}) => {
    return (member.name?.trim()) || member.email || 'Unknown Member';
};

/**
 * Get initials from a member's name.
 */
export const getMemberInitials = (member: {name?: string}) => {
    const name = formatMemberName(member);
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

/**
 * Generate a deterministic HSL colour from a string.
 */
export const stringToHslColor = (str: string, saturation: string, lightness: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, ${saturation}%, ${lightness}%)`;
};