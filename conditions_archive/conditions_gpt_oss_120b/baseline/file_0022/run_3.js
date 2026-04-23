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
export function debounce<T extends unknown[]>(
    func: (...args: T) => void,
    wait: number,
    immediate = false
): (...args: T) => void {
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
export const isValidDomain = (value: string) =>
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(
        value
    );

/* Data formatters
/* -------------------------------------------------------------------------- */

// Helper to convert kebab-case to PascalCase with numbers
export const kebabToPascalCase = (str: string): string => {
    const processed = str.replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
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

    if (!/^[a-zA-Z0-9-]+:/i.test(url) && !/^(\/|\?)/.test(url)) {
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
    const isRelativeToBasePath =
        parsedUrl.pathname?.startsWith(parsedBaseUrl.pathname) ||
        `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;

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

    if (!/\/$/.test(url) && !/[.#?]/.test(url)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Helper to display a URL from a base URL
const displayFromBase = (url: string, baseUrl: string) => {
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }
    if (url.startsWith('/')) {
        url = url.substring(1);
    }
    return new URL(url, baseUrl).toString();
};

// Format date for stats query
export const formatQueryDate = (date: Moment) => date.format('YYYY-MM-DD');

// Format date for UI, result is in the format of `12 Jun 2025`
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    // @ts-expect-error
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }
    if (!dateString || typeof dateString !== 'string') {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISO = dateString.includes('T') || dateString.includes('Z');

    let day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean;

    if (timezone && isISO) {
        const dateMoment = moment.tz(dateString, timezone);
        const todayMoment = moment.tz(timezone);
        day = dateMoment.date();
        month = dateMoment.month();
        year = dateMoment.year();
        isToday = dateMoment.isSame(todayMoment, 'day');
        isCurrentYear = year === todayMoment.year();
    } else {
        const date = new Date(dateString);
        const today = new Date();

        if (hasTime && !isISO) {
            day = date.getDate();
            month = date.getMonth();
            year = date.getFullYear();
            isToday = date.toDateString() === today.toDateString();
            isCurrentYear = year === today.getFullYear();
        } else {
            day = date.getUTCDate();
            month = date.getUTCMonth();
            year = date.getUTCFullYear();
            isToday = date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
            isCurrentYear = year === today.getUTCFullYear();
        }
    }

    const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];
    const monthName = months[month];

    return isToday ? `${day} ${monthName}` : isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

/**
 * Format a plain time in a given time zone.
 *
 * @example
 * formatDisplayTime('2020-04-20T18:09:12.345Z', 'Africa/Lagos')
 * // 7:09pm
 */
export const formatDisplayTime = (dateString: string, timezone: string): string =>
    moment(dateString).tz(timezone).format('h:mma');

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

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: diffDays > 365 ? 'numeric' : undefined,
    });
};

// Add thousands indicator to numbers
export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

// Abbreviate numbers
export function abbreviateNumber(number: number) {
    const num = Number(number);
    if (num < 1000) return formatNumber(num);
    if (num < 1000000) {
        const roundTo = num < 100000 ? 100 : 1000;
        const rounded = Math.round(num / roundTo) * roundTo;
        const abbreviated = rounded / 1000;
        if (abbreviated === 1000) return '1M';
        const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
        return `${formatted}k`;
    }
    const roundTo = 100000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000000;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}M`;
}

// Format time duration
export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours <= 0) {
        return minutes <= 0 ? `${remainingSeconds}s` : `${minutes}m ${remainingSeconds}s`;
    }

    return `${hours}h ${minutes}m ${remainingSeconds}s`;
};

// Format a fraction to percentage
export const formatPercentage = (value: number) => {
    const percentage = value * 100;
    if (percentage === 0) return '0%';
    if (percentage < 0.1) return `${percentage.toFixed(2)}%`;
    if (percentage < 1) return `${percentage.toFixed(1)}%`;
    const rounded = Math.round(percentage);
    return `${new Intl.NumberFormat('en-US').format(rounded)}%`;
};

// Format cents to Dollars
export const centsToDollars = (value: number) => Math.round(value / 100);

/* Chart formatters
/* -------------------------------------------------------------------------- */

// Calculates the Y-axis range with padding
export const getYRangeWithLargePadding = (data: {value: number}[]) => {
    if (!data.length) return {min: 0, max: 1};

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    const roundToNearestMultiple = (num: number) => {
        if (num === 0) return 0;
        const magnitude = Math.floor(Math.log10(num));
        const multiple = Math.pow(10, magnitude);
        return Math.round(num / multiple) * multiple;
    };

    const magnitude = Math.floor(Math.log10(Math.max(max, 1)));
    const padding = Math.pow(10, magnitude);

    min = Math.max(0, min - padding);
    max = max + padding;

    min = roundToNearestMultiple(min);
    max = roundToNearestMultiple(max);

    return {min, max};
};

