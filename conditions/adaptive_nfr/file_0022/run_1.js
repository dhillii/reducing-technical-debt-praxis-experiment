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
    const relativeToBase = isRelativeToBasePath(parsedUrl, parsedBaseUrl);
    const sameHost = isOnSameHost(parsedUrl, parsedBaseUrl);

    if (sameHost && relativeToBase) {
        url = url.replace(/^[a-zA-Z0-9-]+:/, '');
        url = url.replace(/^\/\//, '');
        url = url.replace(parsedBaseUrl.host, '');
        url = url.replace(parsedBaseUrl.pathname, '');

        if (!url.match(/^\//)) {
            url = `/${url}`;
        }
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

/** @internal Validate and normalize date string input */
const validateDateString = (dateString: string): string => {
    if (dateString instanceof Date) {
        return dateString.toISOString();
    }
    if (!dateString || dateString.length === 0 || typeof dateString !== 'string') {
        return '';
    }
    return dateString;
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
    const validatedDate = validateDateString(dateString);
    
    if (!validatedDate) {
        return '';
    }

    const hasTime = hasTimeComponent(validatedDate);
    const isISO = isISOFormatDate(validatedDate);

    let components;

    if (timezone && isISO) {
        components = extractDateComponentsWithTimezone(validatedDate, timezone);
    } else if (hasTime && !isISO) {
        components = extractDateComponentsLocalized(validatedDate);
    } else {
        components = extractDateComponentsUTC(validatedDate);
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

/** @internal Check if time difference indicates future date */
const isFutureDate = (diffMs: number): boolean => diffMs < 0;

/** @internal Check if time difference is less than 1 minute */
const isJustNow = (diffMins: number): boolean => diffMins < 1;

/** @internal Check if time difference is less than 1 hour */
const isWithinHour = (diffMins: number): boolean => diffMins < 60;

/** @internal Check if time difference is less than 1 day */
const isWithinDay = (diffHours: number): boolean => diffHours < 24;

/** @internal Check if time difference is exactly 1 day */
const isYesterday = (diffDays: number): boolean => diffDays === 1;

/** @internal Check if time difference is less than 1 week */
const isWithinWeek = (diffDays: number): boolean => diffDays < 7;

/** @internal Format timestamp as relative time string */
const formatRelativeTime = (diffMins: number, diffHours: number, diffDays: number): string => {
    if (isJustNow(diffMins)) {
        return 'Just now';
    }
    if (isWithinHour(diffMins)) {
        return `${diffMins} min ago`;
    }
    if (isWithinDay(diffHours)) {
        return `${diffHours} hr ago`;
    }
    if (isYesterday(diffDays)) {
        return 'Yesterday';
    }
    if (isWithinWeek(diffDays)) {
        return `${diffDays} days ago`;
    }
    return '';
};

// Helper function to format timestamp
export const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (isNaN(date.getTime())) {
        return 'Unknown';
    }

    const diffMs = now.getTime() - date.getTime();

    if (isFutureDate(diffMs)) {
        return 'Just now';
    }

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const relativeTime = formatRelativeTime(diffMins, diffHours, diffDays);
    if (relativeTime) {
        return relativeTime;
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

/** @internal Format thousands with appropriate rounding */
const formatThousands = (num: number): string => {
    const roundTo = num < 100000 ? 100 : 1000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000;

    if (abbreviated === 1000) {
        return '1M';
    }

    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}k`;
};

/** @internal Format millions with appropriate rounding */
const formatMillions = (num: number): string => {
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
        return formatThousands(num);
    }

    return formatMillions(num);
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

/** @internal Format percentage with appropriate precision */
const formatPercentageValue = (percentage: number): string => {
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
    return `${new