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
 * Finds the first actual MRR data point within range
 */
const findFirstMrrPoint = (mrrData: MrrHistoryItem[], dateFrom: string): MrrHistoryItem | undefined => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    return mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
};

/**
 * Determines the starting MRR value for change calculation
 */
const determineStartingMrr = (firstActualPoint: MrrHistoryItem | undefined, dateFrom: string, totalMrr: number): number => {
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

/**
 * Calculates MRR changes from history data
 */
const calculateMrrChanges = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) => {
    if (mrrData.length <= 1) {
        return {percentage: '0%', direction: 'same' as DiffDirection};
    }

    const firstActualPoint = findFirstMrrPoint(mrrData, dateFrom);
    const firstMrr = determineStartingMrr(firstActualPoint, dateFrom, totalMrr);

    return calculateMrrChange(firstMrr, totalMrr);
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
    const mrrChange = calculateMrrChanges(mrrData, dateFrom, totalMrr);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges: {
            total: memberChanges.percentChanges.total,
            free: memberChanges.percentChanges.free,
            paid: memberChanges.percentChanges.paid,
            mrr: mrrChange.percentage
        },
        directions: {
            total: memberChanges.directions.total,
            free: memberChanges.directions.free,
            paid: memberChanges.directions.paid,
            mrr: mrrChange.direction
        }
    };
};

/**
 * Updates last member item if current item exists
 */
const updateLastMemberItem = (currentItem: MemberStatusItem | undefined, lastItem: MemberStatusItem | null): MemberStatusItem | null => {
    return currentItem || lastItem;
};

/**
 * Updates last MRR item if current item exists
 */
const updateLastMrrItem = (currentItem: MrrHistoryItem | undefined, lastItem: MrrHistoryItem | null): MrrHistoryItem | null => {
    return currentItem || lastItem;
};

/**
 * Extracts member values with defaults
 */
const extractMemberValues = (memberItem: MemberStatusItem | null) => {
    const free = memberItem?.free ?? 0;
    const paid = memberItem?.paid ?? 0;
    const comped = memberItem?.comped ?? 0;
    return {free, paid, comped};
};

/**
 * Extracts MRR value with default
 */
const extractMrrValue = (mrrItem: MrrHistoryItem | null): number => {
    return mrrItem?.mrr ?? 0;
};

/**
 * Extracts subscription values with defaults
 */
const extractSubscriptionValues = (memberItem: MemberStatusItem | null) => {
    return {
        paid_subscribed: memberItem?.paid_subscribed ?? 0,
        paid_canceled: memberItem?.paid_canceled ?? 0
    };
};

// Format chart data
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
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
        lastMemberItem = updateLastMemberItem(currentMemberItem, lastMemberItem);

        const currentMrrItem = mrrMap.get(date);
        lastMrrItem = updateLastMrrItem(currentMrrItem, lastMrrItem);

        const {free, paid, comped} = extractMemberValues(lastMemberItem);
        const paidTotal = paid + comped;
        const value = free + paidTotal;
        const mrr = extractMrrValue(lastMrrItem);
        const {paid_subscribed, paid_canceled} = extractSubscriptionValues(lastMemberItem);

        return {
            date,
            value,
            free,
            paid: paidTotal,
            comped,
            mrr,
            paid_subscribed: paid_subscribed,
            paid_canceled: paid_canceled,
            formattedValue: formatNumber(value),
            label: 'Total members'
        };
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
 * Processes member data for single day range
 */
const processSingleDayMemberData = (rawData: MemberStatusItem[], dateFrom: string): MemberStatusItem[] => {
    if (rawData.length < 2) {
        return rawData;
    }

    const yesterdayData = rawData[rawData.length - 2];
    const todayData = rawData[rawData.length - 1];

    const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
    const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

    const startPoint = {
        ...yesterdayData,
        date: startOfToday
    };

    const endPoint = {
        ...todayData,
        date: startOfTomorrow
    };

    return [startPoint, endPoint];
};

/**
 * Determines if data should be processed for single day
 */
const shouldProcessSingleDay = (range: number, rawData: MemberStatusItem[]): boolean => {
    return range === 1 && rawData.length >= 2;
};

/**
 * Finds the highest MRR currency
 */
const findHighestMrrCurrency = (totals: any[]): {currency: string; mrr: number} => {
    if (!totals || totals.length === 0) {
        return {currency: 'usd', mrr: 0};
    }

    return totals.reduce((max, current) => current.mrr > max.mrr ? current : max);
};

/**
 * Checks if start point exists in result
 */
const hasStartPoint = (result: MrrHistoryItem[], dateFromMoment: moment.Moment): boolean => {
    return result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
};

