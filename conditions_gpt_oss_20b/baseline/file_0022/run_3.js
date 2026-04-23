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

export const isValidDomain = (value: string) => {
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(value);
};

/* Data formatters
/* -------------------------------------------------------------------------- */

export const kebabToPascalCase = (str: string): string => {
    const processed = str.replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

const isAnchorLink = (url: string) => url.startsWith('#');
const isProtocolRelative = (url: string) => url.startsWith('//');
const isAbsoluteUrl = (url: string) => /^[a-zA-Z0-9-]+:/.test(url);
const hasPathOrQuery = (url: string) => /^(\/|\?)/.test(url);

const stripBaseFromUrl = (url: string, baseUrl: string) => {
    const parsedBase = new URL(baseUrl);
    let stripped = url.replace(/^https?:\/\//, '');
    stripped = stripped.replace(parsedBase.host, '');
    stripped = stripped.replace(parsedBase.pathname, '');
    if (!stripped.startsWith('/')) stripped = '/' + stripped;
    return stripped;
};

const ensureTrailingSlash = (url: string) => {
    if (!url.endsWith('/') && !/[.#?]/.test(url)) return url + '/';
    return url;
};

export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) return {save: null, display: ''};

    let url = value.trim();
    if (!url) {
        if (baseUrl) return {save: '/', display: baseUrl};
        return {save: '', display: ''};
    }

    if (isEmail(url)) return {save: `mailto:${url}`, display: `mailto:${url}`};
    if (isAnchorLink(url) || isProtocolRelative(url)) return {save: url, display: url};

    if (!baseUrl && !url.startsWith('http')) url = `https://${url}`;

    if (!isAbsoluteUrl(url) && !hasPathOrQuery(url)) return {save: url, display: url};

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url, baseUrl);
    } catch {
        return {save: url, display: url};
    }

    if (!baseUrl) return {save: parsedUrl.toString(), display: parsedUrl.toString()};

    const parsedBase = new URL(baseUrl);
    const isRelativeToBasePath =
        parsedUrl.pathname.startsWith(parsedBase.pathname) ||
        `${parsedUrl.pathname}/` === parsedBase.pathname;

    const isOnSameHost = parsedUrl.host === parsedBase.host;

    if (isOnSameHost && isRelativeToBasePath) {
        url = stripBaseFromUrl(url, baseUrl);
    }

    url = ensureTrailingSlash(url);
    return {save: url, display: displayFromBase(url, baseUrl)};
};

const displayFromBase = (url: string, baseUrl: string) => {
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    if (url.startsWith('/')) url = url.substring(1);
    return new URL(url, baseUrl).toString();
};

export const formatQueryDate = (date: Moment) => date.format('YYYY-MM-DD');

export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    if (dateString instanceof Date) dateString = dateString.toISOString();
    if (!dateString || typeof dateString !== 'string' || dateString.length === 0) return '';

    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');

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

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[month];

    if (isToday) return `${day} ${monthName}`;
    return isCurrentYear ? `${day} ${monthName}` : `${day} ${monthName} ${year}`;
};

export const formatDisplayTime = (dateString: string, timezone: string): string =>
    moment(dateString).tz(timezone).format('h:mma');

export const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    if (isNaN(date.getTime())) return 'Unknown';
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';
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
        year: diffDays > 365 ? 'numeric' : undefined
    });
};

