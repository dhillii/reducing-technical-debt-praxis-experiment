```typescript
import { clsx, type ClassValue } from 'clsx';
import isEmail from 'validator/es/lib/isEmail';
import { twMerge } from 'tailwind-merge';
import moment, { Moment } from 'moment-timezone';

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

const isAnchorLink = (url: string): boolean => url.startsWith('#');
const isProtocolRelative = (url: string): boolean => url.startsWith('//');
const hasProtocol = (url: string): boolean => /^[a-zA-Z0-9-]+:/.test(url);
const isPathLike = (url: string): boolean => /^(\/|\?)/.test(url);

export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean): UrlFormatResult => {
    if (nullable && !value) {
        return { save: null, display: '' };
    }

    let url = value.trim();

    if (!url) {
        return baseUrl ? { save: '/', display: baseUrl } : { save: '', display: '' };
    }

    if (isEmail(url)) {
        const mailto = `mailto:${url}`;
        return { save: mailto, display: mailto };
    }

    if (isAnchorLink(url) || isProtocolRelative(url)) {
        return { save: url, display: url };
    }

    if (!baseUrl && !url.startsWith('http')) {
        url = `https://${url}`;
    }

    if (!hasProtocol(url) && !isPathLike(url)) {
        return { save: url, display: url };
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url, baseUrl);
    } catch {
        return { save: url, display: url };
    }

    if (!baseUrl) {
        const absoluteUrl = parsedUrl.toString();
        return { save: absoluteUrl, display: absoluteUrl };
    }

    const parsedBaseUrl = new URL(baseUrl);
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;
    const isRelativeToBasePath =
        parsedUrl.pathname.startsWith(parsedBaseUrl.pathname) ||
        `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;

    if (isOnSameHost && isRelativeToBasePath) {
        url = url
            .replace(/^[a-zA-Z0-9-]+:/, '')
            .replace(/^\/\//, '')
            .replace(parsedBaseUrl.host, '')
            .replace(parsedBaseUrl.pathname, '');

        if (!url.startsWith('/')) {
            url = `/${url}`;
        }
    }

    if (!url.endsWith('/') && !/[.#?]/.test(url)) {
        url = `${url}/`;
    }

    return { save: url, display: displayFromBase(url, baseUrl) };
};

export const formatQueryDate = (date: Moment): string => {
    return date.format('YYYY-MM-DD');
};

interface DateParseResult {
    day: number;
    month: number;
    year: number;
    isToday: boolean;
    isCurrentYear: boolean;
}

const parseDateWithTimezone = (dateString: string, timezone: string): DateParseResult => {
    const dateMoment = moment.tz(dateString, timezone);
    const todayMoment = moment.tz(timezone);

    return {
        day: dateMoment.date(),
        month: dateMoment.month(),
        year: dateMoment.year(),
        isToday: dateMoment.isSame(todayMoment, 'day'),
        isCurrentYear: dateMoment.year() === todayMoment.year(),
    };
};

const parseDateLocal = (dateString: string, hasTime: boolean): DateParseResult => {
    const date = new Date(dateString);
    const today = new Date();

    if (hasTime) {
        return {
            day: date.getDate(),
            month: date.getMonth(),
            year: date.getFullYear(),
            isToday: date.toDateString() === today.toDateString(),
            isCurrentYear: date.getFullYear() === today.getFullYear(),
        };
    }

    return {
        day: date.getUTCDate(),
        month: date.getUTCMonth(),
        year: date.getUTCFullYear(),
        isToday: date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10),
        isCurrentYear: date.getUTCFullYear() === today.getUTCFullYear(),
    };
};

const formatDateParts = (day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean): string => {
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

    if (!dateString || typeof dateString !== 'string' || dateString.length === 0) {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');

    const dateInfo = timezone && isISOFormat
        ? parseDateWithTimezone(dateString, timezone)
        : parseDateLocal(dateString, hasTime);

    return formatDateParts(dateInfo.day, dateInfo.month, dateInfo.year, dateInfo.isToday, dateInfo.isCurrentYear);
};

export const formatDisplayTime = (dateString: string, timezone: string): string => {
    return moment(dateString).tz(timezone).format('h:mma');
};

const TIME_UNITS = {
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
} as const;

export const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);

    if (isNaN(date.getTime())) {
        return 'Unknown';
    }

    const diffMs = new Date().getTime() - date.getTime();

    if (diffMs < 0) {
        return 'Just now';
    }

    const diffMins = Math.floor(diffMs / TIME_UNITS.MINUTE);
    const diffHours = Math.floor(diffMs / TIME_UNITS.HOUR);
    const diffDays = Math.floor(diffMs / TIME_UNITS.DAY);

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
        year: diffDays > 365 ? 'numeric' : undefined,
    });
};

export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

const ABBREVIATION_THRESHOLDS = [
    { threshold: 1000000, divisor: 1000000, suffix: 'M' },
    { threshold: 1000, divisor: 1000, suffix: 'k' },
] as const;

const formatAbbreviatedNumber = (num: number, divisor: number, suffix: string): string => {
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

        return formatAbbreviatedNumber(rounded, 1000, 'k');
    }

    const roundTo = 100000;
    const rounded = Math.round(num / roundTo) * roundTo;
    return formatAbbreviatedNumber(rounded, 1000000, 'M');
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

export const getYRangeWithLargePadding = (data: { value: number }[]): { min: number; max: number } => {
    if (!data.length) {
        return { min: 0, max: 1 };
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

    return { min, max };
};

export const getYRange = (data: { value: number }[]): { min: number; max: number } => {
    if (!data.length) {
        return { min: 0, max: 1 };
    }

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
        return { min: Math.max(0, min - 1), max: max + 1 };
    }

    const padding = 0.02;
    min = Math.max(0, min - min * padding);
    max = max + max * padding;

    const range = max - min;
    const rangeMagnitude = Math.floor(Math.log10(range));
    const roundTo = Math.pow(10, rangeMagnitude);

    let roundedMax = Math.round(max / roundTo) * roundTo;
    max = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    let roundedMin = Math.round(min / roundTo) * roundTo;
    min = roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin;
    min = Math.max(0, min);

    if (min === max) {
        const midPoint = (min + max) / 2;
        const smallRange = Math.max(Math.abs(midPoint) * padding, roundTo);
        min = Math.max(0, Math.floor(midPoint - smallRange));
        max = Math.ceil(midPoint + smallRange);
    }

    return { min: Math.max(0, min), max };
};

export const getYRangeWithMinPadding = (range: { min: number; max: number }): [number, number] => {
    if (range.min !== 0) {
        return [range.min, range.max];
    }
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - range.max * padding, minPadding), range.max];
};

export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string): number => {
    if (!ticks.length) {
        return 40;
    }

    const maxFormattedLength = Math.max(...ticks.map(tick => formatter(