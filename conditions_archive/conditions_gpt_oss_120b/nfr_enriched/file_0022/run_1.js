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
 * Build the display and save values for a URL based on its type.
 */
function buildUrlResult(save: string | null, display: string): {save: string | null; display: string} {
    return {save, display};
}

/**
 * Handle nullable input for formatUrl.
 */
function handleNullableUrl(value: string, nullable?: boolean) {
    if (nullable && !value) {
        return buildUrlResult(null, '');
    }
    return null;
}

/**
 * Trim and validate the raw input.
 */
function normalizeUrlInput(value: string) {
    const url = value.trim();
    if (!url) {
        return null;
    }
    return url;
}

/**
 * Resolve protocol‑relative or anchor URLs.
 */
function resolveSpecialUrls(url: string) {
    if (url.match(/^#/)) {
        return buildUrlResult(url, url);
    }
    if (url.match(/^(\/\/)/)) {
        return buildUrlResult(url, url);
    }
    return null;
}

/**
 * Ensure a URL has a protocol when no base URL is provided.
 */
function ensureProtocol(url: string, baseUrl?: string) {
    if (!baseUrl && !url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
}

/**
 * Determine if a URL is absolute or relative.
 */
function isAbsoluteOrRooted(url: string) {
    return url.match(/^[a-zA-Z0-9-]+:/) || url.match(/^(\/|\?)/);
}

/**
 * Parse a URL safely, falling back to the original string on error.
 */
function safeParseUrl(url: string, baseUrl?: string) {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
}

/**
 * Adjust a URL to be relative to a base URL when possible.
 */
function makeRelativeIfPossible(
    parsedUrl: URL,
    baseUrl: string,
    parsedBase: URL
): string {
    const isSameHost = parsedUrl.host === parsedBase.host;
    const isPathWithinBase = parsedUrl.pathname.startsWith(parsedBase.pathname);

    // Handle edge case where base path ends with a trailing slash
    const isTrailingSlashMatch = `${parsedUrl.pathname}/` === parsedBase.pathname;

    const relative = isSameHost && (isPathWithinBase || isTrailingSlashMatch);
    if (!relative) {
        return parsedUrl.toString();
    }

    let relativePath = parsedUrl.href
        .replace(/^[a-zA-Z0-9-]+:/, '')
        .replace(/^\/\//, '')
        .replace(parsedBase.host, '')
        .replace(parsedBase.pathname, '');

    if (!relativePath.startsWith('/')) {
        relativePath = `/${relativePath}`;
    }

    return relativePath;
}

/**
 * Ensure a URL ends with a trailing slash when appropriate.
 */
function ensureTrailingSlash(url: string) {
    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        return `${url}/`;
    }
    return url;
}

/**
 * Helper to display a URL from a base URL.
 */
const displayFromBase = (url: string, baseUrl: string) => {
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }
    if (url.startsWith('/')) {
        url = url.substring(1);
    }
    return new URL(url, baseUrl).toString();
};

/**
 * Format a URL for storage and display.
 */
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    const nullableResult = handleNullableUrl(value, nullable);
    if (nullableResult) return nullableResult;

    const trimmed = normalizeUrlInput(value);
    if (!trimmed) {
        return baseUrl ? buildUrlResult('/', baseUrl) : buildUrlResult('', '');
    }

    if (isEmail(trimmed)) {
        const mailto = `mailto:${trimmed}`;
        return buildUrlResult(mailto, mailto);
    }

    const special = resolveSpecialUrls(trimmed);
    if (special) return special;

    const urlWithProtocol = ensureProtocol(trimmed, baseUrl);
    if (!isAbsoluteOrRooted(urlWithProtocol)) {
        return buildUrlResult(urlWithProtocol, urlWithProtocol);
    }

    const parsed = safeParseUrl(urlWithProtocol, baseUrl);
    if (!parsed) {
        return buildUrlResult(urlWithProtocol, urlWithProtocol);
    }

    if (!baseUrl) {
        return buildUrlResult(parsed.toString(), parsed.toString());
    }

    const parsedBase = new URL(baseUrl);
    const relative = makeRelativeIfPossible(parsed, baseUrl, parsedBase);
    const finalUrl = ensureTrailingSlash(relative);
    return buildUrlResult(finalUrl, displayFromBase(finalUrl, baseUrl));
};

