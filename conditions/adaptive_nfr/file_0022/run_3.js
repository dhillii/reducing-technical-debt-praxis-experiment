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

/** @internal Check if URL is an email address */
const isEmailUrl = (url: string): boolean => isEmail(url);

/** @internal Check if URL is an anchor link */
const isAnchorLink = (url: string): boolean => /^#/.test(url);

/** @internal Check if URL is protocol-relative */
const isProtocolRelative = (url: string): boolean => /^(\/\/)/.test(url);

/** @internal Check if URL looks like a valid URL pattern */
const looksLikeUrl = (url: string): boolean => /^[a-zA-Z0-9-]+:/.test(url) || /^(\/|\?)/.test(url);

/** @internal Check if URL needs protocol prefix */
const needsProtocol = (url: string, baseUrl?: string): boolean => !baseUrl && !url.startsWith('http');

/** @internal Check if parsed URL is relative to base path */
const isRelativeToBasePath = (parsedUrl: URL, parsedBaseUrl: URL): boolean => {
    if (!parsedUrl.pathname) return false;
    return parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0 || 
           `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
};

/** @internal Check if URLs are on same host */
const isOnSameHost = (parsedUrl: URL, parsedBaseUrl: URL): boolean => parsedUrl.host === parsedBaseUrl.host;

/** @internal Check if URL needs trailing slash */
const needsTrailingSlash = (url: string): boolean => !url.match(/\/$/) && !url.match(/[.#?]/);

/** @internal Extract relative URL from absolute URL */
const extractRelativeUrl = (url: string, parsedBaseUrl: URL): string => {
    let result = url.replace(/^[a-zA-Z0-9-]+:/, '');
    result = result.replace(/^\/\//, '');
    result = result.replace(parsedBaseUrl.host, '');
    result = result.replace(parsedBaseUrl.pathname, '');
    
    if (!result.match(/^\//)) {
        result = `/${result}`;
    }
    return result;
};

/** @internal Handle email URL format */
const formatEmailUrl = (url: string): {save: string; display: string} => {
    return {save: `mailto:${url}`, display: `mailto:${url}`};
};

/** @internal Handle anchor link format */
const formatAnchorLink = (url: string): {save: string; display: string} => {
    return {save: url, display: url};
};

/** @internal Handle protocol-relative URL format */
const formatProtocolRelativeUrl = (url: string): {save: string; display: string} => {
    return {save: url, display: url};
};

/** @internal Handle empty URL with base URL */
const formatEmptyUrlWithBase = (baseUrl: string): {save: string; display: string} => {
    return {save: '/', display: baseUrl};
};

/** @internal Handle empty URL without base URL */
const formatEmptyUrl = (): {save: string; display: string} => {
    return {save: '', display: ''};
};

/** @internal Handle nullable empty URL */
const formatNullableUrl = (): {save: null; display: string} => {
    return {save: null, display: ''};
};

/** @internal Handle invalid URL format */
const formatInvalidUrl = (url: string): {save: string; display: string} => {
    return {save: url, display: url};
};

// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return formatNullableUrl();
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

    if (needsProtocol(url, baseUrl)) {
        url = `https://${url}`;
    }

    if (!looksLikeUrl(url)) {
        return formatInvalidUrl(url);
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url, baseUrl);
    } catch {
        return formatInvalidUrl(url);
    }

    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    const parsedBaseUrl = new URL(baseUrl);
    const onSameHost = isOnSameHost(parsedUrl, parsedBaseUrl);
    const relativeToBase = isRelativeToBasePath(parsedUrl, parsedBaseUrl);

    if (onSameHost && relativeToBase) {
        url = extractRelativeUrl(url, parsedBaseUrl);
    }

    if (needsTrailingSlash(url)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Helper to display a URL from a base URL
const displayFromBase = (url: string, baseUrl: string) => {
    let base = baseUrl;
    if (!base.endsWith('/')) {
        base += '/';
    }

    let path = url;
    if (path.startsWith('/')) {
        path = path.substring(1);
    }

    return new URL(path, base).toString();
};

// Format date for stats query
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

/** @internal Extract date components from timezone-aware moment */
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

/** @internal Extract date components from Date object with time consideration */
const extractDateComponentsFromDate = (dateString: string, hasTime: boolean): {day: number; month: number; year: number; isToday: boolean; isCurrentYear: boolean} => {
    const date = new Date(dateString);
    const today = new Date();

    if (hasTime) {
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

/** @internal Validate and normalize date string input */
const normalizeDateString = (dateString: unknown): string => {
    if (dateString instanceof Date) {
        return dateString.toISOString();
    }
    if (!dateString || typeof dateString !== 'string' || dateString.length === 0) {
        return '';
    }
    return dateString;
};

/** @internal Check if date string has time component */
const hasTimeComponent = (dateString: string): boolean => dateString.includes(':');

/** @internal Check if date string is in ISO format */
const isISOFormatDate = (dateString: string): boolean => dateString.includes('T') || dateString.includes('Z');

/** @internal Format date display based on today and year flags */
const formatDateDisplay = (day: number, monthName: string, year: number, isToday: boolean, isCurrentYear: boolean): string => {
    if (isToday) {
        return `${day} ${monthName}`;
    }
    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

// Format date for UI, result is in the format of `12 Jun 2025`
// When timezone is provided, the date will be converted to that timezone before formatting
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    const normalized = normalizeDateString(dateString);
    if (!normalized) {
        return '';
    }

    const hasTime = hasTimeComponent(normalized);
    const isISO = isISOFormatDate(normalized);

    let day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean;

    if (timezone && isISO) {
        const components = extractDateComponentsWithTimezone(normalized, timezone);
        day = components.day;
        month = components.month;
        year = components.year;
        isToday = components.isToday;
        isCurrentYear = components.isCurrentYear;
    } else {
        const components = extractDateComponentsFromDate(normalized, hasTime);
        day = components.day;
        month = components.month;
        year = components.year;
        isToday = components.isToday;
        isCurrentYear = components.isCurrentYear;
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month];

    return formatDateDisplay(day, monthName, year, isToday, isCurrentYear);
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

/** @internal Check if time difference is negative (future date) */
const isFutureDate = (diffMs: number): boolean => diffMs < 0;

/** @internal Format timestamp based on time difference */
const formatTimestampByDifference = (diffMins: number, diffHours: number, diffDays: number, date: Date): string => {
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

    const diffMs = now.getTime() - date.getTime();

    if (isFutureDate(diffMs)) {
        return 'Just now';
    }

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return formatTimestampByDifference(diffMins, diffHours, diffDays, date);
};

// Add thousands indicator to numbers
export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

/** @internal Format thousands abbreviation */
const formatThousandsAbbreviation = (num: number): string => {
    const roundTo = num < 100000 ? 100 : 1000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000;

    if (abbreviated === 1000) {
        return '1M';
    }

    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}k`;
};

/** @internal Format millions abbreviation */
const formatMillionsAbbreviation = (num: number): string => {
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

/** @internal Format percentage with appropriate precision */
const formatPercentageValue = (percentage: number): string => {
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

// Format a fraction to percentage
export const formatPercentage = (value: number) => {
    const percentage = value * 100;
    return formatPercentageValue(percentage);
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

/** @internal Check if min and max are equal */
const hasEqualMinMax = (min: number, max: number): boolean => min === max;

/** @internal Adjust range when min equals max */
const adjustEqualRange = (value: number): {min: number; max: number} => {
    return {min: Math.max(0, value - 1), max: value + 1};
};

/** @internal Calculate rounded min and max values */
const calculateRoundedBounds = (min: number, max: number, roundTo: number): {min: number; max: number} => {
    const roundedMax = Math.round(max / roundTo) * roundTo;
    const adjustedMax = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    const roundedMin = Math.round(min / roundTo) * roundTo;
    const adjustedMin = roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin;

    return {min: Math.max(0, adjustedMin), max: adjustedMax};
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

    if (hasEqualMinMax(min, max)) {
        return adjustEqualRange(min);
    }

    const padding = 0.02;
    min = Math.max(0, min - (min * padding));
    max = max + (max * padding);

    const range = max - min;
    const rangeMagnitude = Math.floor(Math.log10(range));
    const roundTo = Math.pow(10, rangeMagnitude);

    let bounds = calculateRoundedBounds(min, max, roundTo);
    bounds = ensureVisibleRange(bounds.min, bounds.max, padding, roundTo);
    bounds.min = Math.max(0, bounds.min);

    return bounds;
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
    return !countryCode || countryCode === null || countryCode.toUpperCase() === 'NULL' || 
           countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ';
};

// Converts a country code to corresponding flag emoji
export function getCountryFlag(countryCode: string) {
    if (isNullCountryCode(countryCode)) {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

/** @internal Calculate aggregated value based on aggregation type */
const calculateAggregatedValue = (total: number, count: number, lastValue: number, aggregationType: 'sum' | 'avg' | 'exact'): number => {
    if (aggregationType === 'sum') {
        return total;
    }
    if (aggregationType === 'avg') {
        return count > 0 ? total / count : 0;
    }
    return lastValue;
};

/** @internal Process weekly data aggregation */
const aggregateWeeklyData = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
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
            const aggregatedValue = calculateAggregatedValue(weekTotal, weekCount, lastValue, aggregationType);
            weeklyData.push({
                ...data[index - 1],
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: aggregatedValue
            } as T);

            currentWeek = itemDate.startOf('week');
            weekTotal = Number(item[fieldName]);
            weekCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (index === data.length - 1) {
            const aggregatedValue = calculateAggregatedValue(weekTotal, weekCount, lastValue, aggregationType);
            weeklyData.push({
                ...item,
                date: currentWeek.format('YYYY-MM-DD'),
                [fieldName]: aggregatedValue
            } as T);
        }
    });

    return weeklyData;
};

/** @internal Process monthly data aggregation */
const aggregateMonthlyData = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
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
            const aggregatedValue = calculateAggregatedValue(monthTotal, monthCount, lastValue, aggregationType);
            monthlyData.push({
                ...data[index - 1],
                date: currentMonth.format('YYYY-MM-DD'),
                [fieldName]: aggregatedValue
            } as T);

            currentMonth = itemDate.startOf('month');
            monthTotal = Number(item[fieldName]);
            monthCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (index === data.length - 1) {
            const aggregatedValue = calculateAggregatedValue(monthTotal, monthCount, lastValue, aggregationType);
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
        return aggregateWeeklyData(data, fieldName, aggregationType);
    }

    if (range > 356) {
        return aggregateMonthlyData(data, fieldName, aggregationType);
    }

    return data;
};

/** @internal Check if should format with hours only */
const shouldFormatHoursOnly = (range: number, hoursOnly: boolean): boolean => range === 1 && hoursOnly;

/** @internal Check if should format with hours */
const shouldFormatWithHours = (range: number, showHours: boolean): boolean => range === 1 && showHours;

/** @internal Check if should format as month year */
const shouldFormatMonthYear = (range: number): boolean => range > 365;

/** @internal Check if should format as week */
const shouldFormatWeek = (range: number): boolean => range >= 91;

/**
 * Formats a date based on the range
 * - For ranges above 365 days: shows month and year (e.g. "Apr 2025")
 * - For ranges above 91 days: shows "Week of [date]"
 * - For other ranges: uses the default formatDisplayDate
 */
export const formatDisplayDateWithRange = (date: string, range: number, showHours: boolean = false, hoursOnly: boolean = false): string => {
    if (shouldFormatHoursOnly(range, hoursOnly)) {
        return moment(date).format('h:mma');
    }

    if (shouldFormatWithHours(range, showHours)) {
        return moment(date).format('MMM D, h:mma');
    }

    if (shouldFormatMonthYear(range)) {
        return moment(date).format('MMM YYYY');
    }

    if (shouldFormatWeek(range)) {
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