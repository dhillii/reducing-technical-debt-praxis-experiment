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

/** @internal Check if value is a nullable empty URL */
const isNullableEmpty = (value: string, nullable: boolean): boolean => nullable && !value;

/** @internal Check if value is an email address */
const isEmailAddress = (url: string): boolean => isEmail(url);

/** @internal Check if value is an anchor link */
const isAnchorLink = (url: string): boolean => /^#/.test(url);

/** @internal Check if value is protocol-relative URL */
const isProtocolRelative = (url: string): boolean => /^(\/\/)/.test(url);

/** @internal Check if value looks like a URL pattern */
const looksLikeUrl = (url: string): boolean => /^[a-zA-Z0-9-]+:/.test(url) || /^(\/|\?)/.test(url);

/** @internal Check if URL is relative to base path */
const isRelativeToBasePath = (parsedUrl: URL, parsedBaseUrl: URL): boolean => {
    if (!parsedUrl.pathname) return false;
    if (parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0) return true;
    return `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
};

/** @internal Check if URL is on same host as base */
const isOnSameHost = (parsedUrl: URL, parsedBaseUrl: URL): boolean => parsedUrl.host === parsedBaseUrl.host;

/** @internal Get aggregated value based on aggregation type */
const getAggregatedValue = (total: number, count: number, lastValue: number, aggregationType: 'sum' | 'avg' | 'exact'): number => {
    if (aggregationType === 'sum') return total;
    if (aggregationType === 'avg') return count > 0 ? total / count : 0;
    return lastValue;
};

// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (isNullableEmpty(value, nullable ?? false)) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (!url) {
        if (baseUrl) {
            return {save: '/', display: baseUrl};
        }
        return {save: '', display: ''};
    }

    if (isEmailAddress(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }

    if (isAnchorLink(url)) {
        return {save: url, display: url};
    }

    if (isProtocolRelative(url)) {
        return {save: url, display: url};
    }

    if (!baseUrl && !url.startsWith('http')) {
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

    if (!sameHost || !relativeToBase) {
        if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
            url = `${url}/`;
        }
        return {save: url, display: displayFromBase(url, baseUrl)};
    }

    url = url.replace(/^[a-zA-Z0-9-]+:/, '');
    url = url.replace(/^\/\//, '');
    url = url.replace(parsedBaseUrl.host, '');
    url = url.replace(parsedBaseUrl.pathname, '');

    if (!url.match(/^\//)) {
        url = `/${url}`;
    }

    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Helper to display a URL from a base URL
const displayFromBase = (url: string, baseUrl: string) => {
    let finalBaseUrl = baseUrl;
    if (!finalBaseUrl.endsWith('/')) {
        finalBaseUrl += '/';
    }

    let finalUrl = url;
    if (finalUrl.startsWith('/')) {
        finalUrl = finalUrl.substring(1);
    }

    return new URL(finalUrl, finalBaseUrl).toString();
};

// Format date for stats query
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

/** @internal Check if date string has time component */
const hasTimeComponent = (dateString: string): boolean => dateString.includes(':');

/** @internal Check if date string is in ISO format */
const isISOFormatDate = (dateString: string): boolean => dateString.includes('T') || dateString.includes('Z');

/** @internal Get date components using timezone-aware moment */
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

/** @internal Get date components from Date object with local methods */
const getDateComponentsLocal = (dateString: string): {day: number; month: number; year: number; isToday: boolean; isCurrentYear: boolean} => {
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

/** @internal Get date components from Date object with UTC methods */
const getDateComponentsUTC = (dateString: string): {day: number; month: number; year: number; isToday: boolean; isCurrentYear: boolean} => {
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

/** @internal Format date components to display string */
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
    if (dateString instanceof Date) {
        dateString = dateString.toISOString();
    }

    if (!dateString || dateString.length === 0 || typeof dateString !== 'string') {
        return '';
    }

    const hasTime = hasTimeComponent(dateString);
    const isISO = isISOFormatDate(dateString);

    let day, month, year, isToday, isCurrentYear;

    if (timezone && isISO) {
        const components = getDateComponentsWithTimezone(dateString, timezone);
        day = components.day;
        month = components.month;
        year = components.year;
        isToday = components.isToday;
        isCurrentYear = components.isCurrentYear;
    } else if (hasTime && !isISO) {
        const components = getDateComponentsLocal(dateString);
        day = components.day;
        month = components.month;
        year = components.year;
        isToday = components.isToday;
        isCurrentYear = components.isCurrentYear;
    } else {
        const components = getDateComponentsUTC(dateString);
        day = components.day;
        month = components.month;
        year = components.year;
        isToday = components.isToday;
        isCurrentYear = components.isCurrentYear;
    }

    return formatDateComponents(day, month, year, isToday, isCurrentYear);
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

/** @internal Check if date is invalid */
const isInvalidDate = (date: Date): boolean => isNaN(date.getTime());

/** @internal Get time difference in milliseconds */
const getTimeDiffMs = (now: Date, date: Date): number => now.getTime() - date.getTime();

/** @internal Format timestamp based on time difference */
const formatTimestampByDiff = (diffMs: number, date: Date): string => {
    if (diffMs < 0) {
        return 'Just now';
    }

    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) {
        return 'Just now';
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffMins < 60) {
        return `${diffMins} min ago`;
    }

    if (diffHours < 24) {
        return `${diffHours} hr ago`;
    }

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
        return 'Yesterday';
    }

    if (diffDays < 7) {
        return `${diffDays} days ago`;
    }

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: diffDays > 365 ? 'numeric' : undefined
    });
};

// Helper function to format timestamp
export const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (isInvalidDate(date)) {
        return 'Unknown';
    }

    const diffMs = getTimeDiffMs(now, date);
    return formatTimestampByDiff(diffMs, date);
};

// Add thousands indicator to numbers
export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

/** @internal Round number to appropriate scale */
const roundToScale = (num: number, roundTo: number): number => Math.round(num / roundTo) * roundTo;

/** @internal Format abbreviated thousands */
const formatAbbreviatedThousands = (num: number): string => {
    const roundTo = num < 100000 ? 100 : 1000;
    const rounded = roundToScale(num, roundTo);
    const abbreviated = rounded / 1000;

    if (abbreviated === 1000) {
        return '1M';
    }

    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}k`;
};

