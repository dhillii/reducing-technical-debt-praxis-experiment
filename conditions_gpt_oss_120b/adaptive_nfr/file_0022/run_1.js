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
    immediate: boolean = false
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
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(value);

/* Data formatters
/* -------------------------------------------------------------------------- */

// Helper to convert kebab-case to PascalCase with numbers
export const kebabToPascalCase = (str: string): string => {
    const processed = str.replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

/**
 * Guard predicate: value is empty after trimming.
 */
function isEmptyTrimmed(value: string): boolean {
    return value.trim().length === 0;
}

/**
 * Guard predicate: URL is an email address.
 */
function isEmailUrl(url: string): boolean {
    return isEmail(url);
}

/**
 * Guard predicate: URL is an anchor link (starts with #).
 */
function isAnchorLink(url: string): boolean {
    return /^#/.test(url);
}

/**
 * Guard predicate: URL is protocol‑relative (starts with //).
 */
function isProtocolRelative(url: string): boolean {
    return /^(\/\/)/.test(url);
}

/**
 * Guard predicate: URL looks like a scheme (e.g. http:).
 */
function hasScheme(url: string): boolean {
    return /^[a-zA-Z0-9-]+:/.test(url);
}

/**
 * Guard predicate: URL starts with / or ? (relative path or query).
 */
function isPathOrQuery(url: string): boolean {
    return /^(\/|\?)/.test(url);
}

/**
 * Helper to ensure a URL string has a protocol.
 */
function ensureProtocol(url: string): string {
    return url.startsWith('http') ? url : `https://${url}`;
}

/**
 * Helper to compute display URL from a base.
 */
function displayFromBase(url: string, baseUrl: string): string {
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }
    if (url.startsWith('/')) {
        url = url.substring(1);
    }
    return new URL(url, baseUrl).toString();
}

/**
 * Formats a URL for storage and display.
 *
 * @param value   Raw input value.
 * @param baseUrl Optional base URL for relative resolution.
 * @param nullable If true, empty values return null save.
 */
export const formatUrl = (
    value: string,
    baseUrl?: string,
    nullable?: boolean
) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    const trimmed = value.trim();

    if (isEmptyTrimmed(trimmed)) {
        if (baseUrl) {
            return {save: '/', display: baseUrl};
        }
        return {save: '', display: ''};
    }

    if (isEmailUrl(trimmed)) {
        const mailto = `mailto:${trimmed}`;
        return {save: mailto, display: mailto};
    }

    if (isAnchorLink(trimmed) || isProtocolRelative(trimmed)) {
        return {save: trimmed, display: trimmed};
    }

    const urlWithProtocol = baseUrl ? trimmed : ensureProtocol(trimmed);

    if (!hasScheme(urlWithProtocol) && !isPathOrQuery(urlWithProtocol)) {
        return {save: urlWithProtocol, display: urlWithProtocol};
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(urlWithProtocol, baseUrl);
    } catch {
        return {save: urlWithProtocol, display: urlWithProtocol};
    }

    if (!baseUrl) {
        const absolute = parsedUrl.toString();
        return {save: absolute, display: absolute};
    }

    const base = new URL(baseUrl);
    const isSameHost = parsedUrl.host === base.host;
    const isPathWithinBase =
        parsedUrl.pathname?.startsWith(base.pathname) ||
        `${parsedUrl.pathname}/` === base.pathname;

    if (isSameHost && isPathWithinBase) {
        let relative = urlWithProtocol
            .replace(/^[a-zA-Z0-9-]+:/, '')
            .replace(/^\/\//, '')
            .replace(base.host, '')
            .replace(base.pathname, '');

        if (!relative.startsWith('/')) {
            relative = `/${relative}`;
        }
        urlWithProtocol = relative;
    }

    if (!urlWithProtocol.endsWith('/') && !/[.#?]/.test(urlWithProtocol)) {
        urlWithProtocol = `${urlWithProtocol}/`;
    }

    return {
        save: urlWithProtocol,
        display: displayFromBase(urlWithProtocol, baseUrl),
    };
};

// Format date for stats query
export const formatQueryDate = (date: Moment) => date.format('YYYY-MM-DD');

/**
 * Guard predicate: input is a Date instance.
 */
function isDateInstance(value: unknown): value is Date {
    return value instanceof Date;
}

/**
 * Guard predicate: string is empty or not a string.
 */
function isInvalidString(value: unknown): boolean {
    return !value || typeof value !== 'string' || (value as string).length === 0;
}

/**
 * Formats a date for UI display.
 *
 * @param dateString ISO or localized date string.
 * @param timezone   Optional IANA timezone.
 */
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (isDateInstance(dateString)) {
        dateString = dateString.toISOString();
    }

    if (isInvalidString(dateString)) {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISO = dateString.includes('T') || dateString.includes('Z');

    let day: number, month: number, year: number;
    let isToday = false;
    let isCurrentYear = false;

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

    const monthNames = [
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
    const monthName = monthNames[month];

    if (isToday) {
        return `${day} ${monthName}`;
    }

    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

/**
 * Formats a plain time in a given time zone.
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
export const centsToDollars = (value: number) => Math.round(value / 100);

/* Chart formatters
/* -------------------------------------------------------------------------- */

// Helper predicate: data array is empty.
function isEmptyData<T>(data: T[]): boolean {
    return data.length === 0;
}

// Helper predicate: value is zero.
function isZero(num: number): boolean {
    return num === 0;
}

/**
 * Calculates the Y-axis range with padding.
 */
export const getYRangeWithLargePadding = (data: {value: number}[]) => {
    if (isEmptyData(data)) {
        return {min: 0, max: 1};
    }

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    const roundToNearestMultiple = (num: number): number => {
        if (isZero(num)) {
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

/**
 * Calculates the Y-axis range with modest padding.
 */
export const getYRange = (data: {value: number}[]) => {
    if (isEmptyData(data)) {
        return {min: 0, max: 1};
    }

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (min === max) {
        const value = min;
        return {min: Math.max(0, value - 1), max: value + 1};
    }

    const paddingFactor = 0.02;
    min = Math.max(0, min - min * paddingFactor);
    max = max + max * paddingFactor;

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
        const smallRange = Math.max(Math.abs(mid) * paddingFactor, roundTo);
        min = Math.max(0, Math.floor(mid - smallRange));
        max = Math.ceil(mid + smallRange);
    }

    min = Math.max(0, min);
    return {min, max};
};

/**
 * Adds minimal padding when the Y‑axis starts at zero.
 */
export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) {
        return [range.min, range.max];
    }
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - range.max * padding, minPadding), range.max];
};

/**
 * Calculates the width needed for the Y‑axis based on tick labels.
 */
export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string) => {
    if (!ticks.length) {
        return 40;
    }
    const maxLength = Math.max(...ticks.map(t => formatter(t).length));
    return Math.max(20, maxLength * 8 + 20);
};

/**
 * Returns the number of days between today and a start date.
 */
export const getRangeForStartDate = (startDate: string) => {
    const published = new Date(startDate);
    const today = new Date();
    const diffMs = today.getTime() - published.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 3600 * 24));
    return Math.max(diffDays, 1);
};

/**
 * Returns start and end moments for a chart range.
 */
export const getRangeDates = (range: number) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const endDate = moment().tz(tz).endOf('day');
    const startDate =
        range === -1
            ? moment().tz(tz).startOf('year')
            : moment().tz(tz).subtract(range - 1, 'days').startOf('day');
    return {startDate, endDate, timezone: tz};
};

/**
 * Converts a country code to its flag emoji.
 */
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
 * Predicate: range indicates weekly aggregation.
 */
function isWeeklyRange(range: number): boolean {
    return range >= 91 && range <= 356;
}

/**
 * Predicate: range indicates monthly aggregation.
 */
function isMonthlyRange(range: number): boolean {
    return range > 356;
}

/**
 * Aggregates chart data weekly.
 */