export const getYRange = (data: {value: number}[]) => {
    if (!data.length) return {min: 0, max: 1};

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
        return {min: Math.max(0, min - 1), max: min + 1};
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
    min = Math.max(0, min);

    if (min === max) {
        const mid = (min + max) / 2;
        const smallRange = Math.max(Math.abs(mid) * padding, roundTo);
        min = Math.max(0, Math.floor(mid - smallRange));
        max = Math.ceil(mid + smallRange);
    }

    return {min: Math.max(0, min), max};
};

// Padding for min value in Recharts
export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) return [range.min, range.max];
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - range.max * padding, minPadding), range.max];
};

// Calculates the width needed for the Y-axis based on the formatted tick values
export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string) => {
    if (!ticks.length) return 40;
    const maxLen = Math.max(...ticks.map(t => formatter(t).length));
    return Math.max(20, maxLen * 8 + 20);
};

// Get range for date
export const getRangeForStartDate = (startDate: string) => {
    const published = new Date(startDate);
    const today = new Date();
    const diffDays = Math.ceil((today.getTime() - published.getTime()) / (1000 * 3600 * 24));
    return Math.max(diffDays, 1);
};

// Return today and startdate for charts
export const getRangeDates = (range: number) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const endDate = moment().tz(timezone).endOf('day');
    const startDate =
        range === -1
            ? moment().tz(timezone).startOf('year')
            : moment().tz(timezone).subtract(range - 1, 'days').startOf('day');
    return {startDate, endDate, timezone};
};

// Converts a country code to corresponding flag emoji
export function getCountryFlag(countryCode: string) {
    if (
        !countryCode ||
        countryCode.toUpperCase() === 'NULL' ||
        countryCode === 'ᴺᵁᴸᴸ' ||
        countryCode === 'ᴺᵁ'
    ) {
        return '🏳️';
    }
    return countryCode
        .toUpperCase()
        .replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
}

/**
 * Sanitizes chart data based on the date range
 * - For ranges between 91-356 days: shows weekly changes
 * - For ranges above 356 days: shows monthly changes
 * - For other ranges: keeps data as is
 */
export const sanitizeChartData = <T extends {date: string}>(
    data: T[],
    range: number,
    fieldName: keyof T = 'value' as keyof T,
    aggregationType: 'sum' | 'avg' | 'exact' = 'avg'
): T[] => {
    if (!data.length) return [];

    if (range >= 91 && range <= 356) {
        return aggregateByPeriod(data, 'week', fieldName, aggregationType);
    }
    if (range > 356) {
        return aggregateByPeriod(data, 'month', fieldName, aggregationType);
    }
    return data;
};

type Period = 'week' | 'month';

function aggregateByPeriod<T extends {date: string}>(
    data: T[],
    period: Period,
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T[] {
    const getStart = (dateStr: string) =>
        period === 'week' ? moment(dateStr).startOf('week') : moment(dateStr).startOf('month');

    const computeValue = (total: number, count: number, last: number) => {
        if (aggregationType === 'sum') return total;
        if (aggregationType === 'avg') return count > 0 ? total / count : 0;
        return last;
    };

    const result: T[] = [];
    let currentStart = getStart(data[0].date);
    let total = 0;
    let count = 0;
    let last = 0;

    data.forEach((item, idx) => {
        const itemStart = getStart(item.date);
        const value = Number(item[fieldName]);

        if (itemStart.isSame(currentStart)) {
            total += value;
            count += 1;
            last = value;
        } else {
            result.push({
                ...item,
                date: currentStart.format('YYYY-MM-DD'),
                [fieldName]: computeValue(total, count, last),
            } as T);
            currentStart = itemStart;
            total = value;
            count = 1;
            last = value;
        }

        if (idx === data.length - 1) {
            result.push({
                ...item,
                date: currentStart.format('YYYY-MM-DD'),
                [fieldName]: computeValue(total, count, last),
            } as T);
        }
    });

    return result;
}

/**
 * Formats a date based on the range
 * - For ranges above 365 days: shows month and year (e.g. "Apr 2025")
 * - For ranges above 91 days: shows "Week of [date]"
 * - For other ranges: uses the default formatDisplayDate
 */
export const formatDisplayDateWithRange = (
    date: string,
    range: number,
    showHours = false,
    hoursOnly = false
): string => {
    if (range === 1 && hoursOnly) return moment(date).format('h:mma');
    if (range === 1 && showHours) return moment(date).format('MMM D, h:mma');
    if (range > 365) return moment(date).format('MMM YYYY');
    if (range >= 91) return `Week of ${formatDisplayDate(date)}`;
    return formatDisplayDate(date);
};

/**
 * Member formatters
 */

// Helper function to format member names with fallback to email
export const formatMemberName = (member: {name?: string; email?: string}) =>
    (member.name && member.name.trim()) || member.email || 'Unknown Member';

// Helper function to get member initials
export const getMemberInitials = (member: {name?: string}) => {
    const name = formatMemberName(member);
    const words = name.split(' ');
    if (words.length >= 2) {
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

export const stringToHslColor = (str: string, saturation: string, lightness: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, ${saturation}%, ${lightness}%)`;
};