/** @internal Format abbreviated millions */
const formatAbbreviatedMillions = (num: number): string => {
    const roundTo = 100000;
    const rounded = roundToScale(num, roundTo);
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
        return formatAbbreviatedThousands(num);
    }

    return formatAbbreviatedMillions(num);
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
export const centsToDollars = (value: number) => {
    return Math.round(value / 100);
};

/* Chart formatters
/* -------------------------------------------------------------------------- */

/** @internal Round number to nearest multiple of 10^n */
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

/** @internal Apply padding to min and max values */
const applyPadding = (min: number, max: number, padding: number): {min: number; max: number} => {
    return {
        min: Math.max(0, min - (min * padding)),
        max: max + (max * padding)
    };
};

/** @internal Round min and max to appropriate precision */
const roundMinMax = (min: number, max: number, roundTo: number): {min: number; max: number} => {
    const roundedMax = Math.round(max / roundTo) * roundTo;
    const finalMax = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    const roundedMin = Math.round(min / roundTo) * roundTo;
    const finalMin = roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin;

    return {
        min: Math.max(0, finalMin),
        max: finalMax
    };
};

/** @internal Ensure visible range after rounding */
const ensureVisibleRange = (min: number, max: number, padding: number, roundTo: number): {min: number; max: number} => {
    if (min !== max) {
        return {min, max};
    }

    const midPoint = (min + max) / 2;
    const smallRange = Math.max(Math.abs(midPoint) * padding, roundTo);
    return {
        min: Math.max(0, Math.floor(midPoint - smallRange)),
        max: Math.ceil(midPoint + smallRange)
    };
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
    const padded = applyPadding(min, max, padding);
    min = padded.min;
    max = padded.max;

    const range = max - min;
    const rangeMagnitude = Math.floor(Math.log10(range));
    const roundTo = Math.pow(10, rangeMagnitude);

    const rounded = roundMinMax(min, max, roundTo);
    min = rounded.min;
    max = rounded.max;

    const visible = ensureVisibleRange(min, max, padding, roundTo);
    min = Math.max(0, visible.min);
    max = visible.max;

    return {min, max};
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

/** @internal Check if country code is null or invalid */
const isNullCountryCode = (countryCode: string): boolean => {
    if (!countryCode || countryCode === null) return true;
    const upper = countryCode.toUpperCase();
    return upper === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ';
};

// Converts a country code to corresponding flag emoji
export function getCountryFlag(countryCode: string) {
    if (isNullCountryCode(countryCode)) {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

/** @internal Process weekly aggregation for chart data */
const processWeeklyAggregation = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
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
                [fieldName]: getAggregatedValue(weekTotal, weekCount, lastValue, aggregationType)
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
                [fieldName]: getAggregatedValue(weekTotal, weekCount, lastValue, aggregationType)
            } as T);
        }
    });

    return weeklyData;
};

/** @internal Process monthly aggregation for chart data */
const processMonthlyAggregation = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
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
                [fieldName]: getAggregatedValue(monthTotal, monthCount, lastValue, aggregationType)
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
                [fieldName]: getAggregatedValue(monthTotal, monthCount, lastValue, aggregationType)
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
        return processWeeklyAggregation(data, fieldName, aggregationType);
    }

    if (range > 356) {
        return processMonthlyAggregation(data, fieldName, aggregationType);
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

export const stringToHslColor = (str: string, saturation: string, lightness: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const h = hash % 360;
    return 'hsl(' + h + ', ' + saturation + '%, ' + lightness + '%)';
};
```