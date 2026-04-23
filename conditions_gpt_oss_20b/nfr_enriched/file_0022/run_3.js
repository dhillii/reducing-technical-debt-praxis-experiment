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

/**
 * Determine if a URL is an anchor link (starts with '#').
 */
const isAnchorLink = (url: string): boolean => url.startsWith('#');

/**
 * Determine if a URL is protocol-relative (starts with '//').
 */
const isProtocolRelative = (url: string): boolean => url.startsWith('//');

/**
 * Ensure a URL has a scheme; if missing, prepend 'https://'.
 */
const ensureAbsoluteUrl = (url: string): string => {
    if (!url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
};

/**
 * Check if a string looks like a URL (contains a scheme or starts with '/' or '?').
 */
const looksLikeUrl = (url: string): boolean => {
    return /^[a-zA-Z0-9-]+:/.test(url) || /^\/|\?/.test(url);
};

/**
 * Parse a URL relative to a base URL if provided.
 * Returns an object containing the parsed URL and the parsed base URL (if any).
 */
const parseUrl = (url: string, baseUrl?: string): {parsedUrl: URL; parsedBaseUrl?: URL} | null => {
    try {
        const parsedUrl = new URL(url, baseUrl);
        const parsedBaseUrl = baseUrl ? new URL(baseUrl) : undefined;
        return {parsedUrl, parsedBaseUrl};
    } catch {
        return null;
    }
};

/**
 * Determine if a parsed URL is relative to a base URL.
 */
const isRelativeToBase = (parsedUrl: URL, parsedBaseUrl?: URL): boolean => {
    if (!parsedBaseUrl) return false;
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;
    const isPathMatch = parsedUrl.pathname.startsWith(parsedBaseUrl.pathname);
    const isTrailingSlashMatch = `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
    return isOnSameHost && (isPathMatch || isTrailingSlashMatch);
};

/**
 * Strip the base URL components from a URL string.
 */
const stripBaseFromUrl = (url: string, base: URL): string => {
    let result = url;
    result = result.replace(/^https?:\/\//, '');
    result = result.replace(base.host, '');
    result = result.replace(base.pathname, '');
    if (!result.startsWith('/')) {
        result = `/${result}`;
    }
    return result;
};

/**
 * Ensure a URL ends with a trailing slash unless it contains a fragment, query, or ends with a slash.
 */
const ensureTrailingSlash = (url: string): string => {
    if (!url.endsWith('/') && !url.includes('#') && !url.includes('?')) {
        return `${url}/`;
    }
    return url;
};

/**
 * Format a URL for storage and display.
 */
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

    if (isEmail(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }

    if (isAnchorLink(url)) {
        return {save: url, display: url};
    }

    if (isProtocolRelative(url)) {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        url = ensureAbsoluteUrl(url);
    }

    if (!looksLikeUrl(url)) {
        return {save: url, display: url};
    }

    const parsed = parseUrl(url, baseUrl);
    if (!parsed) {
        return {save: url, display: url};
    }

    const {parsedUrl, parsedBaseUrl} = parsed;

    if (isRelativeToBase(parsedUrl, parsedBaseUrl)) {
        url = stripBaseFromUrl(url, parsedBaseUrl!);
    }

    url = ensureTrailingSlash(url);

    return {save: url, display: displayFromBase(url, baseUrl)};
};

/**
 * Helper to display a URL from a base URL.
 */
const displayFromBase = (url: string, baseUrl: string) => {
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }
    if (url.startsWith('/')) {
        url = url.substring(1);
    }
    return new URL(url, baseUrl).toString();
};

/**
 * Format date for stats query.
 */
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

/**
 * Analyze a date string to determine if it contains time and if it is ISO format.
 */
const analyzeDateString = (dateString: string) => {
    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');
    return {hasTime, isISOFormat};
};

/**
 * Compute day, month, year, and flags for a date string.
 */
const computeDateComponents = (
    dateString: string,
    timezone: string | undefined,
    hasTime: boolean,
    isISOFormat: boolean
) => {
    let day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean;

    if (timezone && isISOFormat) {
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

        if (hasTime && !isISOFormat) {
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

    return {day, month, year, isToday, isCurrentYear};
};

/**
 * Get month name from month index.
 */
const getMonthName = (month: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month];
};

/**
 * Format a date for UI display.
 */
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }
    if (!dateString || typeof dateString !== 'string' || dateString.length === 0) {
        return '';
    }

    const {hasTime, isISOFormat} = analyzeDateString(dateString);
    const {day, month, year, isToday, isCurrentYear} = computeDateComponents(dateString, timezone, hasTime, isISOFormat);
    const monthName = getMonthName(month);

    if (isToday) {
        return `${day} ${monthName}`;
    }

    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

/**
 * Format a plain time in a given time zone.
 */
export const formatDisplayTime = (dateString: string, timezone: string): string => (
    moment(dateString).tz(timezone).format('h:mma')
);

/**
 * Helper function to format a timestamp.
 */
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

/**
 * Add thousands indicator to numbers.
 */
export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

/**
 * Abbreviate numbers.
 */
export function abbreviateNumber(number: number) {
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

        const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
        return `${formatted}k`;
    }

    const roundTo = 100000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000000;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}M`;
}

/**
 * Format time duration.
 */
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

/**
 * Format a fraction to percentage.
 */
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

/**
 * Format cents to Dollars.
 */
export const centsToDollars = (value: number) => {
    return Math.round(value / 100);
};

/* Chart formatters
/* -------------------------------------------------------------------------- */

/**
 * Calculates the Y-axis range with padding.
 */
export const getYRangeWithLargePadding = (data: { value: number }[]): {min: number; max: number} => {
    if (!data.length) {
        return {min: 0, max: 1};
    }

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    const roundToNearestMultiple = (num: number): number => {
        if (num === 0) {
            return 0;
        }
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

export const getYRange = (data: { value: number }[]): {min: number; max: number} => {
    if (!data.length) {
        return {min: 0, max: 1};
    }

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
        const value = min;
        return {min: Math.max(0, value - 1), max: value + 1};
    }

    const padding = 0.02;

    min = Math.max(0, min - (min * padding));
    max = max + (max * padding);

    const range = max - min;
    const rangeMagnitude = Math.floor(Math.log10(range));
    const roundTo = Math.pow(10, rangeMagnitude);

    const roundedMax = Math.round(max / roundTo) * roundTo;
    max = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    const roundedMin = Math.round(min / roundTo) * roundTo;
    min = roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin;
    min = Math.max(0, min);

    if (min === max) {
        const midPoint = (min + max) / 2;
        const smallRange = Math.max(Math.abs(midPoint) * padding, roundTo);
        min = Math.max(0, Math.floor(midPoint - smallRange));
        max = Math.ceil(midPoint + smallRange);
    }

    min = Math.max(0, min);

    return {min, max};
};

export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) {
        return [range.min, range.max];
    }
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - (range.max * padding), minPadding), range.max];
};

