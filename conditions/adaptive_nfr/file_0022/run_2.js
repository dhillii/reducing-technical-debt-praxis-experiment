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

export const isValidDomain = (value: string) =>
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(value);

/* Data formatters
/* -------------------------------------------------------------------------- */

export const kebabToPascalCase = (str: string): string => {
    const processed = str.replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

type UrlResult = {save: string | null; display: string};

const displayFromBase = (url: string, baseUrl: string): string => {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const path = url.startsWith('/') ? url.substring(1) : url;
    return new URL(path, base).toString();
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

    if (/^#/.test(url) || /^(\/\/)/.test(url)) {
        return {save: url, display: url};
    }

    if (!baseUrl && !url.startsWith('http')) {
        url = `https://${url}`;
    }

    if (!url.match(/^[a-zA-Z0-9-]+:/) && !url.match(/^(\/|\?)/)) {
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
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;
    const isRelativeToBasePath =
        (parsedUrl.pathname?.indexOf(parsedBaseUrl.pathname) === 0) ||
        (`${parsedUrl.pathname}/` === parsedBaseUrl.pathname);

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

    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

export const formatQueryDate = (date: Moment) => date.format('YYYY-MM-DD');

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type DateComponents = {
    day: number;
    month: number;
    year: number;
    isToday: boolean;
    isCurrentYear: boolean;
};

const getDateComponentsWithTimezone = (dateString: string, timezone: string): DateComponents => {
    const dateMoment = moment.tz(dateString, timezone);
    const todayMoment = moment.tz(timezone);
    const year = dateMoment.year();
    return {
        day: dateMoment.date(),
        month: dateMoment.month(),
        year,
        isToday: dateMoment.isSame(todayMoment, 'day'),
        isCurrentYear: year === todayMoment.year()
    };
};

const getDateComponentsLocal = (date: Date): DateComponents => {
    const today = new Date();
    const year = date.getFullYear();
    return {
        day: date.getDate(),
        month: date.getMonth(),
        year,
        isToday: date.toDateString() === today.toDateString(),
        isCurrentYear: year === today.getFullYear()
    };
};

const getDateComponentsUTC = (date: Date): DateComponents => {
    const today = new Date();
    const year = date.getUTCFullYear();
    return {
        day: date.getUTCDate(),
        month: date.getUTCMonth(),
        year,
        isToday: date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10),
        isCurrentYear: year === today.getUTCFullYear()
    };
};

export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    // @ts-expect-error Runtime guard for Date objects passed as string
    if (dateString instanceof Date) {
        dateString = (dateString as Date).toISOString();
    }

    if (!dateString || typeof dateString !== 'string' || dateString.length === 0) {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');

    let components: DateComponents;

    if (timezone && isISOFormat) {
        components = getDateComponentsWithTimezone(dateString, timezone);
    } else if (hasTime && !isISOFormat) {
        components = getDateComponentsLocal(new Date(dateString));
    } else {
        components = getDateComponentsUTC(new Date(dateString));
    }

    const {day, month, year, isToday, isCurrentYear} = components;
    const monthName = MONTH_NAMES[month];

    if (isToday || isCurrentYear) {
        return `${day} ${monthName}`;
    }

    return `${day} ${monthName} ${year}`;
};

export const formatDisplayTime = (dateString: string, timezone: string): string =>
    moment(dateString).tz(timezone).format('h:mma');

const MS_PER_MINUTE = 1000 * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

export const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);

    if (isNaN(date.getTime())) {
        return 'Unknown';
    }

    const diffMs = Date.now() - date.getTime();

    if (diffMs < 0) {
        return 'Just now';
    }

    const diffMins = Math.floor(diffMs / MS_PER_MINUTE);
    const diffHours = Math.floor(diffMs / MS_PER_HOUR);
    const diffDays = Math.floor(diffMs / MS_PER_DAY);

    if (diffMins < 1) {return 'Just now';}
    if (diffMins < 60) {return `${diffMins} min ago`;}
    if (diffHours < 24) {return `${diffHours} hr ago`;}
    if (diffDays === 1) {return 'Yesterday';}
    if (diffDays < 7) {return `${diffDays} days ago`;}

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

const formatAbbreviated = (value: number, divisor: number, suffix: string): string => {
    const abbreviated = value / divisor;
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

        if (rounded === 1000000) {
            return '1M';
        }

        return formatAbbreviated(rounded, 1000, 'k');
    }

    const rounded = Math.round(num / 100000) * 100000;
    return formatAbbreviated(rounded, 1000000, 'M');
}

