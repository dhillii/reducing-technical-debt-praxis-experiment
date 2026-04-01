```typescript
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
    const processed = str
        .replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

// Check if URL is an email address
const isEmailUrl = (url: string): boolean => isEmail(url);

// Check if URL is an anchor link
const isAnchorLink = (url: string): boolean => /^#/.test(url);

// Check if URL is protocol-relative
const isProtocolRelative = (url: string): boolean => /^(\/\/)/.test(url);

// Check if URL looks like a valid URL pattern
const looksLikeUrl = (url: string): boolean => /^[a-zA-Z0-9-]+:/.test(url) || /^(\/|\?)/.test(url);

// Format email URL with mailto protocol
const formatEmailUrl = (url: string): {save: string; display: string} => {
    const mailtoUrl = `mailto:${url}`;
    return {save: mailtoUrl, display: mailtoUrl};
};

// Format anchor or protocol-relative URL as-is
const formatSpecialUrl = (url: string): {save: string; display: string} => ({save: url, display: url});

// Add https protocol if missing
const ensureProtocol = (url: string): string => {
    if (!url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
};

// Parse and validate URL
const parseUrl = (url: string, baseUrl?: string): URL | null => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};

// Check if parsed URL is relative to base URL
const isRelativeToBase = (parsedUrl: URL, parsedBaseUrl: URL): boolean => {
    if (!parsedUrl.pathname) {
        return false;
    }
    const isPathRelative = parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0;
    const isPathWithTrailingSlash = `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
    return isPathRelative || isPathWithTrailingSlash;
};

// Convert absolute URL to relative URL
const makeUrlRelative = (url: string, parsedBaseUrl: URL): string => {
    let result = url;
    result = result.replace(/^[a-zA-Z0-9-]+:/, '');
    result = result.replace(/^\/\//, '');
    result = result.replace(parsedBaseUrl.host, '');
    result = result.replace(parsedBaseUrl.pathname, '');

    if (!result.match(/^\//)) {
        result = `/${result}`;
    }
    return result;
};

// Add trailing slash if needed
const ensureTrailingSlash = (url: string): string => {
    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        return `${url}/`;
    }
    return url;
};

// Helper to display a URL from a base URL
const displayFromBase = (url: string, baseUrl: string) => {
    let base = baseUrl;
    if (!base.endsWith('/')) {
        base += '/';
    }

    let displayUrl = url;
    if (displayUrl.startsWith('/')) {
        displayUrl = displayUrl.substring(1);
    }

    return new URL(displayUrl, base).toString();
};

// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (!url) {
        if (baseUrl) {
            return {save: '/', display: baseUrl};
        }
        return {save: '', display: ''};
    }

    if (isEmailUrl(url)) {
        return formatEmailUrl(url);
    }

    if (isAnchorLink(url) || isProtocolRelative(url)) {
        return formatSpecialUrl(url);
    }

    if (!baseUrl && !url.startsWith('http')) {
        url = ensureProtocol(url);
    }

    if (!looksLikeUrl(url)) {
        return {save: url, display: url};
    }

    const parsedUrl = parseUrl(url, baseUrl);
    if (!parsedUrl) {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    const parsedBaseUrl = new URL(baseUrl);
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;
    const isRelative = isRelativeToBase(parsedUrl, parsedBaseUrl);

    if (isOnSameHost && isRelative) {
        url = makeUrlRelative(url, parsedBaseUrl);
    }

    url = ensureTrailingSlash(url);

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Format date for stats query
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

// Extract date components from ISO format string with timezone
const extractDateComponentsWithTimezone = (dateString: string, timezone: string) => {
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

// Extract date components from Date object
const extractDateComponentsFromDate = (date: Date, hasTime: boolean, isISOFormat: boolean) => {
    const today = new Date();

    if (hasTime && !isISOFormat) {
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

// Format date components to display string
const formatDateComponents = (day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month];

    if (isToday) {
        return `${day} ${monthName}`;
    }

    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

// Format date for UI, result is in the format of `12 Jun 2025`
// When timezone is provided, the date will be converted to that timezone before formatting
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    // @ts-expect-error This should error if dateString is not a string, but for some reason Typescript isn't catching this
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }

    if (!dateString || dateString.length === 0 || typeof dateString !== 'string') {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');

    let components;

    if (timezone && isISOFormat) {
        components = extractDateComponentsWithTimezone(dateString, timezone);
    } else {
        const date = new Date(dateString);
        components = extractDateComponentsFromDate(date, hasTime, isISOFormat);
    }

    return formatDateComponents(components.day, components.month, components.year, components.isToday, components.isCurrentYear);
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

// Calculate time difference in milliseconds
const calculateTimeDifference = (date: Date, now: Date): number => {
    return now.getTime() - date.getTime();
};

// Format timestamp based on time difference
const formatTimestampByDifference = (diffMs: number, date: Date): string => {
    if (diffMs < 0) {
        return 'Just now';
    }

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) {
        return 'Just now';
    } else if (diffMins < 60) {
        return `${diffMins} min ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hr ago`;
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    }

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: diffDays > 365 ? 'numeric' : undefined
    });
};

// Helper function to format timestamp
export const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (isNaN(date.getTime())) {
        return 'Unknown';
    }

    const diffMs = calculateTimeDifference(date, now);
    return formatTimestampByDifference(diffMs, date);
};

// Add thousands indicator to numbers
export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

// Format thousands abbreviation
const formatThousandsAbbreviation = (num: number): string => {
    const roundTo = num < 100000 ? 100 : 1000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000;

    if (abbreviated === 1000) {
        return '1M';
    }

    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}k`;
};

// Format millions abbreviation
const formatMillionsAbbreviation = (num: number): string => {
    const roundTo = 100000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000000;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}M`;
};

// Abbreviate numbers
export function abbreviateNumber(number: number) {
    const num = Number(number);

    if (num < 1000) {
        return formatNumber(num);
    }

    if (num < 1000000) {
        return formatThousandsAbbreviation(num);
    }

    return formatMillionsAbbreviation(num);
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
    } else if (percentage < 0.1) {
        return `${percentage.toFixed(2)}%`;
    } else if (percentage < 1) {
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

// Round number to nearest multiple of 10^n
const roundToNearestMultiple = (num: number): number => {
    if (num === 0) {
        return 0;
    }

    const magnitude = Math.floor(Math.log10(num));
    const multiple = Math.pow(10, magnitude);

    return Math.round(num / multiple) * multiple;
};

// Calculates the Y-axis range with padding
export const getYRangeWithLargePadding = (data: { value: number }[]): {min: number; max: number} => {
    if (!data.length) {
        return {min: 0, max: 1};