export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string): number => {
    if (!ticks.length) {
        return 40;
    }

    const maxFormattedLength = Math.max(...ticks.map(tick => formatter(tick).length));
    const width = Math.max(20, maxFormattedLength * 8 + 20);
    return width;
};

export const getRangeForStartDate = (startDate: string) => {
    const publishedDate = new Date(startDate);
    const today = new Date();
    const diffInTime = today.getTime() - publishedDate.getTime();
    const diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24));
    return Math.max(diffInDays, 1);
};

export const getRangeDates = (range: number) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const endDate = moment().tz(timezone).endOf('day');
    let startDate;

    if (range === -1) {
        startDate = moment().tz(timezone).startOf('year');
    } else {
        startDate = moment().tz(timezone).subtract(range - 1, 'days').startOf('day');
    }

    return {startDate, endDate, timezone};
};

export function getCountryFlag(countryCode:string) {
    if (!countryCode || countryCode === null || countryCode.toUpperCase() === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ') {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

/**
 * Aggregate data weekly.
 */
const aggregateWeekly = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact') => {
    const weeklyData: T[] = [];
    let currentWeek = moment(data[0].date).startOf('week');
    let weekTotal = 0;
    let weekCount = 0;
    let lastValue = 0;

    data.forEach((item, index) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentWeek, 'week')) {
            weekTotal += Number(item[fieldName]);
            weekCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            weeklyData.push({
                ...data[index - 1],
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: aggregationType === 'sum' ? weekTotal :
                    aggregationType === 'avg' ? (weekCount > 0 ? weekTotal / weekCount : 0) :
                        lastValue
            } as T);

            currentWeek = itemDate.startOf('week');
            weekTotal = Number(item[fieldName]);
            weekCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (index === data.length - 1) {
            weeklyData.push({
                ...item,
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: aggregationType === 'sum' ? weekTotal :
                    aggregationType === 'avg' ? (weekCount > 0 ? weekTotal / weekCount : 0) :
                        lastValue
            } as T);
        }
    });

    return weeklyData;
};

/**
 * Aggregate data monthly.
 */
const aggregateMonthly = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact') => {
    const monthlyData: T[] = [];
    let currentMonth = moment(data[0].date).startOf('month');
    let monthTotal = 0;
    let monthCount = 0;
    let lastValue = 0;

    data.forEach((item, index) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentMonth, 'month')) {
            monthTotal += Number(item[fieldName]);
            monthCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            monthlyData.push({
                ...data[index - 1],
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]: aggregationType === 'sum' ? monthTotal :
                    aggregationType === 'avg' ? (monthCount > 0 ? monthTotal / monthCount : 0) :
                        lastValue
            } as T);

            currentMonth = itemDate.startOf('month');
            monthTotal = Number(item[fieldName]);
            monthCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (index === data.length - 1) {
            monthlyData.push({
                ...item,
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]: aggregationType === 'sum' ? monthTotal :
                    aggregationType === 'avg' ? (monthCount > 0 ? monthTotal / monthCount : 0) :
                        lastValue
            } as T);
        }
    });

    return monthlyData;
};

/**
 * Sanitizes chart data based on the date range.
 */
export const sanitizeChartData = <T extends {date: string}>(data: T[], range: number, fieldName: keyof T = 'value' as keyof T, aggregationType: 'sum' | 'avg' | 'exact' = 'avg'): T[] => {
    if (!data.length) {
        return [];
    }

    if (range >= 91 && range <= 356) {
        return aggregateWeekly(data, fieldName, aggregationType);
    } else if (range > 356) {
        return aggregateMonthly(data, fieldName, aggregationType);
    }

    return data;
};

export const formatDisplayDateWithRange = (date: string, range: number, showHours: boolean = false, hoursOnly: boolean = false): string => {
    if (range === 1 && hoursOnly) {
        return moment(date).format('h:mma');
    } else if (range === 1 && showHours) {
        return moment(date).format('MMM D, h:mma');
    } else if (range > 365) {
        return moment(date).format('MMM YYYY');
    } else if (range >= 91) {
        return `Week of ${formatDisplayDate(date)}`;
    }
    return formatDisplayDate(date);
};

/**
 * Formats a member name with fallback to email.
 */
export const formatMemberName = (member: {name?: string; email?: string}) => {
    return (member.name && member.name.trim()) || member.email || 'Unknown Member';
};

/**
 * Get member initials.
 */
export const getMemberInitials = (member: {name?: string}) => {
    const name = formatMemberName(member);
    const words = name.split(' ');
    if (words.length >= 2) {
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

export const stringToHslColor = (str: string, saturation:string, lightness:string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const h = hash % 360;
    return 'hsl(' + h + ', ' + saturation + '%, ' + lightness + '%)';
};