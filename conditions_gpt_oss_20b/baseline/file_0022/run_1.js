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
            if (!immediate) func.apply(this, args);
        };

        const callNow = immediate && !timeoutId;

        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(later, wait);

        if (callNow) func.apply(this, args);
    };
}

export const isValidDomain = (value: string) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(value);

/* Data formatters
/* -------------------------------------------------------------------------- */

export const kebabToPascalCase = (str: string): string => {
    const processed = str.replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

const isAnchorLink = (url: string) => url.startsWith('#');
const isProtocolRelative = (url: string) => url.startsWith('//');
const isEmailUrl = (url: string) => isEmail(url);
const isAbsoluteUrl = (url: string) => /^[a-zA-Z0-9-]+:/.test(url);
const hasLeadingSlashOrQuery = (url: string) => url.startsWith('/') || url.startsWith('?');

const ensureTrailingSlash = (url: string) => (url.endsWith('/') || url.includes(/[.#?]/)) ? url : `${url}/`;

const adjustRelativeUrl = (parsedUrl: URL, baseUrl: URL) => {
    let url = parsedUrl.toString();
    url = url.replace(/^https?:\/\//, '');
    url = url.replace(baseUrl.host, '');
    url = url.replace(baseUrl.pathname, '');
    if (!url.startsWith('/')) url = `/${url}`;
    return url;
};

export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) return {save: null, display: ''};

    let url = value.trim();
    if (!url) {
        if (baseUrl) return {save: '/', display: baseUrl};
        return {save: '', display: ''};
    }

    if (isEmailUrl(url)) return {save: `mailto:${url}`, display: `mailto:${url}`};

    if (isAnchorLink(url) || isProtocolRelative(url)) return {save: url, display: url};

    if (!baseUrl && !url.startsWith('http')) url = `https://${url}`;

    if (!isAbsoluteUrl(url) && !hasLeadingSlashOrQuery(url)) return {save: url, display: url};

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url, baseUrl);
    } catch {
        return {save: url, display: url};
    }

    if (!baseUrl) return {save: parsedUrl.toString(), display: parsedUrl.toString()};

    const base = new URL(baseUrl);
    const isRelative = parsedUrl.pathname.startsWith(base.pathname) || `${parsedUrl.pathname}/` === base.pathname;
    const isSameHost = parsedUrl.host === base.host;

    let saveUrl = url;
    if (isSameHost && isRelative) {
        saveUrl = adjustRelativeUrl(parsedUrl, base);
    }

    saveUrl = ensureTrailingSlash(saveUrl);
    return {save: saveUrl, display: displayFromBase(saveUrl, baseUrl)};
};

const displayFromBase = (url: string, baseUrl: string) => {
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    if (url.startsWith('/')) url = url.substring(1);
    return new URL(url, baseUrl).toString();
};

export const formatQueryDate = (date: Moment) => date.format('YYYY-MM-DD');

export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (dateString instanceof Date) dateString = dateString.toISOString();
    if (!dateString || typeof dateString !== 'string') return '';

    const hasTime = dateString.includes(':');
    const isISO = dateString.includes('T') || dateString.includes('Z');

    let day: number, month: number, year: number, isToday: boolean, isCurrentYear: boolean;

    if (timezone && isISO) {
        const dateMoment = moment.tz(dateString, timezone);
        const todayMoment = moment.tz(timezone);
        day = dateMoment.date(); month = dateMoment.month(); year = dateMoment.year();
        isToday = dateMoment.isSame(todayMoment, 'day');
        isCurrentYear = year === todayMoment.year();
    } else {
        const date = new Date(dateString);
        const today = new Date();
        if (hasTime && !isISO) {
            day = date.getDate(); month = date.getMonth(); year = date.getFullYear();
            isToday = date.toDateString() === today.toDateString();
            isCurrentYear = year === today.getFullYear();
        } else {
            day = date.getUTCDate(); month = date.getUTCMonth(); year = date.getUTCFullYear();
            isToday = date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
            isCurrentYear = year === today.getUTCFullYear();
        }
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month];

    if (isToday) return `${day} ${monthName}`;
    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

export const formatDisplayTime = (dateString: string, timezone: string) => moment(dateString).tz(timezone).format('h:mma');

export const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    if (isNaN(date.getTime())) return 'Unknown';
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: diffDays > 365 ? 'numeric' : undefined
    });
};

export const formatNumber = (value: number) => {
    if (isNaN(value) || !isFinite(value)) return '0';
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

export function abbreviateNumber(number: number) {
    const num = Number(number);
    if (num < 1000) return formatNumber(num);
    if (num < 1_000_000) {
        const roundTo = num < 100_000 ? 100 : 1000;
        const rounded = Math.round(num / roundTo) * roundTo;
        const abbreviated = rounded / 1000;
        if (abbreviated === 1000) return '1M';
        const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
        return `${formatted}k`;
    }
    const roundTo = 100_000;
    const rounded = Math.round(num / roundTo) * roundTo;
    const abbreviated = rounded / 1_000_000;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}M`;
}

export const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    if (hours <= 0) {
        if (minutes <= 0) return `${remainingSeconds}s`;
        return `${minutes}m ${remainingSeconds}s`;
    }
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
};

export const formatPercentage = (value: number) => {
    const percentage = value * 100;
    if (percentage === 0) return '0%';
    if (percentage < 0.1) return `${percentage.toFixed(2)}%`;
    if (percentage < 1) return `${percentage.toFixed(1)}%`;
    const rounded = Math.round(percentage);
    return `${new Intl.NumberFormat('en-US').format(rounded)}%`;
};

export const centsToDollars = (value: number) => Math.round(value / 100);

/* Chart formatters
/* -------------------------------------------------------------------------- */

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
    if (min === max) return {min: Math.max(0, min - 1), max: min + 1};
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
        const midPoint = (min + max) / 2;
        const smallRange = Math.max(Math.abs(midPoint) * padding, roundTo);
        min = Math.max(0, Math.floor(midPoint - smallRange));
        max = Math.ceil(midPoint + smallRange);
    }
    min = Math.max(0, min);
    return {min, max};
};

export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) return [range.min, range.max];
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - range.max * padding, minPadding), range.max];
};

export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string) => {
    if (!ticks.length) return 40;
    const maxFormattedLength = Math.max(...ticks.map(tick => formatter(tick).length));
    return Math.max(20, maxFormattedLength * 8 + 20);
};

export const getRangeForStartDate = (startDate: string) => {
    const publishedDate = new Date(startDate);
    const today = new Date();
    const diffInDays = Math.ceil((today.getTime() - publishedDate.getTime()) / (86400000));
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

export function getCountryFlag(countryCode: string) {
    if (!countryCode || countryCode === null || countryCode.toUpperCase() === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ') {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

export const sanitizeChartData = <T extends {date: string}>(data: T[], range: number, fieldName: keyof T = 'value' as keyof T, aggregationType: 'sum' | 'avg' | 'exact' = 'avg'): T[] => {
    if (!data.length) return [];
    const aggregate = (total: number, count: number) => aggregationType === 'sum' ? total : aggregationType === 'avg' ? (count > 0 ? total / count : 0) : total;
    const pushData = (arr: T[], item: T, date: string, total: number, count: number, lastValue: number) => {
        arr.push({...item, date, [fieldName]: aggregate(total, count)} as T);
    };
    if (range >= 91 && range <= 356) {
        const weeklyData: T[] = [];
        let currentPeriod = moment(data[0].date).startOf('week');
        let total = 0, count = 0, lastValue = 0;
        data.forEach((item, idx) => {
            const itemDate = moment(item.date);
            if (itemDate.isSame(currentPeriod, 'week')) {
                total += Number(item[fieldName]); count++; lastValue = Number(item[fieldName]);
            } else {
                pushData(weeklyData, data[idx - 1], currentPeriod.format('YYYY-MM-DD'), total, count, lastValue);
                currentPeriod = itemDate.startOf('week');
                total = Number(item[fieldName]); count = 1; lastValue = Number(item[fieldName]);
            }
            if (idx === data.length - 1) pushData(weeklyData, item, currentPeriod.format('YYYY-MM-DD'), total, count, lastValue);
        });
        return weeklyData;
    }
    if (range > 356) {
        const monthlyData: T[] = [];
        let currentPeriod = moment(data[0].date).startOf('month');
        let total = 0, count = 0, lastValue = 0;
        data.forEach((item, idx) => {
            const itemDate = moment(item.date);
            if (itemDate.isSame(currentPeriod, 'month')) {
                total += Number(item[fieldName]); count++; lastValue = Number(item[fieldName]);
            } else {
                pushData(monthlyData, data[idx - 1], currentPeriod.format('YYYY-MM-DD'), total, count, lastValue);
                currentPeriod = itemDate.startOf('month');
                total = Number(item[fieldName]); count = 1; lastValue = Number(item[fieldName]);
            }
            if (idx === data.length - 1) pushData(monthlyData, item, currentPeriod.format('YYYY-MM-DD'), total, count, lastValue);
        });
        return monthlyData;
    }
    return data;
};

export const formatDisplayDateWithRange = (date: string, range: number, showHours: boolean = false, hoursOnly: boolean = false): string => {
    if (range === 1 && hoursOnly) return moment(date).format('h:mma');
    if (range === 1 && showHours) return moment(date).format('MMM D, h:mma');
    if (range > 365) return moment(date).format('MMM YYYY');
    if (range >= 91) return `Week of ${formatDisplayDate(date)}`;
    return formatDisplayDate(date);
};

export const formatMemberName = (member: {name?: string; email?: string}) => (member.name && member.name.trim()) || member.email || 'Unknown Member';

export const getMemberInitials = (member: {name?: string}) => {
    const name = formatMemberName(member);
    const words = name.split(' ');
    if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
};

export const stringToHslColor = (str: string, saturation: string, lightness: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const h = hash % 360;
    return `hsl(${h}, ${saturation}%, ${lightness}%)`;
};