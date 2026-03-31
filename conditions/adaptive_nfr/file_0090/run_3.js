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
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

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

interface UrlFormatResult {
    save: string | null;
    display: string;
}

const displayFromBase = (url: string, baseUrl: string): string => {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const normalizedUrl = url.startsWith('/') ? url.substring(1) : url;
    return new URL(normalizedUrl, normalizedBase).toString();
};

const isAnchorOrProtocolRelative = (url: string): boolean => {
    return /^(#|\/\/)/.test(url);
};

const shouldAddHttps = (url: string, baseUrl?: string): string => {
    if (baseUrl || url.startsWith('http')) {
        return url;
    }
    return `https://${url}`;
};

const isValidUrlFormat = (url: string): boolean => {
    return /^[a-zA-Z0-9-]+:/.test(url) || /^(\/|\?)/.test(url);
};

const parseUrlSafely = (url: string, baseUrl?: string): URL | null => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};

const normalizeRelativeUrl = (url: string, parsedUrl: URL, parsedBaseUrl: URL): string => {
    let normalized = url
        .replace(/^[a-zA-Z0-9-]+:/, '')
        .replace(/^\/\//, '')
        .replace(parsedBaseUrl.host, '')
        .replace(parsedBaseUrl.pathname, '');

    if (!normalized.match(/^\//)) {
        normalized = `/${normalized}`;
    }

    if (!normalized.match(/\/$/) && !normalized.match(/[.#?]/)) {
        normalized = `${normalized}/`;
    }

    return normalized;
};

export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean): UrlFormatResult => {
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

    if (isAnchorOrProtocolRelative(url)) {
        return {save: url, display: url};
    }

    url = shouldAddHttps(url, baseUrl);

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
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;
    const isRelativeToBasePath = parsedUrl.pathname?.startsWith(parsedBaseUrl.pathname) ||
        `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;

    if (isOnSameHost && isRelativeToBasePath) {
        url = normalizeRelativeUrl(url, parsedUrl, parsedBaseUrl);
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

export const formatQueryDate = (date: Moment): string => {
    return date.format('YYYY-MM-DD');
};

interface DateFormatContext {
    day: number;
    month: number;
    year: number;
    isToday: boolean;
    isCurrentYear: boolean;
}

const getDateContextFromTimezone = (dateString: string, timezone: string): DateFormatContext => {
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

const getDateContextFromDate = (dateString: string, hasTime: boolean, isISOFormat: boolean): DateFormatContext => {
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

export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }

    if (!dateString || typeof dateString !== 'string') {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');

    const context = timezone && isISOFormat
        ? getDateContextFromTimezone(dateString, timezone)
        : getDateContextFromDate(dateString, hasTime, isISOFormat);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[context.month];

    if (context.isToday) {
        return `${context.day} ${monthName}`;
    }

    return context.isCurrentYear
        ? `${context.day} ${monthName}`
        : `${context.day} ${monthName} ${context.year}`;
};

export const formatDisplayTime = (dateString: string, timezone: string): string => {
    return moment(dateString).tz(timezone).format('h:mma');
};

const TIME_UNITS = {
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000
} as const;

const getTimestampLabel = (diffMs: number): string => {
    if (diffMs < 0 || diffMs < TIME_UNITS.MINUTE) {
        return 'Just now';
    }

    const diffMins = Math.floor(diffMs / TIME_UNITS.MINUTE);
    if (diffMins < 60) {
        return `${diffMins} min ago`;
    }

    const diffHours = Math.floor(diffMs / TIME_UNITS.HOUR);
    if (diffHours < 24) {
        return `${diffHours} hr ago`;
    }

    const diffDays = Math.floor(diffMs / TIME_UNITS.DAY);
    if (diffDays === 1) {
        return 'Yesterday';
    }

    if (diffDays < 7) {
        return `${diffDays} days ago`;
    }

    return null;
};

export const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();

    if (isNaN(date.getTime())) {
        return 'Unknown';
    }

    const diffMs = now.getTime() - date.getTime();
    const label = getTimestampLabel(diffMs);

    if (label) {
        return label;
    }

    const diffDays = Math.floor(diffMs / TIME_UNITS.DAY);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: diffDays > 365 ? 'numeric' : undefined
    });
};

export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

const ABBREVIATION_THRESHOLDS = [
    {threshold: 1000000, divisor: 1000000, suffix: 'M'},
    {threshold: 1000, divisor: 1000, suffix: 'k'}
] as const;

const formatAbbreviatedValue = (num: number, divisor: number, suffix: string): string => {
    const abbreviated = num / divisor;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}${suffix}`;
};

export function abbreviateNumber(number: number): string {
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

        return formatAbbreviatedValue(rounded, 1000, 'k');
    }

    const rounded = Math.round(num / 100000) * 100000;
    return formatAbbreviatedValue(rounded, 1000000, 'M');
}

export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    }

    return `${remainingSeconds}s`;
};

export const formatPercentage = (value: number): string => {
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

const ensureVisibleRange = (min: number, max: number, padding: number, roundTo: number): {min: number; max: number} => {
    if (min === max) {
        const midPoint = (min + max) / 2;
        const smallRange = Math.max(Math.abs(midPoint) * padding, roundTo);
        return {
            min: Math.max(0, Math.floor(midPoint - smallRange)),
            max: Math.ceil(midPoint + smallRange)
        };
    }
    return {min: Math.max(0, min), max};
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

    const roundedMax = Math.round(max / roundTo) * roundTo;
    max = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    const roundedMin = Math.round(min / roundTo) * roundTo;
    min = roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin;

    const result = ensureVisibleRange(min, max, padding, roundTo);
    return {min: