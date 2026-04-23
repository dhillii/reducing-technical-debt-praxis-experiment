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
 * Normalizes a raw URL string based on optional base URL and nullability.
 * Returns an object with a value suitable for saving and a display version.
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
        return {save: `mailto:${trimmed}`, display: `mailto:${trimmed}`};
    }

    if (isAnchorLink(trimmed) || isProtocolRelative(trimmed)) {
        return {save: trimmed, display: trimmed};
    }

    const absolute = ensureAbsoluteUrl(trimmed, baseUrl);
    const parsed = safeParseUrl(absolute, baseUrl);
    if (!parsed) {
        return {save: absolute, display: absolute};
    }

    if (!baseUrl) {
        return {save: parsed.toString(), display: parsed.toString()};
    }

    const relative = makeRelativeIfPossible(parsed, baseUrl);
    const finalSave = ensureTrailingSlash(relative);
    return {save: finalSave, display: displayFromBase(finalSave, baseUrl)};
};

const isAnchorLink = (url: string) => /^#/.test(url);
const isProtocolRelative = (url: string) => /^(\/\/)/.test(url);

const ensureAbsoluteUrl = (url: string, baseUrl?: string) => {
    if (!baseUrl && !url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
};

const safeParseUrl = (url: string, baseUrl?: string) => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};

const makeRelativeIfPossible = (parsedUrl: URL, baseUrl: string) => {
    const base = new URL(baseUrl);
    const sameHost = parsedUrl.host === base.host;
    const pathStartsWithBase = parsedUrl.pathname?.startsWith(base.pathname ?? '');

    // Adjust for trailing slash edge case
    const adjusted = `${parsedUrl.pathname}/` === base.pathname ? true : false;
    const isRelative = sameHost && (pathStartsWithBase || adjusted);

    if (!isRelative) {
        return parsedUrl.toString();
    }

    let relative = parsedUrl.toString()
        .replace(/^[a-zA-Z0-9-]+:/, '')
        .replace(/^\/\//, '')
        .replace(base.host, '')
        .replace(base.pathname, '');

    if (!relative.startsWith('/')) {
        relative = `/${relative}`;
    }

    return relative;
};

const ensureTrailingSlash = (url: string) => {
    if (!url.endsWith('/') && !/[.#?]/.test(url)) {
        return `${url}/`;
    }
    return url;
};

/**
 * Generates a display URL from a relative URL and a base URL.
 */
const displayFromBase = (url: string, baseUrl: string) => {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const clean = url.startsWith('/') ? url.substring(1) : url;
    return new URL(clean, base).toString();
};

// Format date for stats query
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

/**
 * Formats a date string for UI display.
 * Handles ISO strings, local strings, and optional timezone conversion.
 */
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }
    if (!dateString || typeof dateString !== 'string') {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISO = dateString.includes('T') || dateString.includes('Z');

    const {day, month, year, isToday, isCurrentYear} = timezone && isISO
        ? computeFromTimezone(dateString, timezone)
        : computeFromLocal(dateString, hasTime, isISO);

    const monthName = monthNames[month];
    return isToday ? `${day} ${monthName}` : isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const computeFromTimezone = (dateString: string, timezone: string) => {
    const dateMoment = moment.tz(dateString, timezone);
    const todayMoment = moment.tz(timezone);
    return {
        day: dateMoment.date(),
        month: dateMoment.month(),
        year: dateMoment.year(),
        isToday: dateMoment.isSame(todayMoment, 'day'),
        isCurrentYear: dateMoment.year() === todayMoment.year()
    };
};

const computeFromLocal = (dateString: string, hasTime: boolean, isISO: boolean) => {
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
    if (num < 1000) return formatNumber(num);
    if (num < 1_000_000) return abbreviateThousands(num);
    return abbreviateMillions(num);
}

const abbreviateThousands = (num: number) => {
    const roundTo = num < 100_000 ? 100 : 1000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000;
    if (abbreviated === 1000) return '1M';
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

// Format time duration
export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
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

// Calculates the Y-axis range with padding
export const getYRangeWithLargePadding = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) return {min: 0, max: 1};

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    const magnitude = Math.floor(Math.log10(Math.max(max, 1)));
    const padding = Math.pow(10, magnitude);
    min = Math.max(0, min - padding);
    max = max + padding;

    const roundToNearestMultiple = (num: number): number => {
        if (num === 0) return 0;
        const mag = Math.floor(Math.log10(num));
        const mult = Math.pow(10, mag);
        return Math.round(num / mult) * mult;
    };

    return {
        min: roundToNearestMultiple(min),
        max: roundToNearestMultiple(max)
    };
};

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
    const roundTo = Math.pow(10, Math.floor(Math.log10(range)));

    const roundedMax = Math.round(max / roundTo) * roundTo;
    max = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    const roundedMin = Math.round(min / roundTo) * roundTo;
    min = roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin;
    min = Math.max(0, min);

    if (min === max) {
        const mid = (min + max) / 2;
        const small = Math.max(Math.abs(mid) * paddingFactor, roundTo);
        min = Math.max(0, Math.floor(mid - small));
        max = Math.ceil(mid + small);
    }

    return {min, max};
};

