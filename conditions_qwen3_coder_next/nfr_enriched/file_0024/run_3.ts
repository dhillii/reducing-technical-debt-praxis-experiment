import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

// Helper function to calculate percent change and direction
const calculatePercentChange = (current: number, previous: number): { percent: string; direction: DiffDirection } => {
    if (previous === 0) {
        return {
            percent: current > 0 ? '100%' : '0%',
            direction: current > 0 ? 'up' : 'same'
        };
    }

    const change = ((current - previous) / previous) * 100;
    return {
        percent: formatPercentage(change / 100),
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same'
    };
};

// Helper function to determine first MRR value for difference calculation
const getFirstMrrValue = (mrrData: MrrHistoryItem[], dateFrom: string, isFromBeginningRange: boolean): number => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));

    if (firstActualPoint && moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    } else if (isFromBeginningRange) {
        return 0;
    } else if (firstActualPoint) {
        return mrrData[mrrData.length - 1]?.mrr || 0;
    } else {
        return mrrData[mrrData.length - 1]?.mrr || 0;
    }
};

// Calculate totals from member data
const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: { paid: number; free: number; comped: number }) => {
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

    // Use current totals from API meta if available (like Ember), otherwise use latest time series data
    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData.length > 0 ? memberData[memberData.length - 1] : {free: 0, paid: 0, comped: 0};
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    // Calculate percent changes
    const percentChanges = { total: '0%', free: '0%', paid: '0%', mrr: '0%' };
    const directions = { total: 'same', free: 'same', paid: 'same', mrr: 'same' } as const;

    if (memberData.length > 1) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const change = calculatePercentChange(totalMembers, firstTotal);
            percentChanges.total = change.percent;
            directions.total = change.direction;
        }

        if (first.free > 0) {
            const change = calculatePercentChange(latest.free, first.free);
            percentChanges.free = change.percent;
            directions.free = change.direction;
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latest.paid + latest.comped;

        if (firstPaidTotal > 0) {
            const change = calculatePercentChange(latestPaidTotal, firstPaidTotal);
            percentChanges.paid = change.percent;
            directions.paid = change.direction;
        }
    }

    if (mrrData.length > 1) {
        const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
                                     moment(dateFrom).year() < moment().year();
        const firstMrr = getFirstMrrValue(mrrData, dateFrom, isFromBeginningRange);

        const change = calculatePercentChange(totalMrr, firstMrr);
        percentChanges.mrr = change.percent;
        directions.mrr = change.direction;
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

// Normalize member data to ensure consistent structure for special ranges like "Today"
const normalizeMemberData = (memberData: MemberStatusItem[], range: number, dateFrom: string): MemberStatusItem[] => {
    if (range !== 1 || memberData.length < 2) {
        return memberData;
    }

    const yesterdayData = memberData[memberData.length - 2];
    const todayData = memberData[memberData.length - 1];
    const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
    const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

    return [
        { ...yesterdayData, date: startOfToday },
        { ...todayData, date: startOfTomorrow }
    ];
};

// Extract MRR data for the selected currency and apply boundary points
const extractMrrData = (mrrHistoryResponse: any, dateFrom: string, range: number): { mrrData: MrrHistoryItem[]; selectedCurrency: string } => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return { mrrData: [], selectedCurrency: 'usd' };
    }

    const totals = mrrHistoryResponse.meta.totals;
    let currentMax = totals[0];

    if (!currentMax) {
        return { mrrData: [], selectedCurrency: 'usd' };
    }

    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }

    const useCurrency = currentMax.currency;
    const currencyFilteredData = mrrHistoryResponse.stats.filter((d: MrrHistoryItem) => d.currency === useCurrency);
    const dateFromMoment = moment(dateFrom);

    const filteredData = currencyFilteredData.filter((item) => moment(item.date).isSameOrAfter(dateFromMoment));

    const sortedAllData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let result = [...filteredData];
    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));

    if (!hasStartPoint) {
        const mostRecentBeforeRange = sortedAllData.find((item) => moment(item.date).isBefore(dateFromMoment));
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
    }

    const endDateToCheck = range === 1 ? moment().startOf('day') : moment().endOf('day');
    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));

    if (!hasEndPoint && result.length > 0) {
        const sortedResult = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const mostRecentValue = sortedResult[0];

        result.push({
            ...mostRecentValue,
            date: endDateToCheck.format('YYYY-MM-DD')
        });
    }

    const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { mrrData: finalResult, selectedCurrency: useCurrency };
};

// Aggregate subscription stats by date
const aggregateSubscriptionStats = (stats: any[]): {date: string; signups: number; cancellations: number}[] => {
    const merged: Record<string, {date: string; signups: number; cancellations: number}> = {};

    for (const current of stats) {
        const { date, signups, cancellations } = current;
        if (!merged[date]) {
            merged[date] = { date, signups: 0, cancellations: 0 };
        }
        merged[date].signups += signups;
        merged[date].cancellations += cancellations;
    }

    return Object.values(merged).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
        let rawData: MemberStatusItem[] = [];

        if (memberCountResponse?.stats) {
            rawData = memberCountResponse.stats;
        } else if (Array.isArray(memberCountResponse)) {
            rawData = memberCountResponse;
        }

        return normalizeMemberData(rawData, range, dateFrom);
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        return extractMrrData(mrrHistoryResponse, dateFrom, range);
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        const aggregated = aggregateSubscriptionStats(subscriptionStatsResponse.stats);
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = moment(endDate);

        return aggregated.filter((item) => {
            const itemDate = moment(item.date);
            return itemDate.isSameOrAfter(dateFromMoment) && itemDate.isSameOrBefore(dateToMoment);
        });
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