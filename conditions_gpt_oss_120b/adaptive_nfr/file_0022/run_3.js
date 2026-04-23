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
 * Determines if the function should return a nullable result.
 */
function shouldReturnNullable(nullable: boolean, value: string): boolean {
    return nullable && !value;
}

/**
 * Determines if the trimmed URL is empty.
 */
function isEmptyUrl(url: string): boolean {
    return url.length === 0;
}

/**
 * Determines if the URL is an email address.
 */
function isEmailUrl(url: string): boolean {
    return isEmail(url);
}

/**
 * Determines if the URL is an anchor link.
 */
function isAnchorLink(url: string): boolean {
    return /^#/.test(url);
}

/**
 * Determines if the URL is protocol‑relative (starts with //).
 */
function isProtocolRelative(url: string): boolean {
    return /^(\/\/)/.test(url);
}

/**
 * Determines if the URL lacks an explicit protocol.
 */
function lacksProtocol(url: string): boolean {
    return !url.startsWith('http');
}

/**
 * Determines if the string looks like a URL (has scheme or starts with / or ?).
 */
function looksLikeUrl(url: string): boolean {
    return /^[a-zA-Z0-9-]+:/.test(url) || /^(\/|\?)/.test(url);
}

/**
 * Determines if two URLs share the same host.
 */
function isSameHost(parsedUrl: URL, baseUrl: URL): boolean {
    return parsedUrl.host === baseUrl.host;
}

/**
 * Determines if the pathname of parsedUrl is within the base pathname.
 */
function isPathRelativeToBase(parsedUrl: URL, baseUrl: URL): boolean {
    const basePath = baseUrl.pathname;
    const path = parsedUrl.pathname;
    if (path && path.indexOf(basePath) === 0) {
        return true;
    }
    // Trailing slash edge case
    if (`${path}/` === basePath) {
        return true;
    }
    return false;
}

/**
 * Ensures the URL ends with a trailing slash when appropriate.
 */
function ensureTrailingSlash(url: string): string {
    if (!url.endsWith('/') && !/[.#?]/.test(url)) {
        return `${url}/`;
    }
    return url;
}

/**
 * Formats a URL according to the provided base URL and nullable flag.
 */
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (shouldReturnNullable(nullable ?? false, value)) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (isEmptyUrl(url)) {
        if (baseUrl) {
            return {save: '/', display: baseUrl};
        }
        return {save: '', display: ''};
    }

    if (isEmailUrl(url)) {
        const mailto = `mailto:${url}`;
        return {save: mailto, display: mailto};
    }

    if (isAnchorLink(url) || isProtocolRelative(url)) {
        return {save: url, display: url};
    }

    if (!baseUrl && lacksProtocol(url)) {
        url = `https://${url}`;
    }

    if (!looksLikeUrl(url)) {
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

    const parsedBaseUrl = new URL(baseUrl);
    const sameHost = isSameHost(parsedUrl, parsedBaseUrl);
    const relativePath = isPathRelativeToBase(parsedUrl, parsedBaseUrl);

    if (sameHost && relativePath) {
        url = url.replace(/^[a-zA-Z0-9-]+:/, '');
        url = url.replace(/^\/\//, '');
        url = url.replace(parsedBaseUrl.host, '');
        url = url.replace(parsedBaseUrl.pathname, '');
        if (!url.startsWith('/')) {
            url = `/${url}`;
        }
    }

    url = ensureTrailingSlash(url);
    return {save: url, display: displayFromBase(url, baseUrl)};
};

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

// Format date for stats query
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

/**
 * Determines if the provided value is an invalid date string.
 */
function isInvalidDateString(value: any): boolean {
    return !value || typeof value !== 'string' || value.length === 0;
}

/**
 * Parses a date string using moment‑timezone when appropriate.
 */
function parseWithTimezone(dateString: string, timezone: string) {
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

/**
 * Parses a localized datetime string (has time but not ISO format).
 */
function parseLocal(dateString: string) {
    const date = new Date(dateString);
    const today = new Date();
    return {
        day: date.getDate(),
        month: date.getMonth(),
        year: date.getFullYear(),
        isToday: date.toDateString() === today.toDateString(),
        isCurrentYear: date.getFullYear() === today.getFullYear()
    };
}

/**
 * Parses a date string using UTC methods.
 */
function parseUTC(dateString: string) {
    const date = new Date(dateString);
    const today = new Date();
    return {
        day: date.getUTCDate(),
        month: date.getUTCMonth(),
        year: date.getUTCFullYear(),
        isToday: date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10),
        isCurrentYear: date.getUTCFullYear() === today.getUTCFullYear()
    };
}

/**
 * Formats a date for UI display.
 * When a timezone is provided, the date is converted before formatting.
 */
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    // Convert Date objects to ISO strings
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }

    if (isInvalidDateString(dateString)) {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISO = dateString.includes('T') || dateString.includes('Z');

    let parsed;
    if (timezone && isISO) {
        parsed = parseWithTimezone(dateString, timezone);
    } else if (hasTime && !isISO) {
        parsed = parseLocal(dateString);
    } else {
        parsed = parseUTC(dateString);
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parsed.month];

    if (parsed.isToday) {
        return `${parsed.day} ${monthName}`;
    }

    return parsed.isCurrentYear
        ? `${parsed.day} ${monthName}`
        : `${parsed.day} ${monthName} ${parsed.year}`;
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

// Format cents to Dollars
export const centsToDollars = (value: number) => {
    return Math.round(value / 100);
};

/* Chart formatters
/* -------------------------------------------------------------------------- */

// Calculates the Y-axis range with padding
export const getYRangeWithLargePadding = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) {
        return {min: 0, max: 1};
    }

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    const roundToNearestMultiple = (num: number): number => {
        if (num === 0) {
            return 0;
        }
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

export const getYRange = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) {
        return {min: 0, max: 1};
    }

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
        const value = min;
        return {min: Math.max(0, value - 1), max: value + 1};
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

// Padding for Y‑axis minimum value
export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) {
        return [range.min, range.max];
    }
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - range.max * padding, minPadding), range.max];
};

