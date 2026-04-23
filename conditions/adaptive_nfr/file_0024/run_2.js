import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

/** Determines if a change value indicates an upward direction */
const isUpDirection = (change: number): boolean => change > 0;

/** Determines if a change value indicates a downward direction */
const isDownDirection = (change: number): boolean => change < 0;

/** Converts a numeric change to a direction */
const getDirection = (change: number): DiffDirection => {
    if (isUpDirection(change)) return 'up';
    if (isDownDirection(change)) return 'down';
    return 'same';
};

/** Checks if member data is empty */
const hasNoMemberData = (memberData: MemberStatusItem[]): boolean => memberData.length === 0;

/** Checks if there is sufficient member data for comparison */
const hasSufficientMemberData = (memberData: MemberStatusItem[]): boolean => memberData.length > 1;

/** Checks if there is sufficient MRR data for comparison */
const hasSufficientMrrData = (mrrData: MrrHistoryItem[]): boolean => mrrData.length > 1;

/** Checks if a value is positive */
const isPositive = (value: number): boolean => value > 0;

/** Checks if a date range is from the beginning of a period */
const isFromBeginningRange = (dateFrom: string): boolean => {
    const dateFromMoment = moment(dateFrom);
    return dateFromMoment.isSame(moment().startOf('year'), 'day') || dateFromMoment.year() < moment().year();
};

/** Gets the default empty totals object */
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

/** Calculates percentage change and direction for a metric */
const calculateMetricChange = (current: number, previous: number): {percentage: string; direction: DiffDirection} => {
    if (!isPositive(previous)) {
        return {percentage: '0%', direction: 'same'};
    }
    const change = ((current - previous) / previous) * 100;
    return {
        percentage: formatPercentage(change / 100),
        direction: getDirection(change)
    };
};

/** Calculates total members from status item */
const getTotalMembers = (item: MemberStatusItem): number => item.free + item.paid + item.comped;

/** Calculates paid members total from status item */
const getPaidMembersTotal = (item: MemberStatusItem): number => item.paid + item.comped;

/** Processes member count changes */
const processMemberChanges = (memberData: MemberStatusItem[], currentTotals: MemberStatusItem, latest: MemberStatusItem) => {
    const percentChanges = {
        total: '0%',
        free: '0%',
        paid: '0%',
        mrr: '0%'
    };

    const directions = {
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection,
        mrr: 'same' as DiffDirection
    };

    if (!hasSufficientMemberData(memberData)) {
        return {percentChanges, directions};
    }

    const first = memberData[0];
    const firstTotal = getTotalMembers(first);
    const currentTotal = getTotalMembers(currentTotals);

    const totalChange = calculateMetricChange(currentTotal, firstTotal);
    percentChanges.total = totalChange.percentage;
    directions.total = totalChange.direction;

    const freeChange = calculateMetricChange(latest.free, first.free);
    percentChanges.free = freeChange.percentage;
    directions.free = freeChange.direction;

    const firstPaidTotal = getPaidMembersTotal(first);
    const latestPaidTotal = getPaidMembersTotal(latest);
    const paidChange = calculateMetricChange(latestPaidTotal, firstPaidTotal);
    percentChanges.paid = paidChange.percentage;
    directions.paid = paidChange.direction;

    return {percentChanges, directions};
};

/** Determines the first MRR value for comparison */
const getFirstMrrValue = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number => {
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

/** Calculates MRR change percentage */
const calculateMrrChange = (firstMrr: number, totalMrr: number): number => {
    if (firstMrr === 0) {
        return isPositive(totalMrr) ? 100 : 0;
    }
    return ((totalMrr - firstMrr) / firstMrr) * 100;
};

/** Processes MRR changes */
const processMrrChanges = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) => {
    if (!hasSufficientMrrData(mrrData)) {
        return {percentage: '0%', direction: 'same' as DiffDirection};
    }

    const firstMrr = getFirstMrrValue(mrrData, dateFrom, totalMrr);
    const mrrChange = calculateMrrChange(firstMrr, totalMrr);

    return {
        percentage: formatPercentage(mrrChange / 100),
        direction: getDirection(mrrChange)
    };
};

const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
    if (hasNoMemberData(memberData)) {
        return getEmptyTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = getTotalMembers(currentTotals);
    const totalMrr = latestMrr.mrr;

    const memberChanges = processMemberChanges(memberData, currentTotals, latest);
    const mrrChange = processMrrChanges(mrrData, dateFrom, totalMrr);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: getPaidMembersTotal(currentTotals),
        mrr: totalMrr,
        percentChanges: {
            ...memberChanges.percentChanges,
            mrr: mrrChange.percentage
        },
        directions: {
            ...memberChanges.directions,
            mrr: mrrChange.direction
        }
    };
};

/** Sorts data array by date */
const sortByDate = <T extends {date: string}>(data: T[]): T[] => {
    return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

/** Creates a map from array of items with date keys */
const createDateMap = <T extends {date: string}>(data: T[]): Map<string, T> => {
    return new Map(data.map(item => [item.date, item]));
};

/** Gets all unique dates from multiple date arrays */
const getAllUniqueDates = (dateArrays: string[][]): string[] => {
    const allDates = dateArrays.flat();
    return [...new Set(allDates)].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
};

/** Extracts member values from item or uses last known values */
const getMemberValues = (item: MemberStatusItem | undefined, lastItem: MemberStatusItem | null) => {
    const source = item || lastItem;
    return {
        free: source?.free ?? 0,
        paid: source?.paid ?? 0,
        comped: source?.comped ?? 0,
        paid_subscribed: source?.paid_subscribed ?? 0,
        paid_canceled: source?.paid_canceled ?? 0
    };
};

/** Extracts MRR value from item or uses last known value */
const getMrrValue = (item: MrrHistoryItem | undefined, lastItem: MrrHistoryItem | null): number => {
    return (item || lastItem)?.mrr ?? 0;
};

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

        const memberValues = getMemberValues(currentMemberItem, lastMemberItem);
        const mrr = getMrrValue(currentMrrItem, lastMrrItem);

        const paidTotal = memberValues.paid + memberValues.comped;
        const value = memberValues.free + paidTotal;

        return {
            date,
            value,
            free: memberValues.free,
            paid: paidTotal,
            comped: memberValues.comped,
            mrr,
            paid_subscribed: memberValues.paid_subscribed,
            paid_canceled: memberValues.paid_canceled,
            formattedValue: formatNumber(value),
            label: 'Total members'
        };
    });
};

/** Checks if a data point exists at a specific date */
const hasDataPointAtDate = (data: {date: string}[], targetDate: moment.Moment): boolean => {
    return data.some(item => moment(item.date).isSame(targetDate, 'day'));
};

/** Finds the most recent data point before a given date */
const findMostRecentBefore = <T extends {date: string}>(data: T[], targetDate: moment.Moment): T | undefined => {
    const sorted = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted.find(item => moment(item.date).isBefore(targetDate));
};

/** Finds the earliest data point in an array */
const findEarliest = <T extends {date: string}>(data: T[]): T | undefined => {
    const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sorted[0];
};

/** Finds the most recent data point in an array */
const findMostRecent = <T extends {date: string}>(data: T[]): T | undefined => {
    const sorted = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0];
};

/** Ensures a start point exists in the MRR data */
const ensureMrrStartPoint = (result: MrrHistoryItem[], dateFromMoment: moment.Moment, allData: MrrHistoryItem[]): void => {
    if (hasDataPointAtDate(result, dateFromMoment)) {
        return;
    }

    const mostRecentBefore = findMostRecentBefore(allData, dateFromMoment);
    if (mostRecentBefore) {
        result.unshift({
            ...mostRecentBefore,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
        return;
    }

    const earliestInRange = findEarliest(result);
    if (earliestInRange) {
        result.unshift({
            ...earliestInRange,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
    }
};

/** Ensures an end point exists in the MRR data */
const ensureMrrEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment): void => {
    if (result.length === 0 || hasDataPointAtDate(result, endDateToCheck)) {
        return;
    }

    const mostRecentValue = findMostRecent(result);
    if (mostRecentValue) {
        result.push({
            ...mostRecentValue,
            date: endDateToCheck.format('YYYY-MM-DD')
        });
    }
};

/** Selects the currency with the highest MRR total */
const selectHighestMrrCurrency = (totals: Array<{currency: string; mrr: number}>): string => {
    if (!totals.length) return 'usd';
    
    let currentMax = totals[0];
    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }
    return currentMax.currency;
};

/** Filters MRR data by currency */
const filterMrrByCurrency = (data: MrrHistoryItem[], currency: string): MrrHistoryItem[] => {
    return data.filter(d => d.currency === currency);
};

/** Filters MRR data by date range */
const filterMrrByDateRange = (data: MrrHistoryItem[], dateFromMoment: moment.Moment): MrrHistoryItem[] => {
    return data.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));
};

/** Processes member data for single day range */
const processSingleDayMemberData = (rawData: MemberStatusItem[], dateFrom: string): MemberStatusItem[] => {
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

/** Extracts member data from response */
const extractMemberData = (response: any): MemberStatusItem[] => {
    if (response?.stats) {
        return response.stats;
    }
    if (Array.isArray(response)) {
        return response;
    }
    return [];
};

/** Merges subscription stats by date */
const mergeSubscriptionStatsByDate = (stats: Array<{date: string; signups: number; cancellations: number}>): Record<string, {date: string; signups: number; cancellations: number}> => {
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

/** Filters subscription data by date range */
const filterSubscriptionByDateRange = (data: Array<{date: string}>, dateFromMoment: moment.Moment, dateToMoment: moment.Moment): typeof data => {
    return data.filter((item) => {
        const itemDate = moment(item.date);
        return itemDate.isSameOrAfter(dateFromMoment) && itemDate.isSameOrBefore(dateToMoment);
    });
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

        if (range === 1) {
            return processSingleDayMemberData(rawData, dateFrom);
        }

        return rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

        if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const useCurrency = selectHighestMrrCurrency(mrrHistoryResponse.meta.totals);
        const currencyFilteredData = filterMrrByCurrency(mrrHistoryResponse.stats, useCurrency);
        const filteredData = filterMrrByDateRange(currencyFilteredData, dateFromMoment);

        const result = [...filteredData];
        const allData = sortByDate(currencyFilteredData);

        ensureMrrStartPoint(result, dateFromMoment, allData);

        const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;
        ensureMrrEndPoint(result, endDateToCheck);

        const finalResult = sortByDate(result);

        return {mrrData: finalResult, selectedCurrency: useCurrency};
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => {
        return getSymbol(selectedCurrency);
    }, [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        const mergedByDate = mergeSubscriptionStatsByDate(subscriptionStatsResponse.stats);
        const subscriptionArray = sortByDate(Object.values(mergedByDate));

        const dateFromMoment = moment(dateFrom);
        const dateToMoment = moment(endDate);

        return filterSubscriptionByDateRange(subscriptionArray, dateFromMoment, dateToMoment);
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