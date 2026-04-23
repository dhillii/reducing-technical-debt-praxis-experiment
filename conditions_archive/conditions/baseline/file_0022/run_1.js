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

export const isValidDomain = (value: string) => {
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(value);
};

/* Data formatters
/* -------------------------------------------------------------------------- */

export const kebabToPascalCase = (str: string): string => {
    const processed = str
        .replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

const handleNullableUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }
    return null;
};

const handleEmptyUrl = (value: string, baseUrl?: string) => {
    if (!value) {
        if (baseUrl) {
            return {save: '/', display: baseUrl};
        }
        return {save: '', display: ''};
    }
    return null;
};

const handleSpecialUrlFormats = (url: string) => {
    if (isEmail(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }
    if (url.match(/^#/)) {
        return {save: url, display: url};
    }
    if (url.match(/^(\/\/)/)) {
        return {save: url, display: url};
    }
    return null;
};

const normalizeUrl = (url: string, baseUrl?: string) => {
    if (!baseUrl && !url.startsWith('http')) {
        return `https://${url}`;
    }
    return url;
};

const validateUrlFormat = (url: string) => {
    return url.match(/^[a-zA-Z0-9-]+:/) || url.match(/^(\/|\?)/);
};

const parseAndValidateUrl = (url: string, baseUrl?: string) => {
    try {
        return new URL(url, baseUrl);
    } catch {
        return null;
    }
};

const buildRelativeUrl = (parsedUrl: URL, parsedBaseUrl: URL, url: string) => {
    const isRelativeToBasePath = parsedUrl.pathname && parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0;
    const isTrailingSlashMatch = `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;

    if (!isOnSameHost || (!isRelativeToBasePath && !isTrailingSlashMatch)) {
        return null;
    }

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

const addTrailingSlash = (url: string) => {
    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        return `${url}/`;
    }
    return url;
};

export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    const nullableResult = handleNullableUrl(value, baseUrl, nullable);
    if (nullableResult) return nullableResult;

    let url = value.trim();

    const emptyResult = handleEmptyUrl(url, baseUrl);
    if (emptyResult) return emptyResult;

    const specialResult = handleSpecialUrlFormats(url);
    if (specialResult) return specialResult;

    url = normalizeUrl(url, baseUrl);

    if (!validateUrlFormat(url)) {
        return {save: url, display: url};
    }

    const parsedUrl = parseAndValidateUrl(url, baseUrl);
    if (!parsedUrl) {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        return {save: parsedUrl.toString(), display: parsedUrl.toString()};
    }

    const parsedBaseUrl = new URL(baseUrl);
    const relativeUrl = buildRelativeUrl(parsedUrl, parsedBaseUrl, url);

    if (relativeUrl) {
        url = addTrailingSlash(relativeUrl);
        return {save: url, display: displayFromBase(url, baseUrl)};
    }

    url = addTrailingSlash(url);
    return {save: url, display: displayFromBase(url, baseUrl)};
};

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

export const formatQueryDate = (date: Moment) => {
    return date.format('YYYY-MM-DD');
};

const parseDateString = (dateString: string) => {
    if (dateString instanceof Date) {
        return dateString.toISOString();
    }
    if (!dateString || dateString.length === 0 || typeof dateString !== 'string') {
        return null;
    }
    return dateString;
};

const extractDateComponents = (dateString: string, timezone?: string) => {
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

const formatDateOutput = (day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month];

    if (isToday) {
        return `${day} ${monthName}`;
    }

    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    const parsed = parseDateString(dateString);
    if (!parsed) return '';

    const components = extractDateComponents(parsed, timezone);
    return formatDateOutput(components.day, components.month, components.year, components.isToday, components.isCurrentYear);
};

export const formatDisplayTime = (dateString: string, timezone: string): string => (
    moment(dateString).tz(timezone).format('h:mma')
);

const getTimeDifference = (date: Date, now: Date) => {
    const diffMs = now.getTime() - date.getTime();
    return {
        diffMs,
        diffMins: Math.floor(diffMs / (1000 * 60)),
        diffHours: Math.floor(diffMs / (1000 * 60 * 60)),
        diffDays: Math.floor(diffMs / (1000 * 60 * 60 * 24))
    };
};

const formatTimestampByDifference = (date: Date, diffMins: number, diffHours: number, diffDays: number) => {
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
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: diffDays > 365 ? 'numeric' : undefined
    });
};

export const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (isNaN(date.getTime())) {
        return 'Unknown';
    }

    const {diffMs, diffMins, diffHours, diffDays} = getTimeDifference(date, now);

    if (diffMs < 0) {
        return 'Just now';
    }

    return formatTimestampByDifference(date, diffMins, diffHours, diffDays);
};

export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

const abbreviateThousands = (num: number) => {
    const roundTo = num < 100000 ? 100 : 1000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000;

    if (abbreviated === 1000) {
        return '1M';
    }

    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}k`;
};

const abbreviateMillions = (num: number) => {
    const roundTo = 100000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1000000;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}M`;
};

export function abbreviateNumber(number: number) {
    const num = Number(number);

    if (num < 1000) {
        return formatNumber(num);
    }

    if (num < 1000000) {
        return abbreviateThousands(num);
    }

    return abbreviateMillions(num);
}

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

export const centsToDollars = (value: number) => {
    return Math.round(value / 100);
};

/* Chart formatters
/* -------------------------------------------------------------------------- */

const roundToNearestMultiple = (num: number): number => {
    if (num === 0) {
        return 0;
    }

    const magnitude = Math.floor(Math.log10(num));
    const multiple = Math.pow(10, magnitude);

    return Math.round(num / multiple) * multiple;
};

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

const adjustRangeForRounding = (min: number, max: number, roundTo: number) => {
    const roundedMax = Math.round(max / roundTo) * roundTo;
    const adjustedMax = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    const roundedMin = Math.round(min / roundTo) * roundTo;
    const adjustedMin = roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin;

    return {min: Math.max(0, adjustedMin), max: adjustedMax};
};

const ensureVisibleRange = (min: number, max: number, padding: number, roundTo: number) => {
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

    let {min: adjustedMin, max: adjustedMax} = adjustRangeForRounding(min, max, roundTo);
    const {min: finalMin, max: finalMax} = ensureVisibleRange(adjustedMin, adjustedMax, padding, roundTo);

    return {min: Math.max(0, finalMin), max: finalMax};
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
    const startDate = range === -1
        ? moment().tz(timezone).startOf('year')
        : moment().tz(timezone).subtract(range - 1, 'days').startOf('day');

    return {startDate, endDate, timezone};
};

const isNullCountryCode = (countryCode: string) => {
    return !countryCode || countryCode === null || countryCode.toUpperCase() === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ';
};

export function getCountryFlag(countryCode: string) {
    if (isNullCountryCode(countryCode)) {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

const aggregateValue = (total: number, count: number, lastValue: number, aggregationType: 'sum' | 'avg' | 'exact') => {
    if (aggregationType === 'sum') return total;
    if (aggregationType === 'avg') return count > 0 ? total / count : 0;
    return lastValue;
};

const processWeeklyData = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
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
                [fieldName]: aggregateValue(weekTotal, weekCount, lastValue, aggregationType)
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
                [fieldName]: aggregateValue(weekTotal, weekCount, lastValue, aggregationType)
            } as T);
        }
    });

    return weeklyData;
};

const processMonthlyData = <T extends {date: string}>(data: T[], fieldName: keyof T, aggregationType: 'sum' | 'avg' | 'exact'): T[] => {
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
                [fieldName]: aggregateValue(monthTotal, monthCount, lastValue, aggregationType)
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
                [fieldName]: aggregateValue(monthTotal, monthCount, lastValue, aggregationType)
            } as T);
        }
    });

    return monthlyData;
};

export const sanitizeChartData = <T extends {date: string}>(data: T[], range: number, fieldName: keyof T = 'value' as keyof T, aggregationType: 'sum' | 'avg' | 'exact' = 'avg'): T[] => {
    if (!data.length) {
        return [];
    }

    if (range >= 91 && range <= 356) {
        return processWeeklyData(data, fieldName, aggregationType);
    } else if (range > 356) {
        return processMonthlyData(data, fieldName, aggregationType);
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

export const formatMemberName = (member: {name?: string; email?: string}) => {
    return (member.name && member.name.trim()) || member.email || 'Unknown Member';
};

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