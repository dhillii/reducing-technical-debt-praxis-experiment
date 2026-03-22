# Refactored Code

Here's my analysis of the complexity issues and the refactored solution:

**Key issues identified:**
1. `formatDisplayDate` has deeply nested conditionals and duplicated logic
2. `sanitizeChartData` has two nearly identical blocks (weekly/monthly) with duplicated aggregation logic
3. `abbreviateNumber` has repeated formatting patterns
4. `formatTimestamp` has a long if-else chain
5. `getCountryFlag` has redundant null checks
6. `formatUrl` is long but mostly sequential — kept intact with minor cleanup

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

export function debounce<T extends unknown[]>(
    func: (...args: T) => void,
    wait: number,
    immediate: boolean = false
): (...args: T) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null;

    return function (this: unknown, ...args: T): void {
        const callNow = immediate && !timeoutId;

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            timeoutId = null;
            if (!immediate) {
                func.apply(this, args);
            }
        }, wait);

        if (callNow) {
            func.apply(this, args);
        }
    };
}

export const isValidDomain = (value: string) =>
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w-./?%&=]*)?$/i.test(value);

/* Data formatters
/* -------------------------------------------------------------------------- */

export const kebabToPascalCase = (str: string): string => {
    const processed = str.replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase());
    return processed.charAt(0).toUpperCase() + processed.slice(1);
};

const displayFromBase = (url: string, baseUrl: string): string => {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const path = url.startsWith('/') ? url.substring(1) : url;
    return new URL(path, base).toString();
};

export const formatUrl = (value: string, baseUrl?: string, nullable?: boolean) => {
    if (nullable && !value) {
        return {save: null, display: ''};
    }

    let url = value.trim();

    if (!url) {
        return baseUrl ? {save: '/', display: baseUrl} : {save: '', display: ''};
    }

    if (isEmail(url)) {
        return {save: `mailto:${url}`, display: `mailto:${url}`};
    }

    // Passthrough cases: anchor links and protocol-relative URLs
    if (/^#/.test(url) || /^\/\//.test(url)) {
        return {save: url, display: url};
    }

    if (!baseUrl && !url.startsWith('http')) {
        url = `https://${url}`;
    }

    // If it doesn't look like a URL, leave it as-is
    if (!url.match(/^[a-zA-Z0-9-]+:/) && !url.match(/^(\/|\?)/)) {
        return {save: url, display: url};
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url, baseUrl);
    } catch {
        return {save: url, display: url};
    }

    if (!baseUrl) {
        const absolute = parsedUrl.toString();
        return {save: absolute, display: absolute};
    }

    const parsedBaseUrl = new URL(baseUrl);
    const isOnSameHost = parsedUrl.host === parsedBaseUrl.host;
    const isRelativeToBasePath =
        parsedUrl.pathname.indexOf(parsedBaseUrl.pathname) === 0 ||
        `${parsedUrl.pathname}/` === parsedBaseUrl.pathname;

    if (isOnSameHost && isRelativeToBasePath) {
        url = url
            .replace(/^[a-zA-Z0-9-]+:/, '')
            .replace(/^\/\//, '')
            .replace(parsedBaseUrl.host, '')
            .replace(parsedBaseUrl.pathname, '');

        if (!url.startsWith('/')) {
            url = `/${url}`;
        }
    }

    if (!url.match(/\/$/) && !url.match(/[.#?]/)) {
        url = `${url}/`;
    }

    return {save: url, display: displayFromBase(url, baseUrl)};
};

export const formatQueryDate = (date: Moment) => date.format('YYYY-MM-DD');

// --- formatDisplayDate helpers ---

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

interface DateParts {
    day: number;
    month: number;
    year: number;
    isToday: boolean;
    isCurrentYear: boolean;
}

const getDatePartsFromTimezone = (dateString: string, timezone: string): DateParts => {
    const dateMoment = moment.tz(dateString, timezone);
    const todayMoment = moment.tz(timezone);
    const year = dateMoment.year();
    return {
        day: dateMoment.date(),
        month: dateMoment.month(),
        year,
        isToday: dateMoment.isSame(todayMoment, 'day'),
        isCurrentYear: year === todayMoment.year()
    };
};

const getDatePartsLocal = (date: Date): DateParts => {
    const today = new Date();
    const year = date.getFullYear();
    return {
        day: date.getDate(),
        month: date.getMonth(),
        year,
        isToday: date.toDateString() === today.toDateString(),
        isCurrentYear: year === today.getFullYear()
    };
};

const getDatePartsUTC = (date: Date): DateParts => {
    const today = new Date();
    const year = date.getUTCFullYear();
    return {
        day: date.getUTCDate(),
        month: date.getUTCMonth(),
        year,
        isToday: date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10),
        isCurrentYear: year === today.getUTCFullYear()
    };
};

export const formatDisplayDate = (dateString: string, timezone?: string): string => {
    // @ts-expect-error Runtime guard for Date objects passed as strings
    if (dateString instanceof Date) {
        dateString = (dateString as Date).toISOString();
    }

    if (!dateString || typeof dateString !== 'string' || dateString.length === 0) {
        return '';
    }

    const hasTime = dateString.includes(':');
    const isISOFormat = dateString.includes('T') || dateString.includes('Z');

    let parts: DateParts;

    if (timezone && isISOFormat) {
        parts = getDatePartsFromTimezone(dateString, timezone);
    } else {
        const date = new Date(dateString);
        // Localized datetime strings (e.g. "2025-07-29 19:00:00") use local methods
        parts = (hasTime && !isISOFormat) ? getDatePartsLocal(date) : getDatePartsUTC(date);
    }

    const {day, month, year, isToday, isCurrentYear} = parts;
    const monthName = MONTHS[month];

    // Today and current year both show "D Mon"; only omit year when not current year
    if (isToday || isCurrentYear) {
        return `${day} ${monthName}`;
    }
    return `${day} ${monthName} ${year}`;
};

/**
 * Format a plain time in a given time zone.
 * @example formatDisplayTime('2020-04-20T18:09:12.345Z', 'Africa/Lagos') // '7:09pm'
 */
export const formatDisplayTime = (dateString: string, timezone: string): string =>
    moment(dateString).tz(timezone).format('h:mma');

export const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);

    if (isNaN(date.getTime())) {
        return 'Unknown';
    }

    const diffMs = Date.now() - date.getTime();

    if (diffMs < 0) {
        return 'Just now';
    }

    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMins < 1) { return 'Just now'; }
    if (diffMins < 60) { return `${diffMins} min ago`; }
    if (diffHours < 24) { return `${diffHours} hr ago`; }
    if (diffDays === 1) { return 'Yesterday'; }
    if (diffDays < 7) { return `${diffDays} days ago`; }

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: diffDays > 365 ? 'numeric' : undefined
    });
};

