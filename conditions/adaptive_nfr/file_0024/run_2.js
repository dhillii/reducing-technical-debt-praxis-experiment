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
const calculateMemberChanges = (memberData: MemberStatusItem[], currentTotals: MemberStatusItem, latest: MemberStatusItem) => {
    const changes = {
        total: {percentage: '0%', direction: 'same' as DiffDirection},
        free: {percentage: '0%', direction: 'same' as DiffDirection},
        paid: {percentage: '0%', direction: 'same' as DiffDirection}
    };

    if (memberData.length <= 1) {
        return changes;
    }

    const first = memberData[0];
    const firstTotal = first.free + first.paid + first.comped;
    const currentTotal = currentTotals.free + currentTotals.paid + currentTotals.comped;

    changes.total = calculateMetricChange(currentTotal, firstTotal);
    changes.free = calculateMetricChange(latest.free, first.free);

    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;
    changes.paid = calculateMetricChange(latestPaidTotal, firstPaidTotal);

    return changes;
};

/**
 * Determines the first MRR value for the date range
 */
const getFirstMrrValue = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number, isFromBeginningRange: boolean): number => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));

    if (!firstActualPoint) {
        return isFromBeginningRange ? 0 : totalMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return isFromBeginningRange ? 0 : totalMrr;
};

/**
 * Checks if the date range is from the beginning of a period (e.g., YTD)
 */
const isFromBeginningRange = (dateFrom: string): boolean => {
    const dateFromMoment = moment(dateFrom);
    return dateFromMoment.isSame(moment().startOf('year'), 'day') || dateFromMoment.year() < moment().year();
};

/**
 * Calculates MRR change metrics
 */
const calculateMrrChange = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) => {
    if (mrrData.length <= 1) {
        return {percentage: '0%', direction: 'same' as DiffDirection};
    }

    const isBeginning = isFromBeginningRange(dateFrom);
    const firstMrr = getFirstMrrValue(mrrData, dateFrom, totalMrr, isBeginning);

    if (firstMrr < 0) {
        return {percentage: '0%', direction: 'same' as DiffDirection};
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
 * Returns default empty totals structure
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
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const memberChanges = calculateMemberChanges(memberData, currentTotals, latest);
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
 * Extracts member values from last known item
 */
const extractMemberValues = (lastMemberItem: MemberStatusItem | null) => {
    const free = lastMemberItem?.free ?? 0;
    const paid = lastMemberItem?.paid ?? 0;
    const comped = lastMemberItem?.comped ?? 0;
    const paidTotal = paid + comped;
    const value = free + paidTotal;
    const paidSubscribed = lastMemberItem?.paid_subscribed ?? 0;
    const paidCanceled = lastMemberItem?.paid_canceled ?? 0;

    return {free, paid: paidTotal, comped, value, paidSubscribed, paidCanceled};
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
        lastMemberItem = updateLastMemberItem(memberMap.get(date), lastMemberItem);
        lastMrrItem = updateLastMrrItem(mrrMap.get(date), lastMrrItem);

        const memberValues = extractMemberValues(lastMemberItem);
        const mrr = lastMrrItem?.mrr ?? 0;

        return {
            date,
            value: memberValues.value,
            free: memberValues.free,
            paid: memberValues.paid,
            comped: memberValues.comped,
            mrr,
            paid_subscribed: memberValues.paidSubscribed,
            paid_canceled: memberValues.paidCanceled,
            formattedValue: formatNumber(memberValues.value),
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
 * Processes member data based on range
 */
const processMemberData = (rawData: MemberStatusItem[], range: number, dateFrom: string): MemberStatusItem[] => {
    if (range === 1) {
        return createSingleDayDataPoints(rawData, dateFrom);
    }
    return rawData;
};

/**
 * Finds currency with highest MRR total
 */
const findHighestMrrCurrency = (totals: any[]): string => {
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
 * Filters MRR data by date range
 */
const filterMrrByDateRange = (data: MrrHistoryItem[], dateFromMoment: moment.Moment): MrrHistoryItem[] => {
    return data.filter((item) => moment(item.date).isSameOrAfter(dateFromMoment));
};

/**
 * Checks if result has start point for date
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
 * Adds start point to MRR result if missing
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
 * Checks if result has end point for date
 */
const hasEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment): boolean => {
    return result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
};

/**
 * Adds end point to MRR result if missing
 */
const ensureEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment): void => {
    if (hasEndPoint(result, endDateToCheck) || result.length === 0) {
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
const processMrrHistory = (mrrHistoryResponse: any, dateFrom: string, range: number) => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const selectedCurrency = findHighestMrrCurrency(mrrHistoryResponse.meta.totals);
    const currencyFilteredData = mrrHistoryResponse.stats.filter(d => d.currency === selectedCurrency);

    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const filteredData = filterMrrByDateRange(currencyFilteredData, dateFromMoment);
    const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...filteredData];

    ensureStartPoint(result, allData, dateFromMoment);
    ensureEndPoint(result, dateToMoment);

    const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalResult, selectedCurrency};
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
        return processMemberData(rawData, range, dateFrom);
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        return processMrrHistory(mrrHistoryResponse, dateFrom, range);
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