// Padding for min value in Recharts
export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) return [range.min, range.max];
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - range.max * padding, minPadding), range.max];
};

// Calculates the width needed for the Y-axis based on the formatted tick values
export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string): number => {
    if (!ticks.length) return 40;
    const maxLen = Math.max(...ticks.map(t => formatter(t).length));
    return Math.max(20, maxLen * 8 + 20);
};

// Get range for date
export const getRangeForStartDate = (startDate: string) => {
    const published = new Date(startDate);
    const today = new Date();
    const diffDays = Math.ceil((today.getTime() - published.getTime()) / (1000 * 3600 * 24));
    return Math.max(diffDays, 1);
};

// Return today and startdate for charts
export const getRangeDates = (range: number) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const endDate = moment().tz(timezone).endOf('day');
    const startDate = range === -1
        ? moment().tz(timezone).startOf('year')
        : moment().tz(timezone).subtract(range - 1, 'days').startOf('day');
    return {startDate, endDate, timezone};
};

// Converts a country code to corresponding flag emoji
export function getCountryFlag(countryCode: string) {
    if (!countryCode || ['NULL', 'ᴺᵁᴸᴸ', 'ᴺᵁ'].includes(countryCode.toUpperCase())) {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

/**
 * Sanitizes chart data based on the date range.
 * Delegates to weekly or monthly aggregation when appropriate.
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
 * Aggregates data into weekly buckets.
 */
const aggregateWeekly = <T extends {date: string}>(
    data: T[],
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T[] => {
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
            weekly.push(createAggregatedItem(data[idx - 1], currentWeek, fieldName, aggregationType, weekTotal, weekCount, lastValue));
            currentWeek = itemDate.startOf('week');
            weekTotal = Number(item[fieldName]);
            weekCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (idx === data.length - 1) {
            weekly.push(createAggregatedItem(item, currentWeek, fieldName, aggregationType, weekTotal, weekCount, lastValue));
        }
    });

    return weekly;
};

/**
 * Aggregates data into monthly buckets.
 */
const aggregateMonthly = <T extends {date: string}>(
    data: T[],
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T[] => {
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
            monthly.push(createAggregatedItem(data[idx - 1], currentMonth, fieldName, aggregationType, monthTotal, monthCount, lastValue));
            currentMonth = itemDate.startOf('month');
            monthTotal = Number(item[fieldName]);
            monthCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (idx === data.length - 1) {
            monthly.push(createAggregatedItem(item, currentMonth, fieldName, aggregationType, monthTotal, monthCount, lastValue));
        }
    });

    return monthly;
};

/**
 * Creates an aggregated data point based on the chosen aggregation type.
 */
const createAggregatedItem = <T extends {date: string}>(
    source: T,
    periodStart: moment.Moment,
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact',
    total: number,
    count: number,
    last: number
): T => {
    const value = aggregationType === 'sum'
        ? total
        : aggregationType === 'avg'
            ? count > 0 ? total / count : 0
            : last;

    return {
        ...source,
        date: periodStart.format('YYYY-MM-DD'),
        [fieldName]: value
    } as T;
};

/**
 * Formats a date based on the range.
 * - >365 days: month and year
 * - >=91 days: "Week of ..."
 * - =1 day with optional hour flags
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

export const formatMemberName = (member: {name?: string; email?: string}) => {
    return (member.name && member.name.trim()) || member.email || 'Unknown Member';
};

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