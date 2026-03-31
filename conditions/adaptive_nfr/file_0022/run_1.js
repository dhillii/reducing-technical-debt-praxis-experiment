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

export function debounce<T extends unknown[]>(
    func: (...args: T) => void,
    wait: number,
    immediate: boolean = false
): (...args: T) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null;

    return function (this: unknown, ...args: T): void {
        const callNow = immediate && !timeoutId;

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            timeoutId = null;
            if (!immediate) {
                func.apply(this, args);
            }
        }, wait);

        if (callNow) {
            func.apply(this, args);
        }
    };
}

export const isValidDomain = (value: string): boolean => {
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(value);
};

/* Data formatters
/* -------------------------------------------------------------------------- */

export const kebabToPascalCase = (str: string): string => {
    const processed = str.replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

interface UrlResult {
    save: string | null;
    display: string;
}

const isAnchorLink = (url: string): boolean => /^#/.test(url);
const isProtocolRelative = (url: string): boolean => /^(\/\/)/.test(url);
const hasProtocol = (url: string): boolean => /^[a-zA-Z0-9-]+:/.test(url);
const isPathLike = (url: string): boolean => /^(\/|\?)/.test(url);
const endsWithSlash = (url: string): boolean => /\/$/.test(url);
const hasPathComponent = (url: string): boolean => /[.#?]/.test(url);

const normalizeUrl = (url: string): string => {
    if (!url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
};

const parseUrlSafely = (url: string, baseUrl?: string): URL | null => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};

const displayFromBase = (url: string, baseUrl: string): string => {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const normalizedUrl = url.startsWith('/') ? url.substring(1) : url;
    return new URL(normalizedUrl, normalizedBase).toString();
};

const makeRelativeUrl = (parsedUrl: URL, parsedBaseUrl: URL): string => {
    let url = parsedUrl.toString();
    url = url.replace(/^[a-zA-Z0-9-]+:/, '');
    url = url.replace(/^\/\//, '');
    url = url.replace(parsedBaseUrl.host, '');
    url = url.replace(parsedBaseUrl.pathname, '');
    return url.startsWith('/') ? url : `/${url}`;
};

const addTrailingSlash = (url: string): string => {
    return endsWithSlash(url) || hasPathComponent(url) ? url : `${url}/`;
};

export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean): UrlResult => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (!url) {
        return baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};
    }

    if (isEmail(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }

    if (isAnchorLink(url) || isProtocolRelative(url)) {
        return {save: url, display: url};
    }

    if (!baseUrl && !url.startsWith('http')) {
        url = normalizeUrl(url);
    }

    if (!hasProtocol(url) && !isPathLike(url)) {
        return {save: url, display: url};
    }

    const parsedUrl = parseUrlSafely(url, baseUrl);
    if (!parsedUrl) {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    const parsedBaseUrl = parseUrlSafely(baseUrl);
    if (!parsedBaseUrl) {
        return {save: url, display: url};
    }

    const isRelativeToBasePath = parsedUrl.pathname?.startsWith(parsedBaseUrl.pathname) ||
        `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;

    if (isOnSameHost && isRelativeToBasePath) {
        url = makeRelativeUrl(parsedUrl, parsedBaseUrl);
    }

    url = addTrailingSlash(url);

    return {save: url, display: displayFromBase(url, baseUrl)};
};

export const formatQueryDate = (date: Moment): string => {
    return date.format('YYYY-MM-DD');
};

interface DateParts {
    day: number;
    month: number;
    year: number;
    isToday: boolean;
    isCurrentYear: boolean;
}

const getDatePartsWithTimezone = (dateString: string, timezone: string): DateParts => {
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

const getDatePartsFromDate = (date: Date, hasTime: boolean, isISOFormat: boolean): DateParts => {
    const today = new Date();
    const useLocal = hasTime && !isISOFormat;

    return {
        day: useLocal ? date.getDate() : date.getUTCDate(),
        month: useLocal ? date.getMonth() : date.getUTCMonth(),
        year: useLocal ? date.getFullYear() : date.getUTCFullYear(),
        isToday: useLocal
            ? date.toDateString() === today.toDateString()
            : date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10),
        isCurrentYear: useLocal
            ? date.getFullYear() === today.getFullYear()
            : date.getUTCFullYear() === today.getUTCFullYear()
    };
};

const formatDateParts = (parts: DateParts): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parts.month];

    if (parts.isToday) {
        return `${parts.day} ${monthName}`;
    }

    return parts.isCurrentYear
        ? `${parts.day} ${monthName}`
        : `${parts.day} ${monthName} ${parts.year}`;
};

export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }

    if (!dateString || dateString.length === 0 || typeof dateString !== 'string') {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');

    const parts = timezone && isISOFormat
        ? getDatePartsWithTimezone(dateString, timezone)
        : getDatePartsFromDate(new Date(dateString), hasTime, isISOFormat);

    return formatDateParts(parts);
};

export const formatDisplayTime = (dateString: string, timezone: string): string => {
    return moment(dateString).tz(timezone).format('h:mma');
};

const TIME_UNITS = {
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000
} as const;

const getTimeDifference = (diffMs: number): {mins: number; hours: number; days: number} => ({
    mins: Math.floor(diffMs / TIME_UNITS.MINUTE),
    hours: Math.floor(diffMs / TIME_UNITS.HOUR),
    days: Math.floor(diffMs / TIME_UNITS.DAY)
});

export const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();

    if (isNaN(date.getTime())) {
        return 'Unknown';
    }

    const diffMs = now.getTime() - date.getTime();

    if (diffMs < 0) {
        return 'Just now';
    }

    const {mins, hours, days} = getTimeDifference(diffMs);

    if (mins < 1) {
        return 'Just now';
    } else if (mins < 60) {
        return `${mins} min ago`;
    } else if (hours < 24) {
        return `${hours} hr ago`;
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return `${days} days ago`;
    }

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: days > 365 ? 'numeric' : undefined
    });
};

export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

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

const abbreviateMillions = (num: number): string => {
    const roundTo = 100000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000000;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}M`;
};

export function abbreviateNumber(number: number): string {
    const num = Number(number);

    if (num < 1000) {
        return formatNumber(num);
    }

    return num < 1000000 ? abbreviateThousands(num) : abbreviateMillions(num);
}

export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours <= 0) {
        return minutes <= 0 ? `${remainingSeconds}s` : `${minutes}m ${remainingSeconds}s`;
    }

    return `${hours}h ${minutes}m ${remainingSeconds}s`;
};

