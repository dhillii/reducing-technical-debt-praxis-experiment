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
const isEmptyMemberData = (memberData: MemberStatusItem[]): boolean => !memberData.length;

/** Checks if we have sufficient data for percentage calculations */
const hasSufficientMemberData = (memberData: MemberStatusItem[]): boolean => memberData.length > 1;

/** Checks if we have sufficient MRR data for calculations */
const hasSufficientMrrData = (mrrData: MrrHistoryItem[]): boolean => mrrData.length > 1;

/** Checks if a value is positive */
const isPositive = (value: number): boolean => value > 0;

/** Checks if a value is zero */
const isZero = (value: number): boolean => value === 0;

/** Checks if date is at the start of current year */
const isYearToDateRange = (dateFrom: string): boolean => {
    return moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
           moment(dateFrom).year() < moment().year();
};

/** Calculates percentage change between two values */
const calculatePercentageChange = (current: number, previous: number): number => {
    if (isZero(previous)) {
        return isPositive(current) ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
};

/** Calculates total members from status item */
const getTotalMembers = (item: MemberStatusItem): number => {
    return item.free + item.paid + item.comped;
};

/** Calculates paid members total from status item */
const getPaidMembersTotal = (item: MemberStatusItem): number => {
    return item.paid + item.comped;
};

/** Calculates member count changes */
const calculateMemberChanges = (memberData: MemberStatusItem[], currentTotals: MemberStatusItem) => {
    const changes = {
        total: '0%',
        free: '0%',
        paid: '0%'
    };
    const directions = {
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection
    };

    if (!hasSufficientMemberData(memberData)) {
        return {changes, directions};
    }

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];
    const currentTotal = getTotalMembers(currentTotals);
    const firstTotal = getTotalMembers(first);

    if (isPositive(firstTotal)) {
        const totalChange = calculatePercentageChange(currentTotal, firstTotal);
        changes.total = formatPercentage(totalChange / 100);
        directions.total = getDirection(totalChange);
    }

    if (isPositive(first.free)) {
        const freeChange = calculatePercentageChange(latest.free, first.free);
        changes.free = formatPercentage(freeChange / 100);
        directions.free = getDirection(freeChange);
    }

    const firstPaidTotal = getPaidMembersTotal(first);
    const latestPaidTotal = getPaidMembersTotal(latest);

    if (isPositive(firstPaidTotal)) {
        const paidChange = calculatePercentageChange(latestPaidTotal, firstPaidTotal);
        changes.paid = formatPercentage(paidChange / 100);
        directions.paid = getDirection(paidChange);
    }

    return {changes, directions};
};

/** Finds the first actual MRR data point within the date range */
const findFirstActualMrrPoint = (mrrData: MrrHistoryItem[], dateFrom: string): MrrHistoryItem | undefined => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    return mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
};

/** Determines the starting MRR value for change calculation */
const determineStartingMrr = (firstActualPoint: MrrHistoryItem | undefined, dateFrom: string, isFromBeginning: boolean, totalMrr: number): number => {
    if (!firstActualPoint) {
        return isFromBeginning ? 0 : totalMrr;
    }

    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const isExactMatch = moment(firstActualPoint.date).isSame(actualStartDate, 'day');

    if (isExactMatch) {
        return firstActualPoint.mrr;
    }

    return isFromBeginning ? 0 : totalMrr;
};

/** Calculates MRR changes */
const calculateMrrChanges = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) => {
    const changes = {mrr: '0%'};
    const directions = {mrr: 'same' as DiffDirection};

    if (!hasSufficientMrrData(mrrData)) {
        return {changes, directions};
    }

    const isFromBeginning = isYearToDateRange(dateFrom);
    const firstActualPoint = findFirstActualMrrPoint(mrrData, dateFrom);
    const firstMrr = determineStartingMrr(firstActualPoint, dateFrom, isFromBeginning, totalMrr);

    if (firstMrr >= 0) {
        const mrrChange = calculatePercentageChange(totalMrr, firstMrr);
        changes.mrr = formatPercentage(mrrChange / 100);
        directions.mrr = getDirection(mrrChange);
    }

    return {changes, directions};
};

const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
    if (isEmptyMemberData(memberData)) {
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

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = getTotalMembers(currentTotals);
    const totalMrr = latestMrr.mrr;

    const {changes: memberChanges, directions: memberDirections} = calculateMemberChanges(memberData, currentTotals);
    const {changes: mrrChanges, directions: mrrDirections} = calculateMrrChanges(mrrData, dateFrom, totalMrr);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: getPaidMembersTotal(currentTotals),
        mrr: totalMrr,
        percentChanges: {
            total: memberChanges.total,
            free: memberChanges.free,
            paid: memberChanges.paid,
            mrr: mrrChanges.mrr
        },
        directions: {
            total: memberDirections.total,
            free: memberDirections.free,
            paid: memberDirections.paid,
            mrr: mrrDirections.mrr
        }
    };
};

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

/** Processes member data for single day ranges */
const processSingleDayMemberData = (rawData: MemberStatusItem[], range: number, dateFrom: string): MemberStatusItem[] => {
    if (range !== 1 || rawData.length < 2) {
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

/** Extracts member data from response */
const extractMemberData = (memberCountResponse: any): MemberStatusItem[] => {
    if (memberCountResponse?.stats) {
        return memberCountResponse.stats;
    }
    if (Array.isArray(memberCountResponse)) {
        return memberCountResponse;
    }
    return [];
};

/** Finds the currency with highest MRR */
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

/** Checks if result has start point at given date */
const hasStartPoint = (result: MrrHistoryItem[], dateFromMoment: moment.Moment): boolean => {
    return result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
};

/** Adds start point to MRR data if missing */
const ensureStartPoint = (result: MrrHistoryItem[], dateFromMoment: moment.Moment, allData: MrrHistoryItem[]): void => {
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
        const earliestInRange = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        result.unshift({
            ...earliestInRange,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
    }
};

/** Checks if result has end point at given date */
const hasEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment): boolean => {
    return result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
};

/** Adds end point to MRR data if missing */
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

/** Filters and processes MRR data for selected currency */
const processMrrData = (mrrHistoryResponse: any, dateFrom: string, range: number, dateToMoment: moment.Moment) => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const selectedCurrency = selectHighestMrrCurrency(mrrHistoryResponse.meta.totals);
    const dateFromMoment = moment(dateFrom);

    const currencyFilteredData = mrrHistoryResponse.stats.filter(d => d.currency === selectedCurrency);
    const filteredData = currencyFilteredData.filter((item) => {
        return moment(item.date).isSameOrAfter(dateFromMoment);
    });

    const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...filteredData];

    ensureStartPoint(result, dateFromMoment, allData);

    const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    ensureEndPoint(result, endDateToCheck);

    const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalResult, selectedCurrency};
};

/** Merges subscription stats by date */
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

/** Filters subscription data to date range */
const filterSubscriptionDataToRange = (subscriptionArray: any[], dateFrom: string, endDate: string): any[] => {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = moment(endDate);

    return subscriptionArray.filter((item) => {
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
        return processSingleDayMemberData(rawData, range, dateFrom);
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');
        return processMrrData(mrrHistoryResponse, dateFrom, range, dateToMoment);
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
        const subscriptionArray = Object.values(mergedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return filterSubscriptionDataToRange(subscriptionArray, dateFrom, endDate);
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