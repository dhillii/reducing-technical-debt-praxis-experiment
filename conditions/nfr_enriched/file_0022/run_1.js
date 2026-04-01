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

// Check if URL is an email address
const isEmailUrl = (url: string): boolean => isEmail(url);

// Check if URL is an anchor link
const isAnchorLink = (url: string): boolean => /^#/.test(url);

// Check if URL is protocol-relative
const isProtocolRelative = (url: string): boolean => /^(\/\/)/.test(url);

// Check if URL looks like a valid URL pattern
const looksLikeUrl = (url: string): boolean => /^[a-zA-Z0-9-]+:/.test(url) || /^(\/|\?)/.test(url);

// Handle email URL formatting
const formatEmailUrl = (url: string): {save: string; display: string} => ({
    save: `mailto:${url}`,
    display: `mailto:${url}`
});

// Handle anchor link formatting
const formatAnchorLink = (url: string): {save: string; display: string} => ({
    save: url,
    display: url
});

// Handle protocol-relative URL formatting
const formatProtocolRelativeUrl = (url: string): {save: string; display: string} => ({
    save: url,
    display: url
});

// Handle empty URL formatting
const formatEmptyUrl = (baseUrl?: string): {save: string; display: string} => {
    if (baseUrl) {
        return {save: '/', display: baseUrl};
    }
    return {save: '', display: ''};
};

// Handle non-URL string formatting
const formatNonUrl = (url: string): {save: string; display: string} => ({
    save: url,
    display: url
});

// Parse and format URL with base URL context
const parseAndFormatUrl = (url: string, baseUrl?: string): {save: string; display: string} => {
    let parsedUrl: URL;

    try {
        parsedUrl = new URL(url, baseUrl);
    } catch {
        return formatNonUrl(url);
    }

    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    return formatRelativeUrl(url, parsedUrl, baseUrl);
};

// Format URL relative to base URL
const formatRelativeUrl = (url: string, parsedUrl: URL, baseUrl: string): {save: string; display: string} => {
    const parsedBaseUrl = new URL(baseUrl);
    const isRelativeToBasePath = isUrlRelativeToBasePath(parsedUrl, parsedBaseUrl);
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;

    if (!isOnSameHost || !isRelativeToBasePath) {
        return {save: url, display: url};
    }

    let relativeUrl = stripBaseUrlFromPath(url, parsedBaseUrl);
    relativeUrl = ensureLeadingSlash(relativeUrl);
    relativeUrl = addTrailingSlashIfNeeded(relativeUrl);

    return {save: relativeUrl, display: displayFromBase(relativeUrl, baseUrl)};
};

// Check if URL path is relative to base path
const isUrlRelativeToBasePath = (parsedUrl: URL, parsedBaseUrl: URL): boolean => {
    if (parsedUrl.pathname && parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0) {
        return true;
    }
    // Check if path is only missing a trailing slash
    return `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
};

// Strip base URL from path
const stripBaseUrlFromPath = (url: string, parsedBaseUrl: URL): string => {
    let result = url.replace(/^[a-zA-Z0-9-]+:/, '');
    result = result.replace(/^\/\//, '');
    result = result.replace(parsedBaseUrl.host, '');
    result = result.replace(parsedBaseUrl.pathname, '');
    return result;
};

// Ensure URL starts with leading slash
const ensureLeadingSlash = (url: string): string => {
    if (!url.match(/^\//)) {
        return `/${url}`;
    }
    return url;
};

// Add trailing slash if URL doesn't have file extension or fragment
const addTrailingSlashIfNeeded = (url: string): string => {
    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        return `${url}/`;
    }
    return url;
};

// Ensure URL has protocol
const ensureProtocol = (url: string): string => {
    if (!url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
};

// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (!url) {
        return formatEmptyUrl(baseUrl);
    }

    if (isEmailUrl(url)) {
        return formatEmailUrl(url);
    }

    if (isAnchorLink(url)) {
        return formatAnchorLink(url);
    }

    if (isProtocolRelative(url)) {
        return formatProtocolRelativeUrl(url);
    }

    if (!baseUrl && !url.startsWith('http')) {
        url = ensureProtocol(url);
    }

    if (!looksLikeUrl(url)) {
        return formatNonUrl(url);
    }

    return parseAndFormatUrl(url, baseUrl);
};

// Format date for stats query
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

// Parse date string and extract components
const parseDateComponents = (dateString: string, timezone?: string) => {
    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');

    if (timezone && isISOFormat) {
        return parseDateWithTimezone(dateString, timezone);
    }

    if (hasTime && !isISOFormat) {
        return parseDateWithLocalTime(dateString);
    }

    return parseDateUTC(dateString);
};

// Parse date with timezone
const parseDateWithTimezone = (dateString: string, timezone: string) => {
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

// Parse date with local time
const parseDateWithLocalTime = (dateString: string) => {
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

// Parse date in UTC
const parseDateUTC = (dateString: string) => {
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

// Format date components to display string
const formatDateComponents = (day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month];

    if (isToday) {
        return `${day} ${monthName}`;
    }

    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

// Validate date string input
const isValidDateString = (dateString: string): boolean => {
    if (!dateString || dateString.length === 0 || typeof dateString !== 'string') {
        return false;
    }
    return true;
};

// Convert Date object to ISO string
const convertDateToString = (dateString: unknown): string => {
    // @ts-expect-error This should error if dateString is not a string, but for some reason Typescript isn't catching this
    if (dateString instanceof Date) {
        return dateString.toISOString();
    }
    return dateString as string;
};

// Format date for UI, result is in the format of `12 Jun 2025`
// When timezone is provided, the date will be converted to that timezone before formatting
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    const convertedString = convertDateToString(dateString);

    if (!isValidDateString(convertedString)) {
        return '';
    }

    const components = parseDateComponents(convertedString, timezone);
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

    // Handle invalid dates
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

// Format abbreviated number in thousands
const formatAbbreviatedThousands = (num: number): string => {
    const roundTo = num < 100000 ? 100 : 1000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000;

    if (abbreviated === 1000) {
        return '1M';
    }

    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}k`;
};

// Format abbreviated number in millions
const formatAbbreviatedMillions = (num: number): string => {
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
        return formatAbbreviatedThousands(num);
    }

    return formatAbbreviatedMillions(num);
}

// Format time duration
export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining