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

/** @internal Check if URL is an email address */
const isEmailUrl = (url: string): boolean => isEmail(url);

/** @internal Check if URL is an anchor link */
const isAnchorLink = (url: string): boolean => /^#/.test(url);

/** @internal Check if URL is protocol-relative */
const isProtocolRelative = (url: string): boolean => /^(\/\/)/.test(url);

/** @internal Check if URL looks like a valid URL pattern */
const looksLikeUrl = (url: string): boolean => /^[a-zA-Z0-9-]+:/.test(url) || /^(\/|\?)/.test(url);

/** @internal Check if URL needs protocol prefix */
const needsProtocol = (url: string, baseUrl?: string): boolean => !baseUrl && !url.startsWith('http');

/** @internal Check if parsed URL is relative to base path */
const isRelativeToBasePath = (parsedUrl: URL, parsedBaseUrl: URL): boolean => {
    if (!parsedUrl.pathname) return false;
    return parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0 || 
           `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
};

/** @internal Check if URLs are on same host */
const isOnSameHost = (parsedUrl: URL, parsedBaseUrl: URL): boolean => parsedUrl.host === parsedBaseUrl.host;

/** @internal Check if URL needs trailing slash */
const needsTrailingSlash = (url: string): boolean => !url.match(/\/$/) && !url.match(/[.#?]/);

/** @internal Process relative URL for same-host URLs */
const processRelativeUrl = (url: string, parsedBaseUrl: URL): string => {
    let processed = url.replace(/^[a-zA-Z0-9-]+:/, '');
    processed = processed.replace(/^\/\//, '');
    processed = processed.replace(parsedBaseUrl.host, '');
    processed = processed.replace(parsedBaseUrl.pathname, '');
    
    if (!processed.match(/^\//)) {
        processed = `/${processed}`;
    }
    return processed;
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
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }

    if (isAnchorLink(url)) {
        return {save: url, display: url};
    }

    if (isProtocolRelative(url)) {
        return {save: url, display: url};
    }

    if (needsProtocol(url, baseUrl)) {
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
    const onSameHost = isOnSameHost(parsedUrl, parsedBaseUrl);
    const relativeToBase = isRelativeToBasePath(parsedUrl, parsedBaseUrl);

    if (onSameHost && relativeToBase) {
        url = processRelativeUrl(url, parsedBaseUrl);
    }

    if (needsTrailingSlash(url)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Helper to display a URL from a base URL
const displayFromBase = (url: string, baseUrl: string) => {
    // Ensure base url has a trailing slash
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }

    // Remove leading slash from url
    if (url.startsWith('/')) {
        url = url.substring(1);
    }

    return new URL(url, baseUrl).toString();
};

// Format date for stats query
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

/** @internal Extract date components from timezone-aware moment */
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

/** @internal Extract date components from Date object */
const extractDateComponentsFromDate = (dateString: string, hasTime: boolean, isISOFormat: boolean) => {
    const date = new Date(dateString);
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

/** @internal Format date string with month name */
const formatDateWithMonth = (day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month];

    if (isToday) {
        return `${day} ${monthName}`;
    }

    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

/** @internal Validate date string input */
const isValidDateString = (dateString: string): boolean => {
    return dateString && dateString.length > 0 && typeof dateString === 'string';
};

// Format date for UI, result is in the format of `12 Jun 2025`
// When timezone is provided, the date will be converted to that timezone before formatting
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    // @ts-expect-error This should error if dateString is not a string, but for some reason Typescript isn't catching this
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }

    if (!isValidDateString(dateString)) {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');

    const components = timezone && isISOFormat
        ? extractDateComponentsWithTimezone(dateString, timezone)
        : extractDateComponentsFromDate(dateString, hasTime, isISOFormat);

    return formatDateWithMonth(components.day, components.month, components.year, components.isToday, components.isCurrentYear);
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

/** @internal Check if date is invalid */
const isInvalidDate = (date: Date): boolean => isNaN(date.getTime());

/** @internal Check if time difference is negative (future date) */
const isFutureDate = (diffMs: number): boolean => diffMs < 0;

/** @internal Get time difference in minutes */
const getTimeDiffMinutes = (diffMs: number): number => Math.floor(diffMs / (1000 * 60));

/** @internal Get time difference in hours */
const getTimeDiffHours = (diffMs: number): number => Math.floor(diffMs / (1000 * 60 * 60));

/** @internal Get time difference in days */
const getTimeDiffDays = (diffMs: number): number => Math.floor(diffMs / (1000 * 60 * 60 * 24));

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

    if (isInvalidDate(date)) {
        return 'Unknown';
    }

    const diffMs = now.getTime() - date.getTime();

    if (isFutureDate(diffMs)) {
        return 'Just now';
    }

    const diffMins = getTimeDiffMinutes(diffMs);
    const diffHours = getTimeDiffHours(diffMs);
    const diffDays = getTimeDiffDays(diffMs);

    return formatTimestampByDiff(diffMins, diffHours, diffDays, date);
};

// Add thousands indicator to numbers
export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

/** @internal Calculate abbreviation for thousands */
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

/** @internal Calculate abbreviation for millions */
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
const roundToNearestMultiple = (num: number): number => {
    if (num === 0) {
        return 0;
    }

    const magnitude = Math.floor(Math.log10(num));
    const multiple =