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

// Check if URL is an email address
const isEmailUrl = (url: string): boolean => isEmail(url);

// Check if URL is an anchor link
const isAnchorLink = (url: string): boolean => /^#/.test(url);

// Check if URL is protocol-relative
const isProtocolRelative = (url: string): boolean => /^(\/\/)/.test(url);

// Check if URL looks like a valid URL pattern
const looksLikeUrl = (url: string): boolean => /^[a-zA-Z0-9-]+:/.test(url) || /^(\/|\?)/.test(url);

// Format email URL with mailto protocol
const formatEmailUrl = (url: string): {save: string; display: string} => {
    const mailtoUrl = `mailto:${url}`;
    return {save: mailtoUrl, display: mailtoUrl};
};

// Format anchor or protocol-relative URL as-is
const formatPassthroughUrl = (url: string): {save: string; display: string} => ({save: url, display: url});

// Add https protocol if missing
const ensureProtocol = (url: string): string => {
    if (!url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
};

// Parse and validate URL
const parseUrlSafely = (url: string, baseUrl?: string): URL | null => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};

// Check if parsed URL is relative to base URL
const isRelativeToBase = (parsedUrl: URL, parsedBaseUrl: URL): boolean => {
    if (!parsedUrl.pathname) {
        return false;
    }
    
    const isPathRelative = parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0;
    const isPathWithTrailingSlash = `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
    
    return isPathRelative || isPathWithTrailingSlash;
};

// Convert absolute URL to relative URL
const makeUrlRelative = (url: string, parsedBaseUrl: URL): string => {
    let result = url;
    result = result.replace(/^[a-zA-Z0-9-]+:/, '');
    result = result.replace(/^\/\//, '');
    result = result.replace(parsedBaseUrl.host, '');
    result = result.replace(parsedBaseUrl.pathname, '');
    
    if (!result.match(/^\//)) {
        result = `/${result}`;
    }
    
    return result;
};

// Add trailing slash if needed
const ensureTrailingSlash = (url: string): string => {
    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        return `${url}/`;
    }
    return url;
};

// Helper to display a URL from a base URL
const displayFromBase = (url: string, baseUrl: string): string => {
    let base = baseUrl;
    if (!base.endsWith('/')) {
        base += '/';
    }

    let displayUrl = url;
    if (displayUrl.startsWith('/')) {
        displayUrl = displayUrl.substring(1);
    }

    return new URL(displayUrl, base).toString();
};

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
        return formatEmailUrl(url);
    }

    if (isAnchorLink(url)) {
        return formatPassthroughUrl(url);
    }

    if (isProtocolRelative(url)) {
        return formatPassthroughUrl(url);
    }

    if (!baseUrl && !url.startsWith('http')) {
        url = ensureProtocol(url);
    }

    if (!looksLikeUrl(url)) {
        return formatPassthroughUrl(url);
    }

    const parsedUrl = parseUrlSafely(url, baseUrl);
    if (!parsedUrl) {
        return formatPassthroughUrl(url);
    }

    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    const parsedBaseUrl = new URL(baseUrl);
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;
    const isRelative = isRelativeToBase(parsedUrl, parsedBaseUrl);

    if (isOnSameHost && isRelative) {
        url = makeUrlRelative(url, parsedBaseUrl);
    }

    url = ensureTrailingSlash(url);

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Format date for stats query
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

// Parse date string into components
const parseDateString = (dateString: string, timezone?: string): {day: number; month: number; year: number; isToday: boolean; isCurrentYear: boolean} => {
    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');

    if (timezone && isISOFormat) {
        const dateMoment = moment.tz(dateString, timezone);
        const todayMoment = moment.tz(timezone);

        return {
            day: dateMoment.date(),
            month: dateMoment.month(),
            year: dateMoment.year(),
            isToday: dateMoment.isSame(todayMoment, 'day'),
            isCurrentYear: dateMoment.year() === todayMoment.year()
        };
    }

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

// Format date for UI, result is in the format of `12 Jun 2025`
// When timezone is provided, the date will be converted to that timezone before formatting
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }
    if (!dateString || dateString.length === 0 || typeof dateString !== 'string') {
        return '';
    }

    const {day, month, year, isToday, isCurrentYear} = parseDateString(dateString, timezone);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month];

    if (isToday) {
        return `${day} ${monthName}`;
    }

    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
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
const calculateTimeDifference = (timestamp: string): number => {
    const date = new Date(timestamp);
    const now = new Date();

    if (isNaN(date.getTime())) {
        return -1;
    }

    return now.getTime() - date.getTime();
};

// Format time difference into human-readable string
const formatTimeDifference = (diffMs: number): string => {
    if (diffMs < 0) {
        return 'Unknown';
    }

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
    }

    return '';
};

// Helper function to format timestamp
export const formatTimestamp = (timestamp: string) => {
    const diffMs = calculateTimeDifference(timestamp);

    if (diffMs < 0) {
        return 'Unknown';
    }

    const formattedDifference = formatTimeDifference(diffMs);
    if (formattedDifference) {
        return formattedDifference;
    }

    const date = new Date(timestamp);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

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

// Format number in thousands
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

// Format number in millions
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

// Format a fraction to percentage
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

// Format cents to Dollars
export const centsToDollars = (value: number) => {
    return Math.round(value / 100);
};

/* Chart formatters
/* -------------------------------------------------------------------------- */

// Round number to nearest multiple of 10^n
const roundToNearestMultiple = (num: number): number => {
    if (num === 0) {
        return 0;
    }

    const magnitude = Math.floor(Math.log10(num));
    const multiple = Math.pow(10, magnitude);

    return Math.round(num / multiple) * multiple;
};

// Calculates the Y-axis range with padding
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
    max = roundToNearestMultiple(max);

    return {min, max};
};

// Apply rounding to min and max values
const applyRounding = (value: number, roundTo: number, isMin: boolean): number => {
    const rounded = Math.round(value / roundTo) * roundTo;
    if (isMin) {
        return rounded > value ? Math.floor(value / roundTo) * roundTo : rounded;
    }
    return rounded < value ? Math.ceil(value / roundTo) * roundTo : rounded;
};

// Ensure visible range after rounding
const ensureVisibleRange = (min: number, max: number, padding: number, roundTo: number): {min: number; max: number} => {
    if (min === max) {
        const midPoint = (min + max) / 2;
        const smallRange = Math.max(Math.abs(midPoint) * padding, roundTo);
        return {
            min: Math.max(0, Math.floor(midPoint - smallRange)),
            max: Math.ceil(midPoint + smallRange)
        };
    }
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

    min = applyRounding(min, roundTo, true);
    max = applyRounding(max, roundTo, false);
    min = Math.max(0, min);

    const result = ensureVisibleRange(min, max, padding, roundTo);
    result.min = Math.max(0, result.min);

    return result;
};

// Unfortunately in order to force Recharts area charts to start at a certain value
// we need to use allowDataOverflow = true on the yAxis. This however clips the min
// value if it reaches 0. In order to prevent this happening we add a bit of padding
// to the min value.
export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) {
        return [range.min, range.max];
    }
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - (range.max * padding), minPadding), range.max];
};

// Calculates the width needed for the Y-axis based on the formatted tick values
export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string): number => {
    if (!ticks.length) {
        return 40;
    }

    const maxFormattedLength = Math.max(...ticks.map(tick => formatter(tick).length));
    const width = Math.max(20, maxFormattedLength * 8 + 20);
    return width;
};

// Get range for date
export const getRangeForStartDate = (startDate: string) => {
    const publishedDate = new Date(startDate);
    const today = new Date();
    const diffInTime = today.getTime() - publishedDate.getTime();
    const diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24));

    return Math.max(diffInDays, 1);
};

//Return today and startdate for charts
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

// Converts a country code to corresponding flag emoji
export function getCountryFlag(countryCode:string) {
    if (!countryCode || countryCode === null || countryCode.toUpperCase() === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ') {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397)
    );
}

// Aggregate data for a time period
const aggregateDataForPeriod = <T extends {date: string}>(items: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact', lastValue: number): number => {
    const total = items.reduce((sum, item) => sum + Number(item[fieldName]), 0);
    
    if (aggregationType === 'sum') {
        return total;
    } else if (aggregationType === 'avg') {
        return items.length > 0 ? total / items.length : 0;
    }
    return lastValue;
};

// Group data by week
const groupDataByWeek = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
    const weeklyData: T[] = [];
    let currentWeek = moment(data[0].date).startOf('week');
    let weekItems: T[] = [];

    data.forEach((item, index) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentWeek, 'week')) {
            weekItems.push(item);
        } else {
            const aggregatedValue = aggregateDataForPeriod(weekItems, fieldName, aggregationType, Number(weekItems[weekItems.length - 1][fieldName]));
            weeklyData.push({
                ...weekItems[weekItems.length - 1],
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: aggregatedValue
            } as T);

            currentWeek = itemDate.startOf('week');
            weekItems = [item];
        }

        if (index === data.length - 1) {
            const aggregatedValue = aggregateDataForPeriod(weekItems, fieldName, aggregationType, Number(weekItems[weekItems.length - 1][fieldName]));
            weeklyData.push({
                ...item,
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: aggregatedValue
            } as T);
        }
    });

    return weeklyData;
};

// Group data by month
const groupDataByMonth = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
    const monthlyData: T[] = [];
    let currentMonth = moment(data[0].date).startOf('month');
    let monthItems: T[] = [];

    data.forEach((item, index) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentMonth, 'month')) {
            monthItems.push(item);
        } else {
            const aggregatedValue = aggregateDataForPeriod(monthItems, fieldName, aggregationType, Number(monthItems[monthItems.length - 1][fieldName]));
            monthlyData.push({
                ...monthItems[monthItems.length - 1],
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]: aggregatedValue
            } as T);

            currentMonth = itemDate.startOf('month');
            monthItems = [item];
        }

        if (index === data.length - 1) {
            const aggregatedValue = aggregateDataForPeriod(monthItems, fieldName, aggregationType, Number(monthItems[monthItems.length - 1][fieldName]));
            monthlyData.push({
                ...item,
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]: aggregatedValue
            } as T);
        }
    });

    return monthlyData;
};

/**
 * Sanitizes chart data based on the date range
 * - For ranges between 91-356 days: shows weekly changes
 * - For ranges above 356 days: shows monthly changes
 * - For other ranges: keeps data as is
 * @param data The chart data to sanitize
 * @param range The date range in days
 * @param fieldName The name of the field to use for calculations
 * @param aggregationType The type of aggregation to use: 'sum', 'avg', or 'exact'
 */
export const sanitizeChartData = <T extends {date: string}>(data: T[], range: number, fieldName: keyof T = 'value' as keyof T, aggregationType: 'sum' | 'avg' | 'exact' = 'avg'): T[] => {
    if (!data.length) {
        return [];
    }

    if (range >= 91 && range <= 356) {
        return groupDataByWeek(data, fieldName, aggregationType);
    } else if (range > 356) {
        return groupDataByMonth(data, fieldName, aggregationType);
    }

    return data;
};

/**
 * Formats a date based on the range
 * - For ranges above 365 days: shows month and year (e.g. "Apr 2025")
 * - For ranges above 91 days: shows "Week of [date]"
 * - For other ranges: uses the default formatDisplayDate
 */
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
 * Member formatters
 */

// Helper function to format member names with fallback to email
export const formatMemberName = (member: {name?: string; email?: string}) => {
    return (member.name && member.name.trim()) || member.email || 'Unknown Member';
};

// Helper function to get member initials
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