// Calculates the width needed for the Y-axis based on the formatted tick values
export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string): number => {
    if (!ticks.length) {
        return 40;
    }
    const maxLength = Math.max(...ticks.map(tick => formatter(tick).length));
    return Math.max(20, maxLength * 8 + 20);
};

// Get range for date
export const getRangeForStartDate = (startDate: string) => {
    const published = new Date(startDate);
    const today = new Date();
    const diffMs = today.getTime() - published.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 3600 * 24));
    return Math.max(diffDays, 1);
};

// Return today and startdate for charts
export const getRangeDates = (range: number) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const endDate = moment().tz(timezone).endOf('day');
    let startDate;

    if (range === -1) {
        startDate = moment().tz(timezone).startOf('year');
    } else {
        startDate = moment().tz(timezone).subtract(range - 1, 'days').startOf('day');
    }

    return {startDate, endDate, timezone};
};

/**
 * Converts a country code to corresponding flag emoji.
 */
export function getCountryFlag(countryCode: string) {
    if (!countryCode || countryCode.toUpperCase() === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ') {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

/**
 * Sanitizes chart data based on the date range.
 * - For ranges between 91‑356 days: aggregates weekly.
 * - For ranges above 356 days: aggregates monthly.
 * - Otherwise returns original data.
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

    if (range >= 91 && range <= 356) {
        return aggregateWeekly(data, fieldName, aggregationType);
    }

    if (range > 356) {
        return aggregateMonthly(data, fieldName, aggregationType);
    }

    return data;
};

/**
 * Aggregates data on a weekly basis.
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

    data.forEach((item, index) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentWeek, 'week')) {
            weekTotal += Number(item[fieldName]);
            weekCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            weekly.push({
                ...data[index - 1],
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: computeAggregation(weekTotal, weekCount, lastValue, aggregationType)
            } as T);
            currentWeek = itemDate.startOf('week');
            weekTotal = Number(item[fieldName]);
            weekCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (index === data.length - 1) {
            weekly.push({
                ...item,
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: computeAggregation(weekTotal, weekCount, lastValue, aggregationType)
            } as T);
        }
    });

    return weekly;
}

/**
 * Aggregates data on a monthly basis.
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

    data.forEach((item, index) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentMonth, 'month')) {
            monthTotal += Number(item[fieldName]);
            monthCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            monthly.push({
                ...data[index - 1],
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]: computeAggregation(monthTotal, monthCount, lastValue, aggregationType)
            } as T);
            currentMonth = itemDate.startOf('month');
            monthTotal = Number(item[fieldName]);
            monthCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (index === data.length - 1) {
            monthly.push({
                ...item,
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]: computeAggregation(monthTotal, monthCount, lastValue, aggregationType)
            } as T);
        }
    });

    return monthly;
}

/**
 * Computes the aggregated value based on the selected aggregation type.
 */
function computeAggregation(
    total: number,
    count: number,
    last: number,
    type: 'sum' | 'avg' | 'exact'
): number {
    if (type === 'sum') {
        return total;
    }
    if (type === 'avg') {
        return count > 0 ? total / count : 0;
    }
    return last;
}

/**
 * Formats a date based on the range.
 * - For ranges above 365 days: shows month and year.
 * - For ranges above 91 days: shows "Week of [date]".
 * - For other ranges: uses the default formatDisplayDate.
 */
export const formatDisplayDateWithRange = (
    date: string,
    range: number,
    showHours: boolean = false,
    hoursOnly: boolean = false
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

// Helper function to format member names with fallback to email
export const formatMemberName = (member: {name?: string; email?: string}) => {
    return (member.name && member.name.trim()) || member.email || 'Unknown Member';
};

// Helper function to get member initials
export const getMemberInitials = (member: {name?: string}) => {
    const name = formatMemberName(member);
    const words = name.split(' ');
    if (words.length >= 2) {
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
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