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
 * Initializes empty totals response
 */
const createEmptyTotals = () => ({
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

/**
 * Calculates member count changes
 */
const calculateMemberChanges = (memberData: MemberStatusItem[], currentTotals: MemberStatusItem, latest: MemberStatusItem) => {
    const percentChanges = {
        total: '0%',
        free: '0%',
        paid: '0%'
    };

    const directions = {
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection
    };

    if (memberData.length <= 1) {
        return {percentChanges, directions};
    }

    const first = memberData[0];
    const firstTotal = first.free + first.paid + first.comped;
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;

    const totalChange = calculateMetricChange(totalMembers, firstTotal);
    percentChanges.total = totalChange.percentage;
    directions.total = totalChange.direction;

    const freeChange = calculateMetricChange(latest.free, first.free);
    percentChanges.free = freeChange.percentage;
    directions.free = freeChange.direction;

    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;
    const paidChange = calculateMetricChange(latestPaidTotal, firstPaidTotal);
    percentChanges.paid = paidChange.percentage;
    directions.paid = paidChange.direction;

    return {percentChanges, directions};
};

/**
 * Determines if date range is from beginning of period (e.g., YTD)
 */
const isFromBeginningRange = (dateFrom: string): boolean => {
    const dateFromMoment = moment(dateFrom);
    return dateFromMoment.isSame(moment().startOf('year'), 'day') || dateFromMoment.year() < moment().year();
};

/**
 * Finds the first MRR value for the range
 */
const findFirstMrrValue = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));

    if (!firstActualPoint) {
        return isFromBeginningRange(dateFrom) ? 0 : totalMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return isFromBeginningRange(dateFrom) ? 0 : totalMrr;
};

/**
 * Calculates MRR change
 */
const calculateMrrChange = (firstMrr: number, totalMrr: number): {percentage: string; direction: DiffDirection} => {
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

// Calculate totals from member data
const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
    if (!memberData.length) {
        return createEmptyTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const memberChanges = calculateMemberChanges(memberData, currentTotals, latest);

    let mrrPercentChange = '0%';
    let mrrDirection: DiffDirection = 'same';

    if (mrrData.length > 1) {
        const firstMrr = findFirstMrrValue(mrrData, dateFrom, totalMrr);
        const mrrChange = calculateMrrChange(firstMrr, totalMrr);
        mrrPercentChange = mrrChange.percentage;
        mrrDirection = mrrChange.direction;
    }

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges: {
            total: memberChanges.percentChanges.total,
            free: memberChanges.percentChanges.free,
            paid: memberChanges.percentChanges.paid,
            mrr: mrrPercentChange
        },
        directions: {
            total: memberChanges.directions.total,
            free: memberChanges.directions.free,
            paid: memberChanges.directions.paid,
            mrr: mrrDirection
        }
    };
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
 * Formats member data for single day range
 */
const formatSingleDayMemberData = (rawData: MemberStatusItem[], dateFrom: string): MemberStatusItem[] => {
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

// Format chart data
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

    const allDates = [...new Set([...sortedMemberData.map(item => item.date), ...sortedMrrData.map(item => item.date)])]
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

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
    });
};

/**
 * Selects currency with highest MRR total
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
 * Checks if result has data point at specified date
 */
const hasDataPointAtDate = (result: MrrHistoryItem[], dateToCheck: moment.Moment): boolean => {
    return result.some(item => moment(item.date).isSame(dateToCheck, 'day'));
};

/**
 * Adds start point to MRR data if missing
 */
const ensureStartPoint = (result: MrrHistoryItem[], dateFromMoment: moment.Moment, allData: MrrHistoryItem[]): void => {
    if (hasDataPointAtDate(result, dateFromMoment)) {
        return;
    }

    const mostRecentBeforeRange = allData.find((item) => moment(item.date).isBefore(dateFromMoment));

    if (mostRecentBeforeRange) {
        result.unshift({
            ...mostRecentBeforeRange,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
    } else if (result.length > 0) {
        const earliestInRange = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        result.unshift({
            ...earliestInRange,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
    }
};

/**
 * Adds end point to MRR data if missing
 */
const ensureEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment): void => {
    if (result.length === 0 || hasDataPointAtDate(result, endDateToCheck)) {
        return;
    }

    const sortedResult = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const mostRecentValue = sortedResult[0];

    result.push({
        ...mostRecentValue,
        date: endDateToCheck.format('YYYY-MM-DD')
    });
};

/**
 * Processes MRR history response
 */
const processMrrHistory = (mrrHistoryResponse: any, dateFrom: string, range: number, endDate: moment.Moment): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const useCurrency = selectHighestMrrCurrency(mrrHistoryResponse.meta.totals);
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = mrrHistoryResponse.stats.filter(d => d.currency === useCurrency);
    const filteredData = currencyFilteredData.filter((item) => moment(item.date).isSameOrAfter(dateFromMoment));
    const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...filteredData];

    ensureStartPoint(result, dateFromMoment, allData);

    const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    ensureEndPoint(result, endDateToCheck);

    const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalResult, selectedCurrency: useCurrency};
};

/**
 * Merges subscription stats by date
 */
const mergeSubscriptionStatsByDate = (stats: any[]): Record<string, {date: string; signups: number; cancellations: number}> => {
    return stats.reduce((acc, current) => {
        const dateKey = current.date;

        if (!acc[dateKey]) {
            acc[dateKey] = {
                date: dateKey,
                signups: 0,
                cancellations: 0
            };
        }

        acc[dateKey].signups += current.signups;
        acc[dateKey].cancellations += current.cancellations;

        return acc;
    }, {} as Record<string, {date: string; signups: number; cancellations: number}>);
};

/**
 * Filters subscription data to date range
 */
const filterSubscriptionDataToRange = (subscriptionArray: any[], dateFrom: string, endDate: moment.Moment): any[] => {
    const dateFromMoment = moment(dateFrom