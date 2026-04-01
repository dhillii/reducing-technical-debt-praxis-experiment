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
 * Calculates MRR change with special handling for zero starting point
 */
const calculateMrrChange = (current: number, previous: number): {percentage: string; direction: DiffDirection} => {
    if (previous === 0) {
        const change = current > 0 ? 100 : 0;
        return {
            percentage: formatPercentage(change / 100),
            direction: getChangeDirection(change)
        };
    }
    const change = ((current - previous) / previous) * 100;
    return {
        percentage: formatPercentage(change / 100),
        direction: getChangeDirection(change)
    };
};

/**
 * Extracts member data from API response
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
 * Calculates member totals from current data
 */
const getMemberTotals = (memberData: MemberStatusItem[], memberCountTotals?: {paid: number; free: number; comped: number}) => {
    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    return {
        total: currentTotals.free + currentTotals.paid + currentTotals.comped,
        free: currentTotals.free,
        paid: currentTotals.paid + currentTotals.comped
    };
};

/**
 * Calculates percentage changes for member metrics
 */
const calculateMemberPercentChanges = (memberData: MemberStatusItem[]) => {
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
    const latest = memberData[memberData.length - 1];
    const firstTotal = first.free + first.paid + first.comped;
    const currentTotal = latest.free + latest.paid + latest.comped;

    const totalChange = calculateMetricChange(currentTotal, firstTotal);
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
 * Finds first MRR value for change calculation
 */
const getFirstMrrValue = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number => {
    if (mrrData.length <= 1) {
        return 0;
    }

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
 * Calculates MRR percentage change
 */
const calculateMrrPercentChange = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) => {
    if (mrrData.length <= 1) {
        return {percentage: '0%', direction: 'same' as DiffDirection};
    }

    const firstMrr = getFirstMrrValue(mrrData, dateFrom, totalMrr);
    return calculateMrrChange(totalMrr, firstMrr);
};

// Calculate totals from member data
const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
    if (!memberData.length) {
        return {
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
        };
    }

    const memberTotals = getMemberTotals(memberData, memberCountTotals);
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};
    const totalMrr = latestMrr.mrr;

    const {percentChanges: memberPercentChanges, directions: memberDirections} = calculateMemberPercentChanges(memberData);
    const mrrChange = calculateMrrPercentChange(mrrData, dateFrom, totalMrr);

    return {
        totalMembers: memberTotals.total,
        freeMembers: memberTotals.free,
        paidMembers: memberTotals.paid,
        mrr: totalMrr,
        percentChanges: {
            total: memberPercentChanges.total,
            free: memberPercentChanges.free,
            paid: memberPercentChanges.paid,
            mrr: mrrChange.percentage
        },
        directions: {
            total: memberDirections.total,
            free: memberDirections.free,
            paid: memberDirections.paid,
            mrr: mrrChange.direction
        }
    };
};

// Format chart data
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    // Ensure data is sorted by date
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMemberData.map(item => item.date);
    const mrrDates = sortedMrrData.map(item => item.date);

    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

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
 * Processes member data for single day ranges
 */
const processMemberDataForRange = (rawData: MemberStatusItem[], range: number, dateFrom: string): MemberStatusItem[] => {
    if (range !== 1 || rawData.length < 2) {
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
const hasDataPointAtDate = (result: MrrHistoryItem[], targetDate: moment.Moment): boolean => {
    return result.some(item => moment(item.date).isSame(targetDate, 'day'));
};

/**
 * Adds start point to MRR data if missing
 */
const ensureStartPoint = (result: MrrHistoryItem[], allData: MrrHistoryItem[], dateFromMoment: moment.Moment): void => {
    if (hasDataPointAtDate(result, dateFromMoment)) {
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
        return;
    }

    if (result.length > 0) {
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
    const filteredData = currencyFilteredData.filter((item) => {
        return moment(item.date).isSameOrAfter(dateFromMoment);
    });

    const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...filteredData];

    ensureStartPoint(result, allData, dateFromMoment);

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
            acc