export const formatNumber = (value: number): string => {
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

export const formatDuration = (seconds: number): string => {
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

export const getYRangeWithLargePadding = (data: { value: number }[]): { min: number; max: number } => {
    if (!data.length) return { min: 0, max: 1 };
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
    return { min, max };
};

export const getYRange = (data: { value: number }[]): { min: number; max: number } => {
    if (!data.length) return { min: 0, max: 1 };
    const values = data.map(d => Number(d.value));
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) return { min: Math.max(0, min - 1), max: min + 1 };
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
    return { min, max };
};

export const getYRangeWithMinPadding = (range: { min: number; max: number }) => {
    if (range.min !== 0) return [range.min, range.max];
    const padding = 0.005;
    const minPadding = -2;
    return [Math.min(range.min - range.max * padding, minPadding), range.max];
};

export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string): number => {
    if (!ticks.length) return 40;
    const maxFormattedLength = Math.max(...ticks.map(tick => formatter(tick).length));
    return Math.max(20, maxFormattedLength * 8 + 20);
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
    if (range === -1) startDate = moment().tz(timezone).startOf('year');
    else startDate = moment().tz(timezone).subtract(range - 1, 'days').startOf('day');
    return { startDate, endDate, timezone };
};

export function getCountryFlag(countryCode: string) {
    if (!countryCode || countryCode === null || countryCode.toUpperCase() === 'NULL' || countryCode === 'ᴺᵁᴸᴸ' || countryCode === 'ᴺᵁ') {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
}

export const sanitizeChartData = <T extends { date: string }>(
    data: T[],
    range: number,
    fieldName: keyof T = 'value' as keyof T,
    aggregationType: 'sum' | 'avg' | 'exact' = 'avg'
): T[] => {
    if (!data.length) return [];
    const aggregate = (total: number, count: number) => {
        if (aggregationType === 'sum') return total;
        if (aggregationType === 'avg') return count > 0 ? total / count : 0;
        return total;
    };
    const process = (current: T[], periodStart: moment.Moment, periodEnd: moment.Moment) => {
        let total = 0;
        let count = 0;
        let lastValue = 0;
        current.forEach(item => {
            const val = Number(item[fieldName]);
            total += val;
            count += 1;
            lastValue = val;
        });
        const aggregated = aggregate(total, count);
        return {
            ...current[current.length - 1],
            date: periodStart.format('YYYY-MM-DD'),
            [fieldName]: aggregated
        } as T;
    };
    if (range >= 91 && range <= 356) {
        const weeklyData: T[] = [];
        let currentWeek = moment(data[0].date).startOf('week');
        let weekItems: T[] = [];
        data.forEach((item, index) => {
            const itemDate = moment(item.date);
            if (itemDate.isSame(currentWeek, 'week')) {
                weekItems.push(item);
            } else {
                weeklyData.push(process(weekItems, currentWeek, itemDate));
                currentWeek = itemDate.startOf('week');
                weekItems = [item];
            }
            if (index === data.length - 1) weeklyData.push(process(weekItems, currentWeek, itemDate));
        });
        return weeklyData;
    }
    if (range > 356) {
        const monthlyData: T[] = [];
        let currentMonth = moment(data[0].date).startOf('month');
        let monthItems: T[] = [];
        data.forEach((item, index) => {
            const itemDate = moment(item.date);
            if (itemDate.isSame(currentMonth, 'month')) {
                monthItems.push(item);
            } else {
                monthlyData.push(process(monthItems, currentMonth, itemDate));
                currentMonth = itemDate.startOf('month');
                monthItems = [item];
            }
            if (index === data.length - 1) monthlyData.push(process(monthItems, currentMonth, itemDate));
        });
        return monthlyData;
    }
    return data;
};

export const formatDisplayDateWithRange = (
    date: string,
    range: number,
    showHours: boolean = false,
    hoursOnly: boolean = false
): string => {
    if (range === 1 && hoursOnly) return moment(date).format('h:mma');
    if (range === 1 && showHours) return moment(date).format('MMM D, h:mma');
    if (range > 365) return moment(date).format('MMM YYYY');
    if (range >= 91) return `Week of ${formatDisplayDate(date)}`;
    return formatDisplayDate(date);
};

export const formatMemberName = (member: { name?: string; email?: string }) =>
    (member.name && member.name.trim()) || member.email || 'Unknown Member';

export const getMemberInitials = (member: { name?: string }) => {
    const name = formatMemberName(member);
    const words = name.split(' ');
    if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
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