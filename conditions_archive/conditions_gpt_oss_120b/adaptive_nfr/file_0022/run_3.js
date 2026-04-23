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

/**
 * Convert kebab-case or snake_case to PascalCase.
 */
export const kebabToPascalCase = (str: string): string => {
    const processed = str.replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

/**
 * Predicate: value is empty after trimming.
 */
function isEmptyTrimmed(value: string): boolean {
    return value.trim().length === 0;
}

/**
 * Predicate: string is a valid email.
 */
function isEmailString(value: string): boolean {
    return isEmail(value);
}

/**
 * Predicate: string starts with '#'.
 */
function isAnchorLink(value: string): boolean {
    return /^#/.test(value);
}

/**
 * Predicate: string starts with '//'.
 */
function isProtocolRelative(value: string): boolean {
    return /^(\/\/)/.test(value);
}

/**
 * Predicate: string looks like a URL scheme.
 */
function hasUrlScheme(value: string): boolean {
    return /^[a-zA-Z0-9-]+:/.test(value);
}

/**
 * Predicate: string starts with '/' or '?'.
 */
function isPathOrQuery(value: string): boolean {
    return /^(\/|\?)/.test(value);
}

/**
 * Helper to safely create a URL object.
 */
function tryParseUrl(url: string, base?: string): URL | null {
    try {
        return new URL(url, base);
    } catch {
        return null;
    }
}

/**
 * Helper to ensure base URL ends with '/'.
 */
function ensureTrailingSlash(url: string): string {
    return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Format a URL with optional base handling.
 */
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    const raw = value.trim();

    if (isEmptyTrimmed(raw)) {
        if (baseUrl) {
            return {save: '/', display: baseUrl};
        }
        return {save: '', display: ''};
    }

    if (isEmailString(raw)) {
        const mailto = `mailto:${raw}`;
        return {save: mailto, display: mailto};
    }

    if (isAnchorLink(raw) || isProtocolRelative(raw)) {
        return {save: raw, display: raw};
    }

    let url = raw;

    if (!baseUrl && !url.startsWith('http')) {
        url = `https://${url}`;
    }

    if (!hasUrlScheme(url) && !isPathOrQuery(url)) {
        return {save: url, display: url};
    }

    const parsed = tryParseUrl(url, baseUrl);
    if (!parsed) {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        const str = parsed.toString();
        return {save: str, display: str};
    }

    const base = new URL(baseUrl);
    const isSameHost = parsed.host === base.host;
    const isRelativePath = parsed.pathname.startsWith(base.pathname);
    const adjustedPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    let finalSave = url;

    if (isSameHost && isRelativePath) {
        finalSave = adjustedPath.replace(/^\/+/, '/');
    }

    if (!finalSave.endsWith('/') && !/[.#?]/.test(finalSave)) {
        finalSave = `${finalSave}/`;
    }

    return {save: finalSave, display: displayFromBase(finalSave, baseUrl)};
};

/**
 * Helper to display a URL from a base URL.
 */
const displayFromBase = (url: string, baseUrl: string) => {
    const base = ensureTrailingSlash(baseUrl);
    const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
    return new URL(cleanUrl, base).toString();
};

/**
 * Format date for stats query.
 */
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

/**
 * Predicate: value is a non‑empty string.
 */
function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/**
 * Predicate: string contains a time component.
 */
function containsTime(value: string): boolean {
    return value.includes(':');
}

/**
 * Predicate: string is ISO‑like.
 */
function isIsoLike(value: string): boolean {
    return value.includes('T') || value.includes('Z');
}

/**
 * Extract date components respecting optional timezone.
 */
function extractDateComponents(
    dateString: string,
    timezone?: string
): {day: number; month: number; year: number; isToday: boolean; isCurrentYear: boolean} {
    const hasTime = containsTime(dateString);
    const iso = isIsoLike(dateString);

    if (timezone && iso) {
        const dateMoment = moment.tz(dateString, timezone);
        const todayMoment = moment.tz(timezone);
        return {
            day: dateMoment.date(),
            month: dateMoment.month(),
            year: dateMoment.year(),
            isToday: dateMoment.isSame(todayMoment, 'day'),
            isCurrentYear: dateMoment.year() === todayMoment.year()
        };
    }

    const date = new Date(dateString);
    const today = new Date();

    if (hasTime && !iso) {
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
 * Format date for UI.
 */
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    // Support Date objects
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }

    if (!isNonEmptyString(dateString)) {
        return '';
    }

    const {day, month, year, isToday, isCurrentYear} = extractDateComponents(dateString, timezone);
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
export const formatDisplayTime = (dateString: string, timezone: string): string =>
    moment(dateString).tz(timezone).format('h:mma');

/**
 * Helper to format timestamp differences.
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

    if (diffMins < 1) {
        return 'Just now';
    }
    if (diffMins < 60) {
        return `${diffMins} min ago`;
    }
    if (diffHours < 24) {
        return `${diffHours} hr ago`;
    }
    if (diffDays === 1) {
        return 'Yesterday';
    }
    if (diffDays < 7) {
        return `${diffDays} days ago`;
    }

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
 * Abbreviate numbers.
 */
export function abbreviateNumber(number: number) {
    const num = Number(number);

    if (num < 1000) {
        return formatNumber(num);
    }

    if (num < 1000000) {
        const roundTo = num < 100000 ? 100 : 1000;
        const rounded = Math.round(num / roundTo) * roundTo;
        const abbreviated = rounded / 1000;

        if (abbreviated === 1000) {
            return '1M';
        }

        const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
        return `${formatted}k`;
    }

    const roundTo = 100000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000000;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}M`;
}

/**
 * Format time duration.
 */
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

/**
 * Format a fraction to percentage.
 */
export const formatPercentage = (value: number) => {
    const percentage = value * 100;
    if (percentage === 0) {
        return '0%';
    }
    if (percentage < 0.1) {
        return `${percentage.toFixed(2)}%`;
    }
    if (percentage < 1) {
        return `${percentage.toFixed(1)}%`;
    }
    const rounded = Math.round(percentage);
    return `${new Intl.NumberFormat('en-US').format(rounded)}%`;
};

/**
 * Convert cents to dollars.
 */
export const centsToDollars = (value: number) => {
    return Math.round(value / 100);
};

/* Chart formatters
/* -------------------------------------------------------------------------- */

/**
 * Helper to round a number to the nearest multiple of its magnitude.
 */
function roundToNearestMultiple(num: number): number {
    if (num === 0) {
        return 0;
    }
    const magnitude = Math.floor(Math.log10(num));
    const multiple = Math.pow(10, magnitude);
    return Math.round(num / multiple) * multiple;
}

/**
 * Calculates the Y-axis range with large padding.
 */
export const getYRangeWithLargePadding = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) {
        return {min: 0, max: 1};
    }

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    const magnitude = Math.floor(Math.log10(Math.max(max, 1)));
    const padding = Math.pow(10, magnitude);

    min = Math.max(0, min - padding);
    max = max + padding;

    min = roundToNearestMultiple(min);
    max = roundToNearestMultiple(max);

    return {min, max};
};

/**
 * Calculates the Y-axis range with standard padding.
 */
export const getYRange = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) {
        return {min: 0, max: 1};
    }

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

    min = Math.max(0, min);
    return {min, max};
};

/**
 * Adds minimal padding when the Y‑axis starts at zero.
 */
export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) {
        return [range.min, range.max];
    }
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - range.max * padding, minPadding), range.max];
};

/**
 * Calculates the width needed for the Y‑axis based on tick labels.
 */
export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string): number => {
    if (!ticks.length) {
        return 40;
    }
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
 * Return start and end dates for a chart range.
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
    if (!countryCode || countryCode.toUpperCase() === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ') {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
}

/**
 * Predicate: range is weekly (91‑356 days).
 */
function isWeeklyRange(range: number): boolean {
    return range >= 91 && range <= 356;
}

/**
 * Predicate: range is monthly (> 356 days).
 */
function isMonthlyRange(range: number): boolean {
    return range > 356;
}

/**
 * Process data into weekly aggregates.
 */
function aggregateWeekly<T extends {date: string}>(
    data: T[],
    field: keyof T,
    agg: 'sum' | 'avg' | 'exact'
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
                [field]: agg === 'sum' ? total : agg === 'avg' ? (count ? total / count : 0) : last
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
                [field]: agg === 'sum' ? total : agg === 'avg' ? (count ? total / count : 0) : last
            } as T);
        }
    });

    return result;
}

/**
 * Process data into monthly aggregates.
 */
function aggregateMonthly<T extends {date: string}>(
    data: T[],
    field: keyof T,
    agg: 'sum' | 'avg' | 'exact'
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
                [field]: agg === 'sum' ? total : agg === 'avg' ? (count ? total / count : 0) : last
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
                [field]: agg === 'sum' ? total : agg === 'avg' ? (count ? total / count : 0) : last
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
    if (!data.length) {
        return [];
    }

    if (isWeeklyRange(range)) {
        return aggregateWeekly(data, fieldName, aggregationType);
    }

    if (isMonthlyRange(range)) {
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

/**
 * Member formatters
 */

/**
 * Format member name with fallback.
 */
export const formatMemberName = (member: {name?: string; email?: string}) => {
    return (member.name && member.name.trim()) || member.email || 'Unknown Member';
};

/**
 * Get member initials.
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
 * Convert a string to an HSL colour.
 */
export const stringToHslColor = (str: string, saturation: string, lightness: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, ${saturation}%, ${lightness}%)`;
};