export const formatNumber = (value: number): string => {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    return new Intl.NumberFormat('en-US').format(Math.round(value));
};

const formatAbbreviated = (value: number, divisor: number, suffix: string): string => {
    const abbreviated = value / divisor;
    const formatted = abbreviated % 1 === 0 ? abbreviated.toString() : abbreviated.toFixed(1);
    return `${formatted}${suffix}`;
};

export function abbreviateNumber(number: number): string {
    const num = Number(number);

    if (num < 1_000) {
        return formatNumber(num);
    }

    if (num < 1_000_000) {
        const roundTo = num < 100_000 ? 100 : 1_000;
        const rounded = Math.round(num / roundTo) * roundTo;
        // Edge case: rounding 999,950+ to 1,000,000
        if (rounded === 1_000_000) {
            return '1M';
        }
        return formatAbbreviated(rounded, 1_000, 'k');
    }

    const rounded = Math.round(num / 100_000) * 100_000;
    return formatAbbreviated(rounded, 1_000_000, 'M');
}

export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) { return `${hours}h ${minutes}m ${remainingSeconds}s`; }
    if (minutes > 0) { return `${minutes}m ${remainingSeconds}s`; }
    return `${remainingSeconds}s`;
};

export const formatPercentage = (value: number): string => {
    const percentage = value * 100;

    if (percentage === 0) { return '0%'; }
    if (percentage < 0.1) { return `${percentage.toFixed(2)}%`; }
    if (percentage < 1) { return `${percentage.toFixed(1)}%`; }

    return `${new Intl.NumberFormat('en-US').format(Math.round(percentage))}%`;
};

export const centsToDollars = (value: number) => Math.round(value / 100);

/* Chart formatters
/* -------------------------------------------------------------------------- */

const roundToNearestMagnitude = (num: number): number => {
    if (num === 0) { return 0; }
    const multiple = Math.pow(10, Math.floor(Math.log10(num)));
    return Math.round(num / multiple) * multiple;
};

export const getYRangeWithLargePadding = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) { return {min: 0, max: 1}; }

    const values = data.map(d => Number(d.value));
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);

    const padding = Math.pow(10, Math.floor(Math.log10(Math.max(rawMax, 1))));

    return {
        min: roundToNearestMagnitude(Math.max(0, rawMin - padding)),
        max: roundToNearestMagnitude(rawMax + padding)
    };
};

export const getYRange = (data: {value: number}[]): {min: number; max: number} => {
    if (!data.length) { return {min: 0, max: 1}; }

    const values = data.map(d => Number(d.value));
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);

    if (rawMin === rawMax) {
        return {min: Math.max(0, rawMin - 1), max: rawMax + 1};
    }

    const PADDING = 0.02;
    let min = Math.max(0, rawMin - rawMin * PADDING);
    let max = rawMax + rawMax * PADDING;

    const roundTo = Math.pow(10, Math.floor(Math.log10(max - min)));

    const roundedMax = Math.round(max / roundTo) * roundTo;
    max = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

    const roundedMin = Math.round(min / roundTo) * roundTo;
    min = Math.max(0, roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin);

    // Ensure visible range after rounding
    if (min === max) {
        const smallRange = Math.max(Math.abs(max) * PADDING, roundTo);
        min = Math.max(0, Math.floor(max - smallRange));
        max = Math.ceil(max + smallRange);
    }

    return {min: Math.max(0, min), max};
};

export const getYRangeWithMinPadding = (range: {min: number; max: number}) => {
    if (range.min !== 0) {
        return [range.min, range.max];
    }
    return [Math.min(-(range.max * 0.005), -2), range.max];
};

export const calculateYAxisWidth = (ticks: number[], formatter: (value: number) => string): number => {
    if (!ticks.length) { return 40; }
    const maxLength = Math.max(...ticks.map(tick => formatter(tick).length));
    return Math.max(20, maxLength * 8 + 20);
};

export const getRangeForStartDate = (startDate: string): number => {
    const diffMs = Date.now() - new Date(startDate).getTime();
    return Math.max(Math.ceil(diffMs / 86_400_000), 1);
};

export const getRangeDates = (range: number) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const endDate = moment().tz(timezone).endOf('day');
    const startDate = range === -1
        ? moment().tz(timezone).startOf('year')
        : moment().tz(timezone).subtract(range - 1, 'days').startOf('day');

    return {startDate, endDate, timezone};
};

const INVALID_COUNTRY_CODES = new Set(['NULL', 'ᴺᵁᴸᴸ', 'ᴺᵁ']);

export function getCountryFlag(countryCode: string): string {
    if (!countryCode || INVALID_COUNTRY_CODES.has(countryCode.toUpperCase())) {
        return '🏳️';
    }
    return countryCode.toUpperCase().replace(/./g, char =>
        String.fromCodePoint(char.charCodeAt(0) + 127397)
    );
}

/* sanitizeChartData
/* -------------------------------------------------------------------------- */

type PeriodUnit = 'week' | 'month';

const aggregateValue = (
    total: number,
    count: number,
    lastValue: number,
    aggregationType: 'sum' | 'avg' | 'exact'
): number => {
    if (aggregationType === 'sum') { return total; }
    if (aggregationType === 'avg') { return count > 0 ? total / count : 0; }
    return lastValue;
};

