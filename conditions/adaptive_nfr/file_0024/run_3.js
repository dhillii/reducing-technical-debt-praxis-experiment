```typescript
import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Determines the direction of change based on numeric value
 */
const getChangeDirection = (change: number): DiffDirection => {
    if (change > 0) return 'up';
    if (change < 0) return 'down';
    return 'same';
};

/**
 * Calculates percentage change and direction for a metric
 */
const calculateMetricChange = (current: number, previous: number): {percentage: string; direction: DiffDirection} => {
    if (previous <= 0) {
        return {percentage: '0%', direction: 'same'};
    }
    const change = ((current - previous) / previous) * 100;
    return {
        percentage: formatPercentage(change / 100),
        direction: getChangeDirection(change)
    };
};

/**
 * Calculates member count changes from first to latest data point
 */
const calculateMemberChanges = (memberData: MemberStatusItem[], currentTotals: MemberStatusItem) => {
    const changes = {
        total: {percentage: '0%', direction: 'same' as DiffDirection},
        free: {percentage: '0%', direction: 'same' as DiffDirection},
        paid: {percentage: '0%', direction: 'same' as DiffDirection}
    };

    if (memberData.length <= 1) {
        return changes;
    }

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const firstTotal = first.free + first.paid + first.comped;

    changes.total = calculateMetricChange(totalMembers, firstTotal);
    changes.free = calculateMetricChange(latest.free, first.free);

    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;
    changes.paid = calculateMetricChange(latestPaidTotal, firstPaidTotal);

    return changes;
};

/**
 * Determines if the date range is from the beginning of a period (e.g., YTD)
 */
const isFromBeginningRange = (dateFrom: string): boolean => {
    const dateFromMoment = moment(dateFrom);
    return dateFromMoment.isSame(moment().startOf('year'), 'day') || dateFromMoment.year() < moment().year();
};

/**
 * Finds the first actual MRR data point within the selected date range
 */
const findFirstMrrPoint = (mrrData: MrrHistoryItem[], dateFrom: string): MrrHistoryItem | undefined => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    return mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
};

/**
 * Determines the starting MRR value for change calculation
 */
const getStartingMrr = (firstActualPoint: MrrHistoryItem | undefined, dateFrom: string, totalMrr: number): number => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const isBeginningRange = isFromBeginningRange(dateFrom);

    if (!firstActualPoint) {
        return isBeginningRange ? 0 : totalMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return isBeginningRange ? 0 : totalMrr;
};

/**
 * Calculates MRR change from first to latest data point
 */
const calculateMrrChange = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): {percentage: string; direction: DiffDirection} => {
    if (mrrData.length <= 1) {
        return {percentage: '0%', direction: 'same'};
    }

    const firstActualPoint = findFirstMrrPoint(mrrData, dateFrom);
    const firstMrr = getStartingMrr(firstActualPoint, dateFrom, totalMrr);

    if (firstMrr < 0) {
        return {percentage: '0%', direction: 'same'};
    }

    const mrrChange = firstMrr === 0
        ? (totalMrr > 0 ? 100 : 0)
        : ((totalMrr - firstMrr) / firstMrr) * 100;

    return {
        percentage: formatPercentage(mrrChange / 100),
        direction: getChangeDirection(mrrChange)
    };
};

/**
 * Returns empty totals structure
 */
const getEmptyTotals = () => ({
    totalMembers: 0,
    freeMembers: 0,
    paidMembers: 0,
    mrr: 0,
    percentChanges: {
        total: '0%',
        free: '0%',
        paid: '0%',
        mrr: '0%'
    },
    directions: {
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection,
        mrr: 'same' as DiffDirection
    }
});

// Calculate totals from member data
const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
    if (!memberData.length) {
        return getEmptyTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const memberChanges = calculateMemberChanges(memberData, currentTotals);
    const mrrChange = calculateMrrChange(mrrData, dateFrom, totalMrr);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges: {
            total: memberChanges.total.percentage,
            free: memberChanges.free.percentage,
            paid: memberChanges.paid.percentage,
            mrr: mrrChange.percentage
        },
        directions: {
            total: memberChanges.total.direction,
            free: memberChanges.free.direction,
            paid: memberChanges.paid.direction,
            mrr: mrrChange.direction
        }
    };
};

/**
 * Creates a map from array of items keyed by date
 */
const createDateMap = <T extends {date: string}>(items: T[]): Map<string, T> => {
    return new Map(items.map(item => [item.date, item]));
};

/**
 * Sorts items by date in ascending order
 */
const sortByDate = <T extends {date: string}>(items: T[]): T[] => {
    return [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

/**
 * Gets all unique dates from multiple date arrays
 */
const getAllUniqueDates = (dateArrays: string[][]): string[] => {
    const allDates = dateArrays.flat();
    return [...new Set(allDates)].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
};

/**
 * Extracts chart data point for a given date
 */
const extractChartDataPoint = (
    date: string,
    lastMemberItem: MemberStatusItem | null,
    lastMrrItem: MrrHistoryItem | null
) => {
    const free = lastMemberItem?.free ?? 0;
    const paid = lastMemberItem?.paid ?? 0;
    const comped = lastMemberItem?.comped ?? 0;
    const paidTotal = paid + comped;
    const value = free + paidTotal;
    const mrr = lastMrrItem?.mrr ?? 0;
    const paidSubscribed = lastMemberItem?.paid_subscribed ?? 0;
    const paidCanceled = lastMemberItem?.paid_canceled ?? 0;

    return {
        date,
        value,
        free,
        paid: paidTotal,
        comped,
        mrr,
        paid_subscribed: paidSubscribed,
        paid_canceled: paidCanceled,
        formattedValue: formatNumber(value),
        label: 'Total members'
    };
};

// Format chart data
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = sortByDate(memberData);
    const sortedMrrData = sortByDate(mrrData);

    const memberDates = sortedMemberData.map(item => item.date);
    const mrrDates = sortedMrrData.map(item => item.date);
    const allDates = getAllUniqueDates([memberDates, mrrDates]);

    const memberMap = createDateMap(sortedMemberData);
    const mrrMap = createDateMap(sortedMrrData);

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    return allDates.map((date) => {
        const currentMemberItem = memberMap.get(date);
        if (currentMemberItem) {
            lastMemberItem = currentMemberItem;
        }

        const currentMrrItem = mrrMap.get(date);
        if (currentMrrItem) {
            lastMrrItem = currentMrrItem;
        }

        return extractChartDataPoint(date, lastMemberItem, lastMrrItem);
    });
};

/**
 * Extracts member data from response
 */
const extractMemberData = (response: any): MemberStatusItem[] => {
    if (response?.stats) {
        return response.stats;
    }
    if (Array.isArray(response)) {
        return response;
    }
    return [];
};

/**
 * Creates data points for single day range
 */
const createSingleDayDataPoints = (rawData: MemberStatusItem[], dateFrom: string): MemberStatusItem[] => {
    if (rawData.length < 2) {
        return rawData;
    }

    const yesterdayData = rawData[rawData.length - 2];
    const todayData = rawData[rawData.length - 1];
    const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
    const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

    return [
        {...yesterdayData, date: startOfToday},
        {...todayData, date: startOfTomorrow}
    ];
};

/**
 * Processes member data for the given range
 */
const processMemberData = (response: any, range: number, dateFrom: string): MemberStatusItem[] => {
    const rawData = extractMemberData(response);

    if (range === 1 && rawData.length >= 2) {
        return createSingleDayDataPoints(rawData, dateFrom);
    }

    return rawData;
};

/**
 * Finds the currency with the highest MRR total
 */
const selectHighestMrrCurrency = (totals: any[]): string => {
    if (!totals || totals.length === 0) {
        return 'usd';
    }

    let currentMax = totals[0];
    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }

    return currentMax.currency;
};

/**
 * Checks if a start point exists in the result
 */
const hasStartPoint = (result: MrrHistoryItem[], dateFromMoment: moment.Moment): boolean => {
    return result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
};

/**
 * Adds start point to MRR data if missing
 */
const ensureStartPoint = (result: MrrHistoryItem[], allData: MrrHistoryItem[], dateFromMoment: moment.Moment): void => {
    if (hasStartPoint(result, dateFromMoment)) {
        return;
    }

    const mostRecentBeforeRange = allData.find((item) => {
        return moment(item.date).isBefore(dateFromMoment);
    });

    if (mostRecentBeforeRange) {
        result.unshift({
            ...mostRecentBeforeRange,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
    } else if (result.length > 0) {
        const earliestInRange = sortByDate(result)[0];
        result.unshift({
            ...earliestInRange,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
    }
};

/**
 * Checks if an end point exists in the result
 */
const hasEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment): boolean => {
    return result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
};

/**
 * Adds end point to MRR data if missing
 */
const ensureEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment): void => {
    if (hasEndPoint(result, endDateToCheck) || result.length === 0) {
        return;
    }

    const sortedResult = sortByDate(result).reverse();
    const mostRecentValue = sortedResult[0];

    result.push({
        ...mostRecentValue,
        date: endDateToCheck.format('YYYY-MM-DD')
    });
};

/**
 * Processes MRR history response
 */
const processMrrData = (response: any, dateFrom: string, range: number): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const selectedCurrency = selectHighestMrrCurrency(response.meta.totals);
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = response.stats.filter(d => d.currency === selectedCurrency);
    const filteredData = currencyFilteredData.filter((item) => {
        return moment(item.date).isSameOrAfter(dateFromMoment);
    });

    const allData = sortByDate(currencyFilteredData).reverse();
    const result = [...filteredData];

    ensureStartPoint(result, allData, dateFromMoment);
    ensureEndPoint(result, dateToMoment);

    const finalResult = sortByDate(result);