function aggregateWeekly<T extends {date: string}>(
    data: T[],
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T[] {
    const weekly: T[] = [];
    let currentWeek = moment(data[0].date).startOf('week');
    let weekTotal = 0;
    let weekCount = 0;
    let lastValue = 0;

    data.forEach((item, idx) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentWeek, 'week')) {
            weekTotal += Number(item[fieldName]);
            weekCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            weekly.push({
                ...data[idx - 1],
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]:
                    aggregationType === 'sum'
                        ? weekTotal
                        : aggregationType === 'avg'
                        ? weekCount > 0
                            ? weekTotal / weekCount
                            : 0
                        : lastValue,
            } as T);
            currentWeek = itemDate.startOf('week');
            weekTotal = Number(item[fieldName]);
            weekCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (idx === data.length - 1) {
            weekly.push({
                ...item,
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]:
                    aggregationType === 'sum'
                        ? weekTotal
                        : aggregationType === 'avg'
                        ? weekCount > 0
                            ? weekTotal / weekCount
                            : 0
                        : lastValue,
            } as T);
        }
    });

    return weekly;
}

/**
 * Aggregates chart data monthly.
 */
function aggregateMonthly<T extends {date: string}>(
    data: T[],
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T[] {
    const monthly: T[] = [];
    let currentMonth = moment(data[0].date).startOf('month');
    let monthTotal = 0;
    let monthCount = 0;
    let lastValue = 0;

    data.forEach((item, idx) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentMonth, 'month')) {
            monthTotal += Number(item[fieldName]);
            monthCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            monthly.push({
                ...data[idx - 1],
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]:
                    aggregationType === 'sum'
                        ? monthTotal
                        : aggregationType === 'avg'
                        ? monthCount > 0
                            ? monthTotal / monthCount
                            : 0
                        : lastValue,
            } as T);
            currentMonth = itemDate.startOf('month');
            monthTotal = Number(item[fieldName]);
            monthCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (idx === data.length - 1) {
            monthly.push({
                ...item,
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]:
                    aggregationType === 'sum'
                        ? monthTotal
                        : aggregationType === 'avg'
                        ? monthCount > 0
                            ? monthTotal / monthCount
                            : 0
                        : lastValue,
            } as T);
        }
    });

    return monthly;
}

/**
 * Sanitizes chart data based on the date range.
 *
 * @param data            Raw chart data.
 * @param range           Number of days in the range.
 * @param fieldName       Field to aggregate.
 * @param aggregationType Aggregation method.
 */
export const sanitizeChartData = <T extends {date: string}>(
    data: T[],
    range: number,
    fieldName: keyof T = 'value' as keyof T,
    aggregationType: 'sum' | 'avg' | 'exact' = 'avg'
): T[] => {
    if (isEmptyData(data)) {
        return [];
    }

    if (isWeeklyRange(range)) {
        return aggregateWeekly(data, fieldName, aggregationType);
    }

    if (isMonthlyRange(range)) {
        return aggregateMonthly(data, fieldName, aggregationType);
    }

    return data;
};

/**
 * Formats a date based on the range.
 *
 * @param date       Date string.
 * @param range      Number of days in the range.
 * @param showHours  Include hours in output.
 * @param hoursOnly  Show only hours.
 */
export const formatDisplayDateWithRange = (
    date: string,
    range: number,
    showHours = false,
    hoursOnly = false
): string => {
    if (range === 1 && hoursOnly) {
        return moment(date).format('h:mma');
    }
    if (range === 1 && showHours) {
        return moment(date).format('MMM D, h:mma');
    }
    if (range > 365) {
        return moment(date).format('MMM YYYY');
    }
    if (range >= 91) {
        return `Week of ${formatDisplayDate(date)}`;
    }
    return formatDisplayDate(date);
};

/* Member formatters
/* -------------------------------------------------------------------------- */

/**
 * Formats a member's display name.
 */
export const formatMemberName = (member: {name?: string; email?: string}) =>
    (member.name && member.name.trim()) || member.email || 'Unknown Member';

/**
 * Returns initials for a member.
 */
export const getMemberInitials = (member: {name?: string}) => {
    const name = formatMemberName(member);
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

/**
 * Generates a deterministic HSL color from a string.
 */
export const stringToHslColor = (str: string, saturation: string, lightness: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, ${saturation}%, ${lightness}%)`;
};