export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {return `${hours}h ${minutes}m ${remainingSeconds}s`;}
    if (minutes > 0) {return `${minutes}m ${remainingSeconds}s`;}
    return `${remainingSeconds}s`;
};

export const formatPercentage = (value: number): string => {
    const percentage = value * 100;

    if (percentage === 0) {return '0%';}
    if (percentage < 0.1) {return `${percentage.toFixed(2)}%`;}
    if (percentage < 1) {return `${percentage.toFixed(1)}%`;}

    return `${new Intl.NumberFormat('en-US').format(Math.round(percentage))}%`;
};

export const centsToDollars = (value: number) => Math.round(value / 100);

/* Chart formatters
/* -------------------------------------------------------------------------- */

const roundToNearestMagnitude = (num: number): number => {
    if (num === 0) {return 0;}
    const magnitude = Math.floor(Math.log10(num));
    const multiple = Math.pow(10, magnitude);
    return Math.round(num / multiple) * multiple;
};

export const getYRangeWithLargePadding = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) {return {min: 0, max: 1};}

    const values = data.map(d => Number(d.value));
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);

    const magnitude = Math.floor(Math.log10(Math.max(rawMax, 1)));
    const padding = Math.pow(10, magnitude);

    return {
        min: roundToNearestMagnitude(Math.max(0, rawMin - padding)),
        max: roundToNearestMagnitude(rawMax + padding)
    };
};

export const getYRange = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) {return {min: 0, max: 1};}

    const values = data.map(d => Number(d.value));
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);

    if (rawMin === rawMax) {
        return {min: Math.max(0, rawMin - 1), max: rawMax + 1};
    }

    const padding = 0.02;
    let min = Math.max(0, rawMin - rawMin * padding);
    let max = rawMax + rawMax * padding;

    const rangeMagnitude = Math.floor(Math.log10(max - min));
    const roundTo = Math.pow(10, rangeMagnitude);

    const roundedMax = Math.round(max / roundTo) * roundTo;
    max = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    const roundedMin = Math.round(min / roundTo) * roundTo;
    min = Math.max(0, roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin);

    if (min === max) {
        const smallRange = Math.max(Math.abs(max) * padding, roundTo);
        min = Math.max(0, Math.floor(max - smallRange));
        max = Math.ceil(max + smallRange);
    }

    return {min: Math.max(0, min), max};
};

export const getYRangeWithMinPadding = (range: {min: number; max: number}): number[] => {
    if (range.min !== 0) {
        return [range.min, range.max];
    }
    return [Math.min(-(range.max * 0.005), -2), range.max];
};

export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string): number => {
    if (!ticks.length) {return 40;}
    const maxLength = Math.max(...ticks.map(tick => formatter(tick).length));
    return Math.max(20, maxLength * 8 + 20);
};

export const getRangeForStartDate = (startDate: string): number => {
    const diffMs = Date.now() - new Date(startDate).getTime();
    return Math.max(Math.ceil(diffMs / (1000 * 3600 * 24)), 1);
};

export const getRangeDates = (range: number) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const endDate = moment().tz(timezone).endOf('day');
    const startDate = range === -1
        ? moment().tz(timezone).startOf('year')
        : moment().tz(timezone).subtract(range - 1, 'days').startOf('day');

    return {startDate, endDate, timezone};
};

const NULL_COUNTRY_VALUES = new Set(['NULL', 'ᴺᵁᴸᴸ', 'ᴺᵁ']);

export function getCountryFlag(countryCode: string): string {
    if (!countryCode || NULL_COUNTRY_VALUES.has(countryCode.toUpperCase())) {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace