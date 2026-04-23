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

// Helper to format a URL
export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (shouldReturnNullValue(value, nullable)) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (shouldReturnEmptyUrl(url, baseUrl)) {
        return {save: baseUrl ? '/' : '', display: baseUrl || ''};
    }

    if (shouldReturnMailtoUrl(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }

    if (shouldReturnAnchorLink(url)) {
        return {save: url, display: url};
    }

    if (shouldReturnProtocolRelative(url)) {
        return {save: url, display: url};
    }

    if (shouldAddHttps(url, baseUrl)) {
        url = `https://${url}`;
    }

    if (shouldReturnAsIs(url)) {
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
    const isRelativeToBasePath = isRelativeToBase(parsedUrl, parsedBaseUrl);
    const isOnSameHost = isSameHost(parsedUrl, parsedBaseUrl);

    if (isOnSameHost && isRelativeToBasePath) {
        url = makeRelativeUrl(url, parsedBaseUrl);
    }

    if (shouldAddTrailingSlash(url)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

// Helper to check if value should return null
const shouldReturnNullValue = (value: string, nullable?: boolean): boolean => {
    return nullable && !value;
};

// Helper to check if URL should return empty
const shouldReturnEmptyUrl = (url: string, baseUrl?: string): boolean => {
    return !url;
};

// Helper to check if URL should return mailto
const shouldReturnMailtoUrl = (url: string): boolean => {
    return isEmail(url);
};

// Helper to check if URL should return anchor link
const shouldReturnAnchorLink = (url: string): boolean => {
    return url.match(/^#/);
};

// Helper to check if URL should return protocol relative
const shouldReturnProtocolRelative = (url: string): boolean => {
    return url.match(/^(\/\/)/);
};

// Helper to check if URL should add https
const shouldAddHttps = (url: string, baseUrl?: string): boolean => {
    return !baseUrl && !url.startsWith('http');
};

// Helper to check if URL should return as is
const shouldReturnAsIs = (url: string): boolean => {
    return !url.match(/^[a-zA-Z0-9-]+:/) && !url.match(/^(\/|\?)/);
};

// Helper to check if URL should add trailing slash
const shouldAddTrailingSlash = (url: string): boolean => {
    return !url.match(/\/$/) && !url.match(/[.#?]/);
};

// Helper to check if URL is relative to base
const isRelativeToBase = (parsedUrl: URL, parsedBaseUrl: URL): boolean => {
    if (!parsedUrl.pathname) {
        return false;
    }
    if (parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) !== 0) {
        return false;
    }
    if (`${parsedUrl.pathname}/` === parsedBaseUrl.pathname) {
        return true;
    }
    return true;
};

// Helper to check if URLs are on same host
const isSameHost = (parsedUrl: URL, parsedBaseUrl: URL): boolean => {
    return parsedUrl.host === parsedBaseUrl.host;
};

// Helper to make URL relative
const makeRelativeUrl = (url: string, parsedBaseUrl: URL): string => {
    url = url.replace(/^[a-zA-Z0-9-]+:/, '');
    url = url.replace(/^\/\//, '');
    url = url.replace(parsedBaseUrl.host, '');
    url = url.replace(parsedBaseUrl.pathname, '');

    if (!url.match(/^\//)) {
        url = `/${url}`;
    }
    return url;
};

// Helper to display URL from base
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
export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

// Format date for UI, result is in the format of `12 Jun 2025`
// When timezone is provided, the date will be converted to that timezone before formatting
export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (shouldConvertDateString(dateString)) {
        dateString = dateString.toISOString();
    }

    if (shouldReturnEmptyDateString(dateString)) {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');

    const dateComponents = getDateComponents(dateString, timezone, isISOFormat, hasTime);
    const monthName = getMonthName(dateComponents.month);

    if (isToday(dateComponents)) {
        return `${dateComponents.day} ${monthName}`;
    }

    return isCurrentYear(dateComponents) ? `${dateComponents.day} ${monthName}` : `${dateComponents.day} ${monthName} ${dateComponents.year}`;
};

// Helper to check if date string needs conversion
const shouldConvertDateString = (dateString: string): dateString is Date => {
    return dateString instanceof Date;
};

// Helper to check if date string should return empty
const shouldReturnEmptyDateString = (dateString: string): boolean => {
    return !dateString || dateString.length === 0 || typeof dateString !== 'string';
};

// Helper to get date components
const getDateComponents = (dateString: string, timezone?: string, isISOFormat: boolean, hasTime: boolean): {
    day: number;
    month: number;
    year: number;
    isToday: boolean;
    isCurrentYear: boolean;
} => {
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

// Helper to get month name
const getMonthName = (month: number): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month];
};

// Helper to check if date is today
const isToday = (components: {day: number; month: number; year: number; isToday: boolean}): boolean => {
    return components.isToday;
};

// Helper to check if date is current year
const isCurrentYear = (components: {day: number; month: number; year: number; isCurrentYear: boolean}): boolean => {
    return components.isCurrentYear;
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

// Helper function to format timestamp
export const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (shouldReturnUnknown(date)) {
        return 'Unknown';
    }

    const diffMs = now.getTime() - date.getTime();

    if (shouldReturnJustNow(diffMs)) {
        return 'Just now';
    }

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (shouldReturnJustNowByMinutes(diffMins)) {
        return 'Just now';
    }

    if (shouldReturnMinutesAgo(diffMins)) {
        return `${diffMins} min ago`;
    }

    if (shouldReturnHoursAgo(diffHours)) {
        return `${diffHours} hr ago`;
    }

    if (shouldReturnYesterday(diffDays)) {
        return 'Yesterday';
    }

    if (shouldReturnDaysAgo(diffDays)) {
        return `${diffDays} days ago`;
    }

    return formatFullDate(date);
};

// Helper to check if date is invalid
const shouldReturnUnknown = (date: Date): boolean => {
    return isNaN(date.getTime());
};

// Helper to check if should return just now
const shouldReturnJustNow = (diffMs: number): boolean => {
    return diffMs < 0;
};

// Helper to check if should return just now by minutes
const shouldReturnJustNowByMinutes = (diffMins: number): boolean => {
    return diffMins < 1;
};

// Helper to check if should return minutes ago
const shouldReturnMinutesAgo = (diffMins: number): boolean => {
    return diffMins < 60;
};

// Helper to check if should return hours ago
const shouldReturnHoursAgo = (diffHours: number): boolean => {
    return diffHours < 24;
};

// Helper to check if should return yesterday
const shouldReturnYesterday = (diffDays: number): boolean => {
    return diffDays === 1;
};

// Helper to check if should return days ago
const shouldReturnDaysAgo = (diffDays: number): boolean => {
    return diffDays < 7;
};

// Helper to format full date
const formatFullDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getTime() > new Date().getTime() - 365 * 24 * 60 * 60 * 1000 ? undefined : 'numeric'
    });
};

// Add thousands indicator to numbers
export const formatNumber = (value: number): string => {
    if (shouldReturnZero(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

// Helper to check if value should return zero
const shouldReturnZero = (value: number): boolean => {
    return isNaN(value) || !isFinite(value);
};

// Abbreviate numbers
export function abbreviateNumber(number: number) {
    const num = Number(number);

    if (shouldReturnFormattedNumber(num)) {
        return formatNumber(num);
    }

    if (shouldReturnThousands(num)) {
        return formatThousands(num);
    }

    return formatMillions(num);
};

// Helper to check if should return formatted number
const shouldReturnFormattedNumber = (num: number): boolean => {
    return num < 1000;
};

// Helper to format thousands
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

// Helper to format millions
const formatMillions = (num: number): string => {
    const roundTo = 100000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000000;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}M`;
};

// Format time duration
export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (shouldReturnSeconds(remainingSeconds)) {
        return `${remainingSeconds}s`;
    }

    if (shouldReturnMinutes(minutes, remainingSeconds)) {
        return `${minutes}m ${remainingSeconds}s`;
    }

    return `${hours}h ${minutes}m ${remainingSeconds}s`;
};

// Helper to check if should return seconds
const shouldReturnSeconds = (remainingSeconds: number): boolean => {
    return remainingSeconds > 0 && minutes === 0 && hours === 0;
};

// Helper to check if should return minutes
const shouldReturnMinutes = (minutes: number, remainingSeconds: number): boolean => {
    return minutes > 0 && hours === 0;
};

// Format a fraction to percentage
export const formatPercentage = (value: number) => {
    const percentage = value * 100;

    if (shouldReturnZeroPercentage(percentage)) {
        return '0%';
    }

    if (shouldReturnTwoDecimalPercentage(percentage)) {
        return `${percentage.toFixed(2)}%`;
    }

    if (shouldReturnOneDecimalPercentage(percentage)) {
        return `${percentage.toFixed(1)}%`;
    }

    return formatRoundedPercentage(percentage);
};

// Helper to check if should return zero percentage
const shouldReturnZeroPercentage = (percentage: number): boolean => {
    return percentage === 0;
};

// Helper to check if should return two decimal percentage
const shouldReturnTwoDecimalPercentage = (percentage: number): boolean => {
    return percentage < 0.1;
};

// Helper to check if should return one decimal percentage
const shouldReturnOneDecimalPercentage = (percentage: number): boolean => {
    return percentage < 1;
};

// Helper to format rounded percentage
const formatRoundedPercentage = (percentage: number): string => {
    const rounded = Math.round(percentage);
    return `${new Intl.NumberFormat('en-US').format(rounded)}%`;
};

// Format cents to Dollars
export const centsToDollars = (value: number) => {
    return Math.round(value / 100);
};

/* Chart formatters
/* -------------------------------------------------------------------------- */

// Calculates the Y-axis range with padding
export const getYRangeWithLargePadding = (data: { value: number }[]): {min: number; max: number} => {
    if (shouldReturnDefaultRange(data)) {
        return {min: 0, max: 1};
    }

    const values = data.map(d => Number(d.value));
    const min = Math.min(...values);
    const max = Math.max(...values);

    const range = calculateRangeWithPadding(min, max);
    const roundedRange = roundRangeToNearestMultiple(range);

    return {min: roundedRange.min, max: roundedRange.max};
};

// Helper to check if should return default range
const shouldReturnDefaultRange = (data: { value: number }[]): boolean => {
    return !data.length;
};

// Helper to calculate range with padding
const calculateRangeWithPadding = (min: number, max: number): {min: number; max: number} => {
    const magnitude = Math.floor(Math.log10(Math.max(max, 1)));
    const padding = Math.pow(10, magnitude);

    min = Math.max(0, min - padding);
    max = max + padding;

    return {min, max};
};

// Helper to round range to nearest multiple
const roundRangeToNearestMultiple = (range: {min: number; max: number}): {min: number; max: number} => {
    const roundToNearestMultiple = (num: number): number => {
        if (num === 0) {
            return 0;
        }

        const magnitude = Math.floor(Math.log10(num));
        const multiple = Math.pow(10, magnitude);

        return Math.round(num / multiple) * multiple;
    };

    return {
        min: roundToNearestMultiple(range.min),
        max: roundToNearestMultiple(range.max)
    };
};

export const getYRange = (data: { value: number }[]): {min: number; max: number} => {
    if (shouldReturnDefaultRange(data)) {
        return {min: 0, max: 1};
    }

    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);

    if (shouldReturnDefaultRangeForEqualValues(min, max)) {
        return {min: Math.max(0, min - 1), max: max + 1};
    }

    const range = calculateRangeWithPercentagePadding(min, max);
    const roundedRange = roundRangeToNearestMultipleForRange(range);

    if (shouldReturnDefaultRangeForRoundedRange(roundedRange)) {
        return calculateSmallRangeForEqualValues(roundedRange);
    }

    return {min: Math.max(0, roundedRange.min), max: roundedRange.max};
};

// Helper to check if should return default range for equal values
const shouldReturnDefaultRangeForEqualValues = (min: number, max: number): boolean => {
    return min === max;
};

// Helper to calculate range with percentage padding
const calculateRangeWithPercentagePadding = (min: number, max: number): {min: number; max: number} => {
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

    return {min, max};
};

// Helper to round range to nearest multiple for range
const roundRangeToNearestMultipleForRange = (range: {min: number; max: number}): {min: number; max: number} => {
    const roundToNearestMultiple = (num: number): number => {
        if (num === 0) {
            return 0;
        }

        const magnitude = Math.floor(Math.log10(num));
        const multiple = Math.pow(10, magnitude);

        return Math.round(num / multiple) * multiple;
    };

    return {
        min: roundToNearestMultiple(range.min),
        max: roundToNearestMultiple(range.max)
    };
};

// Helper to check if should return default range for rounded range
const shouldReturnDefaultRangeForRoundedRange = (range: {min: number; max: number}): boolean => {
    return range.min === range.max;
};

// Helper to calculate small range for equal values
const calculateSmallRangeForEqualValues = (range: {min: number; max: number}): {min: number; max: number} => {
    const midPoint = (range.min + range.max) / 2;
    const padding = 0.02;
    const smallRange = Math.max(Math.abs(midPoint) * padding, 10);

    return {
        min: Math.max(0, Math.floor(midPoint - smallRange)),
        max: Math.ceil(midPoint + smallRange)
    };
};

// Unfortunately in order to force Recharts area charts to start at a certain value
// we need to use allowDataOverflow = true on the yAxis. This however clips the min
// value if it reaches 0. In order to prevent this happening we add a bit of padding
// to the min value.
export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (shouldReturnOriginalRange(range)) {
        return [range.min, range.max];
    }
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - (range.max * padding), minPadding), range.max];
};

// Helper to check if should return original range
const shouldReturnOriginalRange = (range: {min: number; max: number}): boolean => {
    return range.min !== 0;
};

// Calculates the width needed for the Y-axis based on the formatted tick values
export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string): number => {
    if (shouldReturnDefaultWidth(ticks)) {
        return 40;
    }

    const maxFormattedLength = Math.max(...ticks.map(tick => formatter(tick).length));
    const width = Math.max(20, maxFormattedLength * 8 + 20);
    return width;
};

// Helper to check if should return default width
const shouldReturnDefaultWidth = (ticks: number[]): boolean => {
    return !ticks.length;
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

    if (shouldReturnYearToDate(startDate, range)) {
        startDate = moment().tz(timezone).startOf('year');
    } else {
        startDate = moment().tz(timezone).subtract(range - 1, 'days').startOf('day');
    }

    return {startDate, endDate, timezone};
};

// Helper to check if should return year to date
const shouldReturnYearToDate = (startDate: moment.Moment | undefined, range: number): boolean => {
    return range === -1;
};

// Converts a country code to corresponding flag emoji
export function getCountryFlag(countryCode: string) {
    if (shouldReturnNullFlag(countryCode)) {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
};

// Helper to check if should return null flag
const shouldReturnNullFlag = (countryCode: string): boolean => {
    return !countryCode || countryCode === null || countryCode.toUpperCase() === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ';
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
    if (shouldReturnEmptyData(data)) {
        return [];
    }

    if (shouldReturnWeeklyData(range)) {
        return aggregateByWeek(data, fieldName, aggregationType);
    }

    if (shouldReturnMonthlyData(range)) {
        return aggregateByMonth(data, fieldName, aggregationType);
    }

    return data;
};

// Helper to check if should return empty data
const shouldReturnEmptyData = (data: T[]): boolean => {
    return !data.length;
};

// Helper to check if should return weekly data
const shouldReturnWeeklyData = (range: number): boolean => {
    return range >= 91 && range <= 356;
};

// Helper to check if should return monthly data
const shouldReturnMonthlyData = (range: number): boolean => {
    return range > 356;
};

// Helper to aggregate by week
const aggregateByWeek = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
    const weeklyData: T[] = [];
    let currentWeek = moment(data[0].date).startOf('week');
    let weekTotal = 0;
    let weekCount = 0;
    let lastValue = 0;

    data.forEach((item, index) => {
        const itemDate = moment(item.date);
        if (isSameWeek(itemDate, currentWeek)) {
            weekTotal += Number(item[fieldName]);
            weekCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            weeklyData.push(createWeeklyDataItem(data[index - 1], currentWeek, weekTotal, weekCount, lastValue, aggregationType, fieldName));

            currentWeek = itemDate.startOf('week');
            weekTotal = Number(item[fieldName]);
            weekCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (index === data.length - 1) {
            weeklyData.push(createWeeklyDataItem(item, currentWeek, weekTotal, weekCount, lastValue, aggregationType, fieldName));
        }
    });

    return weeklyData;
};

// Helper to check if dates are in same week
const isSameWeek = (itemDate: moment.Moment, currentWeek: moment.Moment): boolean => {
    return itemDate.isSame(currentWeek, 'week');
};

// Helper to create weekly data item
const createWeeklyDataItem = <T extends {date: string}>(item: T, currentWeek: moment.Moment, weekTotal: number, weekCount: number, lastValue: number, aggregationType: 'sum' | 'avg' | 'exact', fieldName: keyof T): T => {
    const value = calculateAggregatedValue(weekTotal, weekCount, lastValue, aggregationType);
    return {
        ...item,
        date: currentWeek.format('YYYY-MM-DD'),
        [fieldName]: value
    } as T;
};

// Helper to calculate aggregated value
const calculateAggregatedValue = (weekTotal: number, weekCount: number, lastValue: number, aggregationType: 'sum' | 'avg' | 'exact'): number => {
    if (aggregationType === 'sum') {
        return weekTotal;
    }
    if (aggregationType === 'avg') {
        return weekCount > 0 ? weekTotal / weekCount : 0;
    }
    return lastValue;
};

// Helper to aggregate by month
const aggregateByMonth = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
    const monthlyData: T[] = [];
    let currentMonth = moment(data[0].date).startOf('month');
    let monthTotal = 0;
    let monthCount = 0;
    let lastValue = 0;

    data.forEach((item, index) => {
        const itemDate = moment(item.date);
        if (isSameMonth(itemDate, currentMonth)) {
            monthTotal += Number(item[fieldName]);
            monthCount += 1;
            lastValue = Number(item[fieldName]);
        } else {
            monthlyData.push(createMonthlyDataItem(data[index - 1], currentMonth, monthTotal, monthCount, lastValue, aggregationType, fieldName));

            currentMonth = itemDate.startOf('month');
            monthTotal = Number(item[fieldName]);
            monthCount = 1;
            lastValue = Number(item[fieldName]);
        }

        if (index === data.length - 1) {
            monthlyData.push(createMonthlyDataItem(item, currentMonth, monthTotal, monthCount, lastValue, aggregationType, fieldName));
        }
    });

    return monthlyData;
};

// Helper to check if dates are in same month
const isSameMonth = (itemDate: moment.Moment, currentMonth: moment.Moment): boolean => {
    return itemDate.isSame(currentMonth, 'month');
};

// Helper to create monthly data item
const createMonthlyDataItem = <T extends {date: string}>(item: T, currentMonth: moment.Moment, monthTotal: number, monthCount: number, lastValue: number, aggregationType: 'sum' | 'avg' | 'exact', fieldName: keyof T): T => {
    const value = calculateAggregatedValue(monthTotal, monthCount, lastValue, aggregationType);
    return {
        ...item,
        date: currentMonth.format('YYYY-MM-DD'),
        [fieldName]: value
    } as T;
};

/**
 * Formats a date based on the range
 * - For ranges above 365 days: shows month and year (e.g. "Apr 2025")
 * - For ranges above 91 days: shows "Week of [date]"
 * - For other ranges: uses the default formatDisplayDate
 */
export const formatDisplayDateWithRange = (date: string, range: number, showHours: boolean = false, hoursOnly: boolean = false): string => {
    if (shouldReturnHourFormat(date, range, hoursOnly)) {
        return moment(date).format('h:mma');
    }

    if (shouldReturnDateTimeFormat(date, range, showHours)) {
        return moment(date).format('MMM D, h:mma');
    }

    if (shouldReturnMonthYearFormat(range)) {
        return moment(date).format('MMM YYYY');
    }

    if (shouldReturnWeekFormat(range)) {
        return `Week of ${formatDisplayDate(date)}`;
    }

    return formatDisplayDate(date);
};

// Helper to check if should return hour format
const shouldReturnHourFormat = (date: string, range: number, hoursOnly: boolean): boolean => {
    return range === 1 && hoursOnly;
};

// Helper to check if should return datetime format
const shouldReturnDateTimeFormat = (date: string, range: number, showHours: boolean): boolean => {
    return range === 1 && showHours;
};

// Helper to check if should return month year format
const shouldReturnMonthYearFormat = (range: number): boolean => {
    return range > 365;
};

// Helper to check if should return week format
const shouldReturnWeekFormat = (range: number): boolean => {
    return range >= 91;
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

    if (shouldReturnLastInitial(words)) {
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }

    return name.substring(0, 2).toUpperCase();
};

// Helper to check if should return last initial
const shouldReturnLastInitial = (words: string[]): boolean => {
    return words.length >= 2;
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