import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

/** Determine direction based on change value */
const getDirection = (change: number): DiffDirection => {
    if (change > 0) return 'up';
    if (change < 0) return 'down';
    return 'same';
};

/** Check if member data is empty */
const isEmptyMemberData = (memberData: MemberStatusItem[]): boolean => memberData.length === 0;

/** Get default totals response */
const getDefaultTotals = () => ({
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

/** Calculate total member percentage change */
const calculateTotalMemberChange = (first: MemberStatusItem, totalMembers: number) => {
    const firstTotal = first.free + first.paid + first.comped;
    if (firstTotal <= 0) return null;
    
    const totalChange = ((totalMembers - firstTotal) / firstTotal) * 100;
    return {
        percent: formatPercentage(totalChange / 100),
        direction: getDirection(totalChange)
    };
};

/** Calculate free member percentage change */
const calculateFreeMemberChange = (first: MemberStatusItem, latest: MemberStatusItem) => {
    if (first.free <= 0) return null;
    
    const freeChange = ((latest.free - first.free) / first.free) * 100;
    return {
        percent: formatPercentage(freeChange / 100),
        direction: getDirection(freeChange)
    };
};

/** Calculate paid member percentage change */
const calculatePaidMemberChange = (first: MemberStatusItem, latest: MemberStatusItem) => {
    const firstPaidTotal = first.paid + first.comped;
    if (firstPaidTotal <= 0) return null;
    
    const latestPaidTotal = latest.paid + latest.comped;
    const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
    return {
        percent: formatPercentage(paidChange / 100),
        direction: getDirection(paidChange)
    };
};

/** Check if date range is from beginning of period */
const isFromBeginningRange = (dateFrom: string): boolean => {
    const dateFromMoment = moment(dateFrom);
    return dateFromMoment.isSame(moment().startOf('year'), 'day') || dateFromMoment.year() < moment().year();
};

/** Find first MRR value for change calculation */
const findFirstMrrValue = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
    const isBeginningRange = isFromBeginningRange(dateFrom);

    if (!firstActualPoint) {
        return isBeginningRange ? 0 : totalMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return isBeginningRange ? 0 : totalMrr;
};

/** Calculate MRR percentage change */
const calculateMrrChange = (firstMrr: number, totalMrr: number) => {
    const mrrChange = firstMrr === 0
        ? (totalMrr > 0 ? 100 : 0)
        : ((totalMrr - firstMrr) / firstMrr) * 100;

    return {
        percent: formatPercentage(mrrChange / 100),
        direction: getDirection(mrrChange)
    };
};

/** Calculate member changes for multi-day ranges */
const calculateMemberChanges = (memberData: MemberStatusItem[], totalMembers: number) => {
    const changes = {
        total: null as {percent: string; direction: DiffDirection} | null,
        free: null as {percent: string; direction: DiffDirection} | null,
        paid: null as {percent: string; direction: DiffDirection} | null
    };

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];

    changes.total = calculateTotalMemberChange(first, totalMembers);
    changes.free = calculateFreeMemberChange(first, latest);
    changes.paid = calculatePaidMemberChange(first, latest);

    return changes;
};

/** Calculate MRR changes for multi-day ranges */
const calculateMrrChanges = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) => {
    const firstMrr = findFirstMrrValue(mrrData, dateFrom, totalMrr);
    return calculateMrrChange(firstMrr, totalMrr);
};

const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
    if (isEmptyMemberData(memberData)) {
        return getDefaultTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

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

    if (memberData.length > 1) {
        const memberChanges = calculateMemberChanges(memberData, totalMembers);
        
        if (memberChanges.total) {
            percentChanges.total = memberChanges.total.percent;
            directions.total = memberChanges.total.direction;
        }
        
        if (memberChanges.free) {
            percentChanges.free = memberChanges.free.percent;
            directions.free = memberChanges.free.direction;
        }
        
        if (memberChanges.paid) {
            percentChanges.paid = memberChanges.paid.percent;
            directions.paid = memberChanges.paid.direction;
        }
    }

    if (mrrData.length > 1) {
        const mrrChange = calculateMrrChanges(mrrData, dateFrom, totalMrr);
        percentChanges.mrr = mrrChange.percent;
        directions.mrr = mrrChange.direction;
    }

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges,
        directions
    };
};

/** Extract member data from response */
const extractMemberData = (response: any): MemberStatusItem[] => {
    if (response?.stats) {
        return response.stats;
    }
    if (Array.isArray(response)) {
        return response;
    }
    return [];
};

/** Create single day data points */
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

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

    const memberDates = sortedMemberData.map(item => item.date);
    const mrrDates = sortedMrrData.map(item => item.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

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

/** Find currency with highest MRR */
const findHighestMrrCurrency = (totals: Array<{currency: string; mrr: number}>) => {
    let currentMax = totals[0];
    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }
    return currentMax.currency;
};

/** Check if result has start point */
const hasStartPoint = (result: MrrHistoryItem[], dateFromMoment: moment.Moment): boolean => {
    return result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
};

/** Add start point to MRR data if missing */
const ensureStartPoint = (result: MrrHistoryItem[], dateFromMoment: moment.Moment, allData: MrrHistoryItem[]) => {
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

/** Check if result has end point */
const hasEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment): boolean => {
    return result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
};

/** Add end point to MRR data if missing */
const ensureEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment) => {
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

/** Process MRR history response */
const processMrrHistory = (mrrHistoryResponse: any, dateFrom: string, range: number, endDate: moment.Moment) => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const totals = mrrHistoryResponse.meta.totals;
    if (!totals[0]) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const useCurrency = findHighestMrrCurrency(totals);
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = mrrHistoryResponse.stats.filter(d => d.currency === useCurrency);
    const filteredData = currencyFilteredData.filter((item) => {
        return moment(item.date).isSameOrAfter(dateFromMoment);
    });

    const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...filteredData];

    ensureStartPoint(result, dateFromMoment, allData);
    ensureEndPoint(result, dateToMoment);

    const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalResult, selectedCurrency: useCurrency};
};

/** Merge subscription stats by date */
const mergeSubscriptionStatsByDate = (stats: Array<{date: string; signups: number; cancellations: number}>) => {
    const mergedByDate = stats.reduce((acc, current) => {
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

    return Object.values(mergedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

/** Filter subscription data to date range */
const filterSubscriptionDataToRange = (subscriptionArray: Array<{date: string; signups: number; cancellations: number}>, dateFrom: string, endDate: moment.Moment) => {
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
        
        if (range === 1 && rawData.length >= 2) {
            return createSingleDayDataPoints(rawData, dateFrom);
        }
        
        return rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        return processMrrHistory(mrrHistoryResponse, dateFrom, range, endDate);
    }, [mrrHistoryResponse, dateFrom, range, endDate]);

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

        const subscriptionArray = mergeSubscriptionStatsByDate(subscriptionStatsResponse.stats);
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