/**
 * Finds most recent data point before range
 */
const findMostRecentBeforeRange = (allData: MrrHistoryItem[], dateFromMoment: moment.Moment): MrrHistoryItem | undefined => {
    return allData.find((item) => moment(item.date).isBefore(dateFromMoment));
};

/**
 * Finds earliest data point in range
 */
const findEarliestInRange = (result: MrrHistoryItem[]): MrrHistoryItem => {
    return [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
};

/**
 * Adds start point to result if missing
 */
const ensureStartPoint = (result: MrrHistoryItem[], allData: MrrHistoryItem[], dateFromMoment: moment.Moment): void => {
    if (hasStartPoint(result, dateFromMoment)) {
        return;
    }

    const mostRecentBeforeRange = findMostRecentBeforeRange(allData, dateFromMoment);

    if (mostRecentBeforeRange) {
        result.unshift({
            ...mostRecentBeforeRange,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
    } else if (result.length > 0) {
        const earliestInRange = findEarliestInRange(result);
        result.unshift({
            ...earliestInRange,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
    }
};

/**
 * Checks if end point exists in result
 */
const hasEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment): boolean => {
    return result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
};

/**
 * Finds most recent value in result
 */
const findMostRecentValue = (result: MrrHistoryItem[]): MrrHistoryItem => {
    return [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
};

/**
 * Adds end point to result if missing
 */
const ensureEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment): void => {
    if (hasEndPoint(result, endDateToCheck) || result.length === 0) {
        return;
    }

    const mostRecentValue = findMostRecentValue(result);
    result.push({
        ...mostRecentValue,
        date: endDateToCheck.format('YYYY-MM-DD')
    });
};

/**
 * Filters MRR data by currency
 */
const filterBySelectedCurrency = (stats: MrrHistoryItem[], currency: string): MrrHistoryItem[] => {
    return stats.filter(d => d.currency === currency);
};

/**
 * Filters MRR data by date range
 */
const filterByDateRange = (data: MrrHistoryItem[], dateFromMoment: moment.Moment): MrrHistoryItem[] => {
    return data.filter((item) => moment(item.date).isSameOrAfter(dateFromMoment));
};

/**
 * Processes MRR history response
 */
const processMrrHistoryResponse = (mrrHistoryResponse: any, dateFrom: string, range: number) => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const totals = mrrHistoryResponse.meta.totals;
    const highestMrr = findHighestMrrCurrency(totals);
    const useCurrency = highestMrr.currency;

    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = filterBySelectedCurrency(mrrHistoryResponse.stats, useCurrency);
    const filteredData = filterByDateRange(currencyFilteredData, dateFromMoment);

    const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...filteredData];

    ensureStartPoint(result, allData, dateFromMoment);
    ensureEndPoint(result, dateToMoment);

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
 * Filters subscription data by date range
 */
const filterSubscriptionByDateRange = (subscriptionArray: any[], dateFrom: string, endDate: string): any[] => {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = moment(endDate);

    return subscriptionArray.filter((item) => {
        const itemDate = moment(item.date);
        return itemDate.isSameOrAfter(dateFromMoment) && itemDate.isSameOrBefore(dateToMoment);
    });
};

/**
 * Processes subscription stats response
 */
const processSubscriptionStats = (subscriptionStatsResponse: any, dateFrom: string, endDate: string): any[] => {
    if (!subscriptionStatsResponse?.stats) {
        return [];
    }

    const mergedByDate = mergeSubscriptionStatsByDate(subscriptionStatsResponse.stats);
    const subscriptionArray = Object.values(mergedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return filterSubscriptionByDateRange(subscriptionArray, dateFrom, endDate);
};

export const useGrowthStats = (range: number) => {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);

    const memberDataStartDate = range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom;

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: {
            date_from: memberDataStartDate
        }
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: {
            date_from: memberDataStartDate
        }
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemo(() => {
        const rawData = extractMemberData(memberCountResponse);

        if (shouldProcessSingleDay(range, rawData)) {
            return processSingleDayMemberData(rawData, dateFrom);
        }

        return rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        return processMrrHistoryResponse(mrrHistoryResponse, dateFrom, range);
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => {
        return getSymbol(selectedCurrency);
    }, [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => {
        return processSubscriptionStats(subscriptionStatsResponse, dateFrom, endDate);
    }, [subscriptionStatsResponse, dateFrom, endDate]);

    return {
        isLoading,
        memberData,
        mrrData,
        dateFrom,
        endDate,
        totals: totalsData,
        chartData,
        subscriptionData,
        selectedCurrency,
        currencySymbol
    };
};
```