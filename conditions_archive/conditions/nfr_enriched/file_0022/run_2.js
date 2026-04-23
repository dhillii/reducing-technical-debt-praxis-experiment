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

// Helper to display a URL from a base URL
const displayFromBase = (url: string, baseUrl: string) => {
    // Ensure base url has a trailing slash
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }

    // Remove leading slash from url
    if (url.startsWith('/')) {
        url = url.substring(1);
    }

    return new URL(url, baseUrl).toString();
};

// Check if URL is an email address
const isEmailUrl = (url: string): boolean => isEmail(url);

// Check if URL is an anchor link
const isAnchorLink = (url: string): boolean => /^#/.test(url);

// Check if URL is protocol-relative
const isProtocolRelative = (url: string): boolean => /^(\/\/)/.test(url);

// Check if URL looks like a valid URL pattern
const looksLikeUrl = (url: string): boolean => /^[a-zA-Z0-9-]+:/.test(url) || /^(\/|\?)/.test(url);

// Handle email URL formatting
const formatEmailUrl = (url: string): {save: string; display: string} => ({
    save: `mailto:${url}`,
    display: `mailto:${url}`
});

// Handle anchor link formatting
const formatAnchorLink = (url: string): {save: string; display: string} => ({
    save: url,
    display: url
});

// Handle protocol-relative URL formatting
const formatProtocolRelativeUrl = (url: string): {save: string; display: string} => ({
    save: url,
    display: url
});

// Handle empty URL with base URL
const formatEmptyUrlWithBase = (baseUrl: string): {save: string; display: string} => ({
    save: '/',
    display: baseUrl
});

// Handle empty URL without base URL
const formatEmptyUrl = (): {save: string; display: string} => ({
    save: '',
    display: ''
});

// Add https protocol if missing
const ensureProtocol = (url: string): string => {
    if (!url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
};

// Parse and validate URL
const parseUrl = (url: string, baseUrl?: string): URL | null => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};

// Check if URL is relative to base path
const isRelativeToBasePath = (parsedUrl: URL, parsedBaseUrl: URL): boolean => {
    if (!parsedUrl.pathname) {
        return false;
    }
    if (parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0) {
        return true;
    }
    // Check if path is only missing a trailing slash
    return `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
};

// Check if URL is on same host
const isOnSameHost = (parsedUrl: URL, parsedBaseUrl: URL): boolean => parsedUrl.host === parsedBaseUrl.host;

// Convert absolute URL to relative
const makeUrlRelative = (url: string, parsedBaseUrl: URL): string => {
    let result = url.replace(/^[a-zA-Z0-9-]+:/, '');
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

// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (!url) {
        return baseUrl ? formatEmptyUrlWithBase(baseUrl) : formatEmptyUrl();
    }

    if (isEmailUrl(url)) {
        return formatEmailUrl(url);
    }

    if (isAnchorLink(url)) {
        return formatAnchorLink(url);
    }

    if (isProtocolRelative(url)) {
        return formatProtocolRelativeUrl(url);
    }

    if (!baseUrl) {
        url = ensureProtocol(url);
    }

    if (!looksLikeUrl(url)) {
        return {save: url, display: url};
    }

    const parsedUrl = parseUrl(url, baseUrl);
    if (!parsedUrl) {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    const parsedBaseUrl = new URL(baseUrl);
    const onSameHost = isOnSameHost(parsedUrl, parsedBaseUrl);
    const relativeToBasePath = isRelativeToBasePath(parsedUrl, parsedBaseUrl);

    if (onSameHost && relativeToBasePath) {
        url = makeUrlRelative(url, parsedBaseUrl);
    }

    url = ensureTrailingSlash(url);

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Format date for stats query
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

// Extract date components from ISO format string with timezone
const extractDateComponentsWithTimezone = (dateString: string, timezone: string): {day: number; month: number; year: number; isToday: boolean; isCurrentYear: boolean} => {
    const dateMoment = moment.tz(dateString, timezone);
    const todayMoment = moment.tz(timezone);

    return {
        day: dateMoment.date(),
        month: dateMoment.month(),
        year: dateMoment.year(),
        isToday: dateMoment.isSame(todayMoment, 'day'),
        isCurrentYear: year === todayMoment.year()
    };
};

// Extract date components from localized datetime string
const extractDateComponentsLocalized = (dateString: string): {day: number; month: number; year: number; isToday: boolean; isCurrentYear: boolean} => {
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

// Extract date components from UTC date string
const extractDateComponentsUtc = (dateString: string): {day: number; month: number; year: number; isToday: boolean; isCurrentYear: boolean} => {
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

// Validate and normalize date string input
const normalizeDateString = (dateString: unknown): string => {
    if (dateString instanceof Date) {
        return dateString.toISOString();
    }
    if (!dateString || typeof dateString !== 'string' || dateString.length === 0) {
        return '';
    }
    return dateString;
};

// Format date for UI, result is in the format of `12 Jun 2025`
// When timezone is provided, the date will be converted to that timezone before formatting
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    const normalized = normalizeDateString(dateString);
    if (!normalized) {
        return '';
    }

    const hasTime = normalized.includes(':');
    const isISOFormat = normalized.includes('T') || normalized.includes('Z');

    let day, month, year, isToday, isCurrentYear;

    if (timezone && isISOFormat) {
        const components = extractDateComponentsWithTimezone(normalized, timezone);
        day = components.day;
        month = components.month;
        year = components.year;
        isToday = components.isToday;
        isCurrentYear = components.isCurrentYear;
    } else if (hasTime && !isISOFormat) {
        const components = extractDateComponentsLocalized(normalized);
        day = components.day;
        month = components.month;
        year = components.year;
        isToday = components.isToday;
        isCurrentYear = components.isCurrentYear;
    } else {
        const components = extractDateComponentsUtc(normalized);
        day = components.day;
        month = components.month;
        year = components.year;
        isToday = components.isToday;
        isCurrentYear = components.isCurrentYear;
    }

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
        return NaN;
    }

    return now.getTime() - date.getTime();
};

// Format timestamp based on time difference
const formatTimestampByDifference = (diffMs: number, date: Date): string => {
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

// Helper function to format timestamp
export const formatTimestamp = (timestamp: string) => {
    const diffMs = calculateTimeDifference(timestamp);

    if (isNaN(diffMs)) {
        return 'Unknown';
    }

    return formatTimestampByDifference(diffMs, new Date(timestamp));
};

// Add thousands indicator to numbers
export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

// Round number to nearest multiple of roundTo
const roundToMultiple = (num: number, roundTo: number): number => {
    return Math.round(num / roundTo) * roundTo;
};

// Format thousands abbreviation
const formatThousandsAbbreviation = (num: number): string => {
    const roundTo = num < 100000 ? 100 : 1000;
    const rounded = roundToMultiple(num, roundTo);
    const abbreviated = rounded / 1000;

    if (abbreviated === 1000) {
        return '1M';
    }

    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}k`;
};

// Format millions abbreviation
const formatMillionsAbbreviation = (num: number): string => {
    const roundTo = 100000;
    const rounded = roundToMultiple(num, roundTo);
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
        return formatThousandsAbbreviation(num);
    }

    return formatMillionsAbbreviation(num);
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
const roundToNearestMagnitude = (num: number): number => {
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

    min = roundToNearestMagnitude(min);
    max = roundToNearestMagnitude(max);

    return {min, max};
};

// Apply percentage-based padding to range
const applyPercentagePadding = (min: number, max: number): {min: number; max: number} => {
    const padding = 0.02;
    min = Math.max(0, min - (min * padding));
    max = max + (max * padding);
    return {min, max};
};

// Calculate rounding precision based on range
const calculateRoundingPrecision = (range: number): number => {
    const rangeMagnitude = Math.floor(Math.log10(range));
    return Math.pow(10, rangeMagnitude);
};

// Round min and max values appropriately
const roundMinMax = (min: number, max: number, roundTo: number): {min: number; max: number} => {
    const roundedMax = Math.round(max / roundTo) * roundTo;
    max = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    const roundedMin = Math.round(min / roundTo) * roundTo;
    min = roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin;
    min = Math.max(0, min);

    return {min, max};
};

// Ensure visible range after rounding
const ensureVisibleRange = (min: number, max: number, padding: number, roundTo: number): {min: number; max: number} => {
    if (min === max) {
        const midPoint = (min + max) / 2;
        const smallRange = Math.max(Math.abs(midPoint) * padding, roundTo);
        min = Math.max(0, Math.floor(midPoint - smallRange));
        max = Math.ceil(midPoint + smallRange);
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
    ({min, max} = applyPercentagePadding(min, max));

    const range = max - min;
    const roundTo = calculateRoundingPrecision(range);

    ({min, max} = roundMinMax(min, max, roundTo));
    ({min, max} = ensureVisibleRange(min, max, padding, roundTo));

    min = Math.max(0, min);

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

// Converts a country code to corresponding flag emoji
export function getCountryFlag(countryCode:string) {
    if (!countryCode || countryCode === null || countryCode.toUpperCase() === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ') {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397)
    );
}

// Aggregate values for a period
const aggregateValues = <T extends {date: string}>(values: number[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact', lastValue: number): number => {
    if (aggregationType === 'sum') {
        return values.reduce((a, b) => a + b, 0);
    } else if (aggregationType === 'avg') {
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    }
    return lastValue;
};

// Process weekly aggregation
const aggregateByWeek = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
    const weeklyData: T[] = [];
    let currentWeek = moment(data[0].date).startOf('week');
    let weekValues: number[] = [];
    let lastValue = 0;

    data.forEach((item, index) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentWeek, 'week')) {
            weekValues.push(Number(item[fieldName]));
            lastValue = Number(item[fieldName]);
        } else {
            const aggregated = aggregateValues(weekValues, fieldName, aggregationType, lastValue);
            weeklyData.push({
                ...data[index - 1],
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: aggregated
            } as T);

            currentWeek = itemDate.startOf('week');
            weekValues = [Number(item[fieldName])];
            lastValue = Number(item[fieldName]);
        }

        if (index === data.length - 1) {
            const aggregated = aggregateValues(weekValues, fieldName, aggregationType, lastValue);
            weeklyData.push({
                ...item,
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: aggregated
            } as T);
        }
    });

    return weeklyData;
};

// Process monthly aggregation
const aggregateByMonth = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
    const monthlyData: T[] = [];
    let currentMonth = moment(data[0].date).startOf('month');
    let monthValues: number[] = [];
    let lastValue = 0;

    data.forEach((item, index) => {
        const itemDate = moment(item.date);
        if (itemDate.isSame(currentMonth, 'month')) {
            monthValues.push(Number(item[fieldName]));
            lastValue = Number(item[fieldName]);
        } else {
            const aggregated = aggregateValues(monthValues, fieldName, aggregationType, lastValue);
            monthlyData.push({
                ...data[index - 1],
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]: aggregated
            } as T);

            currentMonth = itemDate.startOf('month');
            monthValues = [Number(item[fieldName])];
            lastValue = Number(item[fieldName]);
        }

        if (index === data.length - 1) {
            const aggregated = aggregateValues(monthValues, fieldName, aggregationType, lastValue);
            monthlyData.push({
                ...item,
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]: aggregated
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
        return aggregateByWeek(data, fieldName, aggregationType);
    } else if (range > 356) {
        return aggregateByMonth(data, fieldName, aggregationType);
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
```