export const formatPercentage = (value: number): string => {
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

export const centsToDollars = (value: number): number => {
    return Math.round(value / 100);
};

/* Chart formatters
/* -------------------------------------------------------------------------- */

const roundToNearestMultiple = (num: number): number => {
    if (num === 0) return 0;
    const magnitude = Math.floor(Math.log10(num));
    const multiple = Math.pow(10, magnitude);
    return Math.round(num / multiple) * multiple;
};

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

const roundRangeValue = (value: number, roundTo: number, isMin: boolean): number => {
    const rounded = Math.round(value / roundTo) * roundTo;
    return isMin
        ? (rounded > value ? Math.floor(value / roundTo) * roundTo : rounded)
        : (rounded < value ? Math.ceil(value / roundTo) * roundTo : rounded);
};

export const getYRange = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) {
        return {min: 0, max: 1};
    }

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
        return {min: Math.max(0, min - 1), max: max + 1};
    }

    const padding = 0.02;
    min = Math.max(0, min - min * padding);
    max = max + max * padding;

    const range = max - min;
    const rangeMagnitude = Math.floor(Math.log10(range));
    const roundTo = Math.pow(10, rangeMagnitude);

    min = roundRangeValue(min, roundTo, true);
    max = roundRangeValue(max, roundTo, false);
    min = Math.max(0, min);

    if (min === max) {
        const midPoint = (min + max) / 2;
        const smallRange = Math.max(Math.abs(midPoint) * padding, roundTo);
        min = Math.max(0, Math.floor(midPoint - small