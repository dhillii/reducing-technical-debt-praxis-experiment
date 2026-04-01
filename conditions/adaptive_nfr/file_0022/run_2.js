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

/** @internal Check if value is a nullable empty URL */
const isNullableEmpty = (value: string, nullable: boolean): boolean => nullable && !value;

/** @internal Check if value is an email address */
const isEmailAddress = (url: string): boolean => isEmail(url);

/** @internal Check if value is an anchor link */
const isAnchorLink = (url: string): boolean => /^#/.test(url);

/** @internal Check if value is protocol-relative URL */
const isProtocolRelative = (url: string): boolean => /^(\/\/)/.test(url);

/** @internal Check if value looks like a URL pattern */
const looksLikeUrl = (url: string): boolean => /^[a-zA-Z0-9-]+:/.test(url) || /^(\/|\?)/.test(url);

/** @internal Check if URL is relative to base path */
const isRelativeToBasePath = (parsedUrl: URL, parsedBaseUrl: URL): boolean => {
    if (!parsedUrl.pathname) return false;
    if (parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0) return true;
    return `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
};

/** @internal Check if URL is on same host as base */
const isOnSameHost = (parsedUrl: URL, parsedBaseUrl: URL): boolean => parsedUrl.host === parsedBaseUrl.host;

/** @internal Get aggregated value based on aggregation type */
const getAggregatedValue = (total: number, count: number, lastValue: number, aggregationType: 'sum' | 'avg' | 'exact'): number => {
    if (aggregationType === 'sum') return total;
    if (aggregationType === 'avg') return count > 0 ? total / count : 0;
    return lastValue;
};

// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (isNullableEmpty(value, nullable ?? false)) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (!url) {
        if (baseUrl) {
            return {save: '/', display: baseUrl};
        }
        return {save: '', display: ''};
    }

    if (isEmailAddress(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }

    if (isAnchorLink(url)) {
        return {save: url, display: url};
    }

    if (isProtocolRelative(url)) {
        return {save: url, display: url};
    }

    if (!baseUrl && !url.startsWith('http')) {
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
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    const parsedBaseUrl = new URL(baseUrl);
    const relativeToBase = isRelativeToBasePath(parsedUrl, parsedBaseUrl);
    const sameHost = isOnSameHost(parsedUrl, parsedBaseUrl);

    if (!sameHost || !relativeToBase) {
        if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
            url = `${url}/`;
        }
        return {save: url, display: displayFromBase(url, baseUrl)};
    }

    url = url.replace(/^[a-zA-Z0-9-]+:/, '');
    url = url.replace(/^\/\//, '');
    url = url.replace(parsedBaseUrl.host, '');
    url = url.replace(parsedBaseUrl.pathname, '');

    if (!url.match(/^\//)) {
        url = `/${url}`;
    }

    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Helper to display a URL from a base URL
const displayFromBase = (url: string, baseUrl: string) => {
    let finalBaseUrl = baseUrl;
    if (!finalBaseUrl.endsWith('/')) {
        finalBaseUrl += '/';
    }

    let finalUrl = url;
    if (finalUrl.startsWith('/')) {
        finalUrl = finalUrl.substring(1);
    }

    return new URL(finalUrl, finalBaseUrl).toString();
};

// Format date for stats query
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

/** @internal Check if date string has time component */
const hasTimeComponent = (dateString: string): boolean => dateString.includes(':');

/** @internal Check if date string is in ISO format */
const isISOFormatDate = (dateString: string): boolean => dateString.includes('T') || dateString.includes('Z');

/** @internal Extract date components using timezone-aware moment */
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

/** @internal Extract date components from localized datetime string */
const extractDateComponentsLocalized = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    return {
        day: date.getDate(),
        month: date.getMonth(),
        year: date.getFullYear(),
        isToday: date.toDateString() === today.toDateString(),
        isCurrentYear: date.getFullYear() === today.getFullYear()
    };
};

/** @internal Extract date components from UTC date string */
const extractDateComponentsUTC = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    return {
        day: date.getUTCDate(),
        month: date.getUTCMonth(),
        year: date.getUTCFullYear(),
        isToday: date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10),
        isCurrentYear: date.getUTCFullYear() === today.getUTCFullYear()
    };
};

/** @internal Format date components into display string */
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
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }

    if (!dateString || dateString.length === 0 || typeof dateString !== 'string') {
        return '';
    }

    const hasTime = hasTimeComponent(dateString);
    const isISO = isISOFormatDate(dateString);

    let components;

    if (timezone && isISO) {
        components = extractDateComponentsWithTimezone(dateString, timezone);
    } else if (hasTime && !isISO) {
        components = extractDateComponentsLocalized(dateString);
    } else {
        components = extractDateComponentsUTC(dateString);
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

/** @internal Calculate time difference in minutes */
const getMinutesDiff = (diffMs: number): number => Math.floor(diffMs / (1000 * 60));

/** @internal Calculate time difference in hours */
const getHoursDiff = (diffMs: number): number => Math.floor(diffMs / (1000 * 60 * 60));

/** @internal Calculate time difference in days */
const getDaysDiff = (diffMs: number): number => Math.floor(diffMs / (1000 * 60 * 60 * 24));

/** @internal Format timestamp based on time difference */
const formatTimestampByDiff = (diffMins: number, diffHours: number, diffDays: number, date: Date): string => {
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

    const diffMins = getMinutesDiff(diffMs);
    const diffHours = getHoursDiff(diffMs);
    const diffDays = getDaysDiff(diffMs);

    return formatTimestampByDiff(diffMins, diffHours, diffDays, date);
};

// Add thousands indicator to numbers
export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

/** @internal Calculate abbreviated number for thousands */
const abbreviateThousands = (num: number): string => {
    const roundTo = num < 100000 ? 100 : 1000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000;

    if (abbreviated === 1000) {
        return '1M';
    }

    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}k`;
};

/** @internal Calculate abbreviated number for millions */
const abbreviateMillions = (num: number): string => {
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
        return abbreviateThousands(num);
    }

    return abbreviateMillions(num);
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

/** @internal Round number to nearest multiple of 10^n */
const round