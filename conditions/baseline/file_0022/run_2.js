```typescript
import {clsx, type ClassValue} from 'clsx';
import isEmail from 'validator/es/lib/isEmail';
import {twMerge} from 'tailwind-merge';
import moment, {Moment} from 'moment-timezone';

/* Generic helper functions
/* -------------------------------------------------------------------------- */

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

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

export const isValidDomain = (value: string) => {
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(value);
};

/* Data formatters
/* -------------------------------------------------------------------------- */

export const kebabToPascalCase = (str: string): string => {
    const processed = str
        .replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

const isEmailUrl = (url: string): boolean => isEmail(url);
const isAnchorLink = (url: string): boolean => /^#/.test(url);
const isProtocolRelative = (url: string): boolean => /^(\/\/)/.test(url);
const hasProtocol = (url: string): boolean => /^[a-zA-Z0-9-]+:/.test(url);
const isPathOrQuery = (url: string): boolean => /^(\/|\?)/.test(url);
const hasTrailingSlash = (url: string): boolean => /\/$/.test(url);
const hasSpecialChars = (url: string): boolean => /[.#?]/.test(url);

const handleNullableUrl = (value: string, baseUrl?: string): {save: string | null; display: string} | null => {
    if (!value) {
        if (baseUrl) {
            return {save: '/', display: baseUrl};
        }
        return {save: '', display: ''};
    }
    return null;
};

const handleSpecialUrlFormats = (url: string): {save: string; display: string} | null => {
    if (isEmailUrl(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }
    if (isAnchorLink(url)) {
        return {save: url, display: url};
    }
    if (isProtocolRelative(url)) {
        return {save: url, display: url};
    }
    return null;
};

const normalizeUrl = (url: string, baseUrl?: string): string => {
    if (!baseUrl && !url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
};

const isValidUrlFormat = (url: string): boolean => {
    return hasProtocol(url) || isPathOrQuery(url);
};

const parseUrlSafely = (url: string, baseUrl?: string): URL | null => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};

const makeUrlRelativeToBase = (url: string, parsedUrl: URL, parsedBaseUrl: URL): string => {
    const isRelativeToBasePath = parsedUrl.pathname?.startsWith(parsedBaseUrl.pathname) || 
        `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;

    if (!isOnSameHost || !isRelativeToBasePath) {
        return url;
    }

    let relativeUrl = url
        .replace(/^[a-zA-Z0-9-]+:/, '')
        .replace(/^\/\//, '')
        .replace(parsedBaseUrl.host, '')
        .replace(parsedBaseUrl.pathname, '');

    if (!relativeUrl.match(/^\//)) {
        relativeUrl = `/${relativeUrl}`;
    }

    return relativeUrl;
};

const addTrailingSlashIfNeeded = (url: string): string => {
    if (!hasTrailingSlash(url) && !hasSpecialChars(url)) {
        return `${url}/`;
    }
    return url;
};

export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    const nullableResult = handleNullableUrl(url, baseUrl);
    if (nullableResult !== null) {
        return nullableResult;
    }

    const specialResult = handleSpecialUrlFormats(url);
    if (specialResult) {
        return specialResult;
    }

    url = normalizeUrl(url, baseUrl);

    if (!isValidUrlFormat(url)) {
        return {save: url, display: url};
    }

    const parsedUrl = parseUrlSafely(url, baseUrl);
    if (!parsedUrl) {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    const parsedBaseUrl = new URL(baseUrl);
    url = makeUrlRelativeToBase(url, parsedUrl, parsedBaseUrl);
    url = addTrailingSlashIfNeeded(url);

    return {save: url, display: displayFromBase(url, baseUrl)};
};

const displayFromBase = (url: string, baseUrl: string) => {
    let normalizedBaseUrl = baseUrl;
    if (!normalizedBaseUrl.endsWith('/')) {
        normalizedBaseUrl += '/';
    }

    let normalizedUrl = url;
    if (normalizedUrl.startsWith('/')) {
        normalizedUrl = normalizedUrl.substring(1);
    }

    return new URL(normalizedUrl, normalizedBaseUrl).toString();
};

export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

const parseDateString = (dateString: string): {hasTime: boolean; isISOFormat: boolean} => {
    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');
    return {hasTime, isISOFormat};
};

const getDateComponentsWithTimezone = (dateString: string, timezone: string): {day: number; month: number; year: number; isToday: boolean; isCurrentYear: boolean} => {
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

const getDateComponentsFromDate = (dateString: string, hasTime: boolean, isISOFormat: boolean): {day: number; month: number; year: number; isToday: boolean; isCurrentYear: boolean} => {
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

const formatDateOutput = (day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month];

    if (isToday) {
        return `${day} ${monthName}`;
    }

    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }

    if (!dateString || dateString.length === 0 || typeof dateString !== 'string') {
        return '';
    }

    const {hasTime, isISOFormat} = parseDateString(dateString);

    let dateComponents;
    if (timezone && isISOFormat) {
        dateComponents = getDateComponentsWithTimezone(dateString, timezone);
    } else {
        dateComponents = getDateComponentsFromDate(dateString, hasTime, isISOFormat);
    }

    return formatDateOutput(dateComponents.day, dateComponents.month, dateComponents.year, dateComponents.isToday, dateComponents.isCurrentYear);
};

export const formatDisplayTime = (dateString: string, timezone: string): string => (
    moment(dateString).tz(timezone).format('h:mma')
);

const getTimeDifference = (now: Date, date: Date): {diffMs: number; diffMins: number; diffHours: number; diffDays: number} => {
    const diffMs = now.getTime() - date.getTime();
    return {
        diffMs,
        diffMins: Math.floor(diffMs / (1000 * 60)),
        diffHours: Math.floor(diffMs / (1000 * 60 * 60)),
        diffDays: Math.floor(diffMs / (1000 * 60 * 60 * 24))
    };
};

const formatTimestampOutput = (diffMins: number, diffHours: number, diffDays: number, date: Date): string => {
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
    } else {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: diffDays > 365 ? 'numeric' : undefined
        });
    }
};

export const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (isNaN(date.getTime())) {
        return 'Unknown';
    }

    const {diffMs, diffMins, diffHours, diffDays} = getTimeDifference(now, date);

    if (diffMs < 0) {
        return 'Just now';
    }

    return formatTimestampOutput(diffMins, diffHours, diffDays, date);
};

export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

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

const formatMillions = (num: number): string => {
    const roundTo = 100000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000000;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}M`;
};

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

export const centsToDollars = (value: number) => {
    return Math.round(value / 100);
};

/* Chart formatters
/* -------------------------------------------------------------------------- */

const roundToNearestMultiple = (num: number): number => {
    if (num === 0) {
        return 0;
    }

    const magnitude = Math.floor(Math.log10(num));
    const multiple = Math.pow(10, magnitude);

    return Math.round(num / multiple) * multiple;
};

export const getYRangeWithLargePadding = (data: { value: number }[]): {min: number; max: number} => {
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