const groupByPeriod = <T extends {date: string}>(
    data: T[],
    unit: PeriodUnit,
    fieldName: keyof T,
    aggregationType: 'sum' | 'avg' | 'exact'
): T[] => {
    const result: T[] = [];
    let currentPeriod = moment(data[0].date).startOf(unit);
    let total = 0;
    let count = 0;
    let lastValue = 0;

    data.forEach((item, index) => {
        const itemDate = moment(item.date);

        if (itemDate.isSame(currentPeriod, unit)) {
            total += Number(item[fieldName]);
            count += 1;
            lastValue = Number(item[fieldName]);
        } else {
            result.push({
                ...data[index - 1],
                date: currentPeriod.format('YYYY-MM-DD'),
                [fieldName]: aggregateValue(total, count, lastValue, aggregationType)
            } as T);

            currentPeriod = itemDate.clone().startOf(unit);
            total = Number(item[fieldName]);
            count = 1;
            lastValue = total;
        }

        if (index === data.length - 1) {
            result.push({
                ...item,
                date: currentPeriod.format('YYYY-MM-DD'),
                [fieldName]: aggregateValue(total, count, lastValue, aggregationType)
            } as T);
        }
    });

    return result;
};

/**
 * Sanitizes chart data based on the date range:
 * - 91–356 days → weekly aggregation
 * - >356 days   → monthly aggregation
 * - <91 days    → no change
 */
export const sanitizeChartData = <T extends {date: string}>(
    data: T[],
    range: number,
    fieldName: keyof T = 'value' as keyof T,
    aggregationType: 'sum' | 'avg' | 'exact' = 'avg'
): T[] => {
    if (!data.length) { return []; }
    if (range >= 91 && range <= 356) { return groupByPeriod(data, 'week', fieldName, aggregationType); }
    if (range > 356) { return groupByPeriod(data, 'month', fieldName, aggregationType); }
    return data;
};

/**
 * Formats a date label based on the chart range:
 * - range === 1 + hoursOnly → "h:mma"
 * - range === 1 + showHours → "MMM D, h:mma"
 * - range > 365             → "MMM YYYY"
 * - range >= 91             → "Week of D Mon"
 * - otherwise               → formatDisplayDate
 */
export const formatDisplayDateWithRange = (
    date: string,
    range: number,
    showHours: boolean = false,
    hoursOnly: boolean = false
): string => {
    if (range === 1 && hoursOnly) { return moment(date).format('h:mma'); }
    if (range === 1 && showHours) { return moment(date).format('MMM D, h:mma'); }
    if (range > 365) { return moment(date).format('MMM YYYY'); }
    if (range >= 91) { return `Week of ${formatDisplayDate(date)}`; }
    return formatDisplayDate(date);
};

/* Member formatters
/* -------------------------------------------------------------------------- */

export const formatMemberName = (member: {name?: string; email?: string}): string =>
    (member.name?.trim()) || member.email || 'Unknown Member';

export const getMemberInitials = (member: {name?: string}): string => {
    const name = formatMemberName(member);
    const words = name.split(' ');
    if (words.length >= 2) {
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

export const stringToHslColor = (str: string, saturation: string, lightness: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${hash % 360}, ${saturation}%, ${lightness}%)`;
};
```

## Summary of Changes

| Area | Change | Benefit |
|---|---|---|
| `sanitizeChartData` | Extracted `groupByPeriod` + `aggregateValue` helpers; eliminated ~40 lines of duplication | Single source of truth for aggregation logic |
| `formatDisplayDate` | Split into `getDatePartsFromTimezone`, `getDatePartsLocal`, `getDatePartsUTC`; extracted `MONTHS` constant | Each branch is independently testable; no nested conditionals |
| `abbreviateNumber` | Extracted `formatAbbreviated` helper; replaced magic numbers with `_` separators | Eliminates repeated `% 1 === 0 ? ... : toFixed(1)` pattern |
| `formatTimestamp` | Replaced `Date.now()` + named millisecond constants (`60_000`, `3_600_000`, `86_400_000`) | Clearer intent, no intermediate `now` variable |
| `getCountryFlag` | Replaced chained `||` null checks with a `Set` lookup | O(1) lookup, easy to extend |
| `getYRangeWithLargePadding` | Extracted `roundToNearestMagnitude` (shared logic) | Reusable, removes inline duplication |
| `formatDuration` | Flipped to early-return positive guards | Reads top-to-bottom naturally |
| `displayFromBase` | Simplified string manipulation | Removed two separate mutation steps |
| `getRangeForStartDate` | Used `Date.now()` and named constant | Removed intermediate variables |
| `stringToHslColor` | Used template literal | Minor readability improvement |