/* Date formatters
/* -------------------------------------------------------------------------- */

// Format date for stats query
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

/**
 * Parse a date string into its components, handling optional timezone.
 */
function parseDateComponents(dateString: string, timezone?: string) {
    const isISO = dateString.includes('T') || dateString.includes('Z');
    const hasTime = dateString.includes(':');

    if (timezone && isISO) {
        const m = moment.tz(dateString, timezone);
        return {
            day: m.date(),
            month: m.month(),
            year: m.year(),
            isToday: m.isSame(moment.tz(timezone), 'day'),
            isCurrentYear: m.year() === moment.tz(timezone).year()
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
}

/**
 * Format a date for UI display.
 */
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    // Guard against unexpected types
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }
    if (!dateString || typeof dateString !== 'string') {
        return '';
    }

    const {day, month, year, isToday, isCurrentYear} = parseDateComponents(dateString, timezone);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month];

    if (isToday) {
        return `${day} ${monthName}`;
    }
    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
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

// Helper function to format timestamp
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

// Add thousands indicator to numbers
export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

// Abbreviate numbers
export function abbreviateNumber(number: number) {
    const num = Number(number);

    if (num < 1_000) {
        return formatNumber(num);
    }

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

// Format time duration
export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours <= 0) {
        if (minutes <= 0) {
            return `${remainingSeconds}s`;
        }
        return `${minutes}m ${remainingSeconds}s`;
    }

    return `${hours}h ${minutes}m ${remainingSeconds}s`;
};

// Format a fraction to percentage
export const formatPercentage = (value: number) => {
    const percentage = value * 100;
    if (percentage === 0) return '0%';
    if (percentage < 0.1) return `${percentage.toFixed(2)}%`;
    if (percentage < 1) return `${percentage.toFixed(1)}%`;
    const rounded = Math.round(percentage);
    return `${new Intl.NumberFormat('en-US').format(rounded)}%`;
};

// Format cents to Dollars
export const centsToDollars = (value: number) => {
    return Math.round(value / 100);
};

/* Chart formatters
/* -------------------------------------------------------------------------- */

/**
 * Round a number to the nearest multiple of its order of magnitude.
 */
function roundToNearestMultiple(num: number): number {
    if (num === 0) return 0;
    const magnitude = Math.floor(Math.log10(num));
    const multiple = Math.pow(10, magnitude);
    return Math.round(num / multiple) * multiple;
}

/**
 * Calculate Y‑axis range with generous padding.
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

    return {
        min: roundToNearestMultiple(min),
        max: roundToNearestMultiple(max)
    };
};

/**
 * Calculate Y‑axis range with modest padding and rounding.
 */
export const getYRange = (data: {value: number}[]): {min: number; max: number} => {
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
    const rangeMagnitude = Math.floor(Math.log10(range));
    const roundTo = Math.pow(10, rangeMagnitude);

    const roundedMax = Math.round(max / roundTo) * roundTo;
    max = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    const roundedMin = Math.round(min / roundTo) * roundTo;
    min = roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin;
    min = Math.max(0, min);

    if (min === max) {
        const mid = (min + max) / 2;
        const smallRange = Math.max(Math.abs(mid) * paddingFactor, roundTo);
        min = Math.max(0, Math.floor(mid - smallRange));
        max = Math.ceil(mid + smallRange);
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
export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string): number => {
    if (!ticks.length) return 40;
    const maxLen = Math.max(...ticks.map(t => formatter(t).length));
    return Math.max(20, maxLen * 8 + 20);
};

/**
 * Get the number of days between a start date and today (minimum 1).
 */
export const getRangeForStartDate = (startDate: string) => {
    const published = new Date(startDate);
    const today = new Date();
    const diff = today.getTime() - published.getTime();
    const days = Math.ceil(diff / (1000 * 3600 * 24));
    return Math.max(days, 1);
};

/**
 * Return start/end dates for a chart range.
 */
export const getRangeDates = (range: number) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const endDate = moment().tz(timezone).endOf('day');
    const startDate = range === -1
        ? moment().tz(timezone).startOf('year')
        : moment().tz(timezone).subtract(range - 1, 'days').startOf('day');
    return {startDate, endDate, timezone};
};

/**
 * Convert a country code to its flag emoji.
 */
export function getCountryFlag(countryCode: string) {
    if (!countryCode || ['NULL', 'ᴺᵁᴸᴸ', 'ᴺᵁ'].includes(countryCode.toUpperCase())) {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char =>
        String.fromCodePoint(char.charCodeAt(0) + 127397)
    );
}

/**
 * Aggregate chart data weekly.
 */
function aggregateWeekly<T extends {date: string}>(
    data: T[],
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T[] {
    const weekly: T[] = [];
    let currentWeek = moment(data[0].date).startOf('week');
    let weekTotal = 0;
    let weekCount = 0;
    let lastValue = 0;

    data.forEach((item, idx) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentWeek, 'week')) {
            weekTotal += Number(item[fieldName]);
            weekCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            weekly.push({
                ...data[idx - 1],
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: aggregationType === 'sum'
                    ? weekTotal
                    : aggregationType === 'avg'
                        ? weekCount ? weekTotal / weekCount : 0
                        : lastValue
            } as T);
            currentWeek = itemDate.startOf('week');
            weekTotal = Number(item[fieldName]);
            weekCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (idx === data.length - 1) {
            weekly.push({
                ...item,
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: aggregationType === 'sum'
                    ? weekTotal
                    : aggregationType === 'avg'
                        ? weekCount ? weekTotal / weekCount : 0
                        : lastValue
            } as T);
        }
    });

    return weekly;
}

/**
 * Aggregate chart data monthly.
 */
function aggregateMonthly<T extends {date: string}>(
    data: T[],
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T[] {
    const monthly: T[] = [];
    let currentMonth = moment(data[0].date).startOf('month');
    let monthTotal = 0;
    let monthCount = 0;
    let lastValue = 0;

    data.forEach((item, idx) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentMonth, 'month')) {
            monthTotal += Number(item[fieldName]);
            monthCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            monthly.push({
                ...data[idx - 1],
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]: aggregationType === 'sum'
                    ? monthTotal
                    : aggregationType === 'avg'
                        ? monthCount ? monthTotal / monthCount : 0
                        : lastValue
            } as T);
            currentMonth = itemDate.startOf('month');
            monthTotal = Number(item[fieldName]);
            monthCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (idx === data.length - 1) {
            monthly.push({
                ...item,
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]: aggregationType === 'sum'
                    ? monthTotal
                    : aggregationType === 'avg'
                        ? monthCount ? monthTotal / monthCount : 0
                        : lastValue
            } as T);
        }
    });

    return monthly;
}

/**
 * Sanitize chart data based on the date range.
 * - 91‑356 days → weekly aggregation
 * - > 356 days → monthly aggregation
 * - otherwise → original data
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
 * Formats a date based on the range.
 * - > 365 days → month and year (e.g. "Apr 2025")
 * - ≥ 91 days → "Week of [date]"
 * - range === 1 & hoursOnly → time only
 * - range === 1 & showHours → month day + time
 * - otherwise → default display format
 */
export const formatDisplayDateWithRange = (
    date: string,
    range: number,
    showHours = false,
    hoursOnly = false
): string => {
    if (range === 1 && hoursOnly) {
        return moment(date).format('h:mma');
    }
    if (range === 1 && showHours) {
        return moment(date).format('MMM D, h:mma');
    }
    if (range > 365) {
        return moment(date).format('MMM YYYY');
    }
    if (range >= 91) {
        return `Week of ${formatDisplayDate(date)}`;
    }
    return formatDisplayDate(date);
};

/* Member formatters
/* -------------------------------------------------------------------------- */

/**
 * Return a member's display name, falling back to email.
 */
export const formatMemberName = (member: {name?: string; email?: string}) => {
    return (member.name && member.name.trim()) || member.email || 'Unknown Member';
};

/**
 * Compute initials from a member's name.
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