import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

// Initialize empty percentage changes object
const createEmptyPercentChanges = () => ({
    total: '0%',
    free: '0%',
    paid: '0%',
    mrr: '0%'
});

// Initialize empty directions object
const createEmptyDirections = () => ({
    total: 'same' as DiffDirection,
    free: 'same' as DiffDirection,
    paid: 'same' as DiffDirection,
    mrr: 'same' as DiffDirection
});

// Return default totals when no data available
const getDefaultTotals = () => ({
    totalMembers: 0,
    freeMembers: 0,
    paidMembers: 0,
    mrr: 0,
    percentChanges: createEmptyPercentChanges(),
    directions: createEmptyDirections()
});

// Calculate direction based on change value
const getDirection = (change: number): DiffDirection => {
    return change > 0 ? 'up' : change < 0 ? 'down' : 'same';
};

// Calculate total member percentage change
const calculateTotalMemberChange = (memberData: MemberStatusItem[], currentTotals: any) => {
    const first = memberData[0];
    const firstTotal = first.free + first.paid + first.comped;
    const currentTotal = currentTotals.free + currentTotals.paid + currentTotals.comped;

    if (firstTotal <= 0) {
        return {percentage: '0%', direction: 'same' as DiffDirection};
    }

    const change = ((currentTotal - firstTotal) / firstTotal) * 100;
    return {
        percentage: formatPercentage(change / 100),
        direction: getDirection(change)
    };
};

// Calculate free member percentage change
const calculateFreeMemberChange = (memberData: MemberStatusItem[], currentTotals: any) => {
    const first = memberData[0];

    if (first.free <= 0) {
        return {percentage: '0%', direction: 'same' as DiffDirection};
    }

    const change = ((currentTotals.free - first.free) / first.free) * 100;
    return {
        percentage: formatPercentage(change / 100),
        direction: getDirection(change)
    };
};

// Calculate paid member percentage change
const calculatePaidMemberChange = (memberData: MemberStatusItem[], currentTotals: any) => {
    const first = memberData[0];
    const firstPaidTotal = first.paid + first.comped;
    const currentPaidTotal = currentTotals.paid + currentTotals.comped;

    if (firstPaidTotal <= 0) {
        return {percentage: '0%', direction: 'same' as DiffDirection};
    }

    const change = ((currentPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
    return {
        percentage: formatPercentage(change / 100),
        direction: getDirection(change)
    };
};

// Determine first MRR value for change calculation
const getFirstMrrValue = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
    const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
                                moment(dateFrom).year() < moment().year();

    if (!firstActualPoint) {
        return isFromBeginningRange ? 0 : totalMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return isFromBeginningRange ? 0 : totalMrr;
};

// Calculate MRR percentage change
const calculateMrrChange = (firstMrr: number, totalMrr: number) => {
    const change = firstMrr === 0
        ? (totalMrr > 0 ? 100 : 0)
        : ((totalMrr - firstMrr) / firstMrr) * 100;

    return {
        percentage: formatPercentage(change / 100),
        direction: getDirection(change)
    };
};

// Calculate member percentage changes
const calculateMemberPercentChanges = (memberData: MemberStatusItem[], currentTotals: any) => {
    const percentChanges = createEmptyPercentChanges();
    const directions = createEmptyDirections();

    if (memberData.length <= 1) {
        return {percentChanges, directions};
    }

    const totalChange = calculateTotalMemberChange(memberData, currentTotals);
    percentChanges.total = totalChange.percentage;
    directions.total = totalChange.direction;

    const freeChange = calculateFreeMemberChange(memberData, currentTotals);
    percentChanges.free = freeChange.percentage;
    directions.free = freeChange.direction;

    const paidChange = calculatePaidMemberChange(memberData, currentTotals);
    percentChanges.paid = paidChange.percentage;
    directions.paid = paidChange.direction;

    return {percentChanges, directions};
};

// Calculate MRR percentage changes
const calculateMrrPercentChanges = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) => {
    const percentChanges = createEmptyPercentChanges();
    const directions = createEmptyDirections();

    if (mrrData.length <= 1) {
        return {percentChanges, directions};
    }

    const firstMrr = getFirstMrrValue(mrrData, dateFrom, totalMrr);
    const mrrChange = calculateMrrChange(firstMrr, totalMrr);
    percentChanges.mrr = mrrChange.percentage;
    directions.mrr = mrrChange.direction;

    return {percentChanges, directions};
};

// Calculate totals from member data
const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
    if (!memberData.length) {
        return getDefaultTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const memberChanges = calculateMemberPercentChanges(memberData, currentTotals);
    const mrrChanges = calculateMrrPercentChanges(mrrData, dateFrom, totalMrr);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges: {
            ...memberChanges.percentChanges,
            ...mrrChanges.percentChanges
        },
        directions: {
            ...memberChanges.directions,
            ...mrrChanges.directions
        }
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

// Extract member data from response
const extractMemberData = (memberCountResponse: any): MemberStatusItem[] => {
    if (memberCountResponse?.stats) {
        return memberCountResponse.stats;
    }
    if (Array.isArray(memberCountResponse)) {
        return memberCountResponse;
    }
    return [];
};

// Process member data for single day range
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

// Select currency with highest MRR
const selectHighestMrrCurrency = (totals: any[]) => {
    let currentMax = totals[0];
    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }
    return currentMax.currency;
};

// Filter MRR data by date range
const filterMrrByDateRange = (data: MrrHistoryItem[], dateFromMoment: moment.Moment): MrrHistoryItem[] => {
    return data.filter((item) => {
        return moment(item.date).isSameOrAfter(dateFromMoment);
    });
};

// Ensure start point exists in MRR data
const ensureMrrStartPoint = (result: MrrHistoryItem[], dateFromMoment: moment.Moment, allData: MrrHistoryItem[]) => {
    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (hasStartPoint) {
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

// Ensure end point exists in MRR data
const ensureMrrEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment) => {
    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
    if (hasEndPoint || result.length === 0) {
        return;
    }

    const sortedResult = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const mostRecentValue = sortedResult[0];

    result.push({
        ...mostRecentValue,
        date: endDateToCheck.format('YYYY-MM-DD')
    });
};

// Process MRR data
const processMrrData = (mrrHistoryResponse: any, dateFrom: string, range: number) => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const totals = mrrHistoryResponse.meta.totals;
    if (!totals[0]) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const useCurrency = selectHighestMrrCurrency(totals);
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = mrrHistoryResponse.stats.filter(d => d.currency === useCurrency);
    const filteredData = filterMrrByDateRange(currencyFilteredData, dateFromMoment);
    const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...filteredData];

    ensureMrrStartPoint(result, dateFromMoment, allData);
    ensureMrrEndPoint(result, dateToMoment);

    const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalResult, selectedCurrency: useCurrency};
};

// Merge subscription stats by date
const mergeSubscriptionStatsByDate = (stats: any[]) => {
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

// Filter subscription data by date range
const filterSubscriptionByDateRange = (subscriptionArray: any[], dateFrom: string, endDate: string) => {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = moment(endDate);
    return subscriptionArray.filter((item) => {
        const itemDate = moment(item.date);
        return itemDate.isSameOrAfter(dateFromMoment) && itemDate.isSameOrBefore(dateToMoment);
    });
};

// Process subscription data
const processSubscriptionData = (subscriptionStatsResponse: any, dateFrom: string, endDate: string) => {
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
        return range === 1 ? processSingleDayMemberData(rawData, dateFrom) : rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        return processMrrData(mrrHistoryResponse, dateFrom, range);
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => {
        return getSymbol(selectedCurrency);
    }, [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => {
        return processSubscriptionData(subscriptionStatsResponse, dateFrom, endDate);
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