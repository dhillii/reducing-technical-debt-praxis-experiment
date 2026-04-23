import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Extract current totals either from API meta or the latest time‑series entry.
 */
const getCurrentTotals = (
    memberData: MemberStatusItem[],
    memberCountTotals?: {paid: number; free: number; comped: number}
) => {
    if (memberCountTotals) {
        return memberCountTotals;
    }
    const latest = memberData[memberData.length - 1] ?? {free: 0, paid: 0, comped: 0};
    return {free: latest.free, paid: latest.paid, comped: latest.comped};
};

/**
 * Compute percentage changes and direction for member counts.
 */
const computeMemberPercentChanges = (
    memberData: MemberStatusItem[],
    currentTotals: {free: number; paid: number; comped: number}
) => {
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

    if (memberData.length < 2) {
        return {percentChanges, directions};
    }

    const first = memberData[0];
    const firstTotal = first.free + first.paid + first.comped;
    const latest = memberData[memberData.length - 1];
    const latestPaidTotal = latest.paid + latest.comped;
    const firstPaidTotal = first.paid + first.comped;

    if (firstTotal > 0) {
        const totalChange = ((currentTotals.free + currentTotals.paid + currentTotals.comped - firstTotal) / firstTotal) * 100;
        percentChanges.total = formatPercentage(totalChange / 100);
        directions.total = totalChange > 0 ? 'up' : totalChange < 0 ? 'down' : 'same';
    }

    if (first.free > 0) {
        const freeChange = ((currentTotals.free - first.free) / first.free) * 100;
        percentChanges.free = formatPercentage(freeChange / 100);
        directions.free = freeChange > 0 ? 'up' : freeChange < 0 ? 'down' : 'same';
    }

    if (firstPaidTotal > 0) {
        const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
        percentChanges.paid = formatPercentage(paidChange / 100);
        directions.paid = paidChange > 0 ? 'up' : paidChange < 0 ? 'down' : 'same';
    }

    return {percentChanges, directions};
};

/**
 * Compute MRR percentage change and direction.
 */
const computeMrrPercentChange = (
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number
) => {
    const percentChanges = {mrr: '0%'};
    const directions = {mrr: 'same' as DiffDirection};

    if (mrrData.length < 2) {
        return {percentChanges, directions};
    }

    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(p => moment(p.date).isSameOrAfter(actualStartDate));

    const isFromBeginningRange =
        moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
        moment(dateFrom).year() < moment().year();

    let firstMrr = 0;

    if (firstActualPoint) {
        if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
            firstMrr = firstActualPoint.mrr;
        } else {
            firstMrr = isFromBeginningRange ? 0 : totalMrr;
        }
    } else {
        firstMrr = isFromBeginningRange ? 0 : totalMrr;
    }

    if (firstMrr >= 0) {
        const mrrChange = firstMrr === 0 ? (totalMrr > 0 ? 100 : 0) : ((totalMrr - firstMrr) / firstMrr) * 100;
        percentChanges.mrr = formatPercentage(mrrChange / 100);
        directions.mrr = mrrChange > 0 ? 'up' : mrrChange < 0 ? 'down' : 'same';
    }

    return {percentChanges, directions};
};

/**
 * Main totals calculation – delegates to smaller helpers.
 */
const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) => {
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

    const currentTotals = getCurrentTotals(memberData, memberCountTotals);
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const latestMrr = mrrData[mrrData.length - 1]?.mrr ?? 0;

    const {percentChanges: memberPercents, directions: memberDirections} = computeMemberPercentChanges(
        memberData,
        currentTotals
    );

    const {percentChanges: mrrPercents, directions: mrrDirections} = computeMrrPercentChange(
        mrrData,
        dateFrom,
        latestMrr
    );

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: latestMrr,
        percentChanges: {
            total: memberPercents.total,
            free: memberPercents.free,
            paid: memberPercents.paid,
            mrr: mrrPercents.mrr
        },
        directions: {
            total: memberDirections.total,
            free: memberDirections.free,
            paid: memberDirections.paid,
            mrr: mrrDirections.mrr
        }
    };
};

/**
 * Format chart data – unchanged but extracted for clarity.
 */
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMemberData.map(item => item.date);
    const mrrDates = sortedMrrData.map(item => item.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])].sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

    return allDates.map(date => {
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
 * Extract member data handling single‑day edge case.
 */
const useMemberData = (
    memberCountResponse: any,
    range: number,
    dateFrom: string
) => {
    return useMemo(() => {
        let rawData: MemberStatusItem[] = [];

        if (memberCountResponse?.stats) {
            rawData = memberCountResponse.stats;
        } else if (Array.isArray(memberCountResponse)) {
            rawData = memberCountResponse;
        }

        if (range === 1 && rawData.length >= 2) {
            const yesterdayData = rawData[rawData.length - 2];
            const todayData = rawData[rawData.length - 1];

            const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
            const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

            return [
                {...yesterdayData, date: startOfToday},
                {...todayData, date: startOfTomorrow}
            ];
        }

        return rawData;
    }, [memberCountResponse, range, dateFrom]);
};

/**
 * Process MRR history, select currency and ensure range boundaries.
 */
const useMrrData = (
    mrrHistoryResponse: any,
    range: number,
    dateFrom: string
) => {
    return useMemo(() => {
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

        if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        // Choose currency with highest total MRR
        const totals = mrrHistoryResponse.meta.totals;
        let top = totals[0] ?? {currency: 'usd', mrr: 0};
        for (const t of totals) {
            if (t.mrr > top.mrr) {
                top = t;
            }
        }
        const useCurrency = top.currency;

        // Filter to selected currency and date range
        const currencyData = mrrHistoryResponse.stats.filter((d: any) => d.currency === useCurrency);
        const filtered = currencyData.filter((item: any) =>
            moment(item.date).isSameOrAfter(dateFromMoment)
        );

        // Ensure start point exists
        const allSortedDesc = [...currencyData].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const result = [...filtered];
        const hasStart = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
        if (!hasStart) {
            const before = allSortedDesc.find(item => moment(item.date).isBefore(dateFromMoment));
            if (before) {
                result.unshift({...before, date: dateFromMoment.format('YYYY-MM-DD')});
            } else if (result.length) {
                const earliest = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
                result.unshift({...earliest, date: dateFromMoment.format('YYYY-MM-DD')});
            }
        }

        // Ensure end point exists
        const endCheck = range === 1 ? moment().startOf('day') : dateToMoment;
        const hasEnd = result.some(item => moment(item.date).isSame(endCheck, 'day'));
        if (!hasEnd && result.length) {
            const mostRecent = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            result.push({...mostRecent, date: endCheck.format('YYYY-MM-DD')});
        }

        const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return {mrrData: finalResult, selectedCurrency: useCurrency};
    }, [mrrHistoryResponse, dateFrom, range]);
};

/**
 * Merge and filter subscription stats for the selected date range.
 */
const useSubscriptionData = (
    subscriptionStatsResponse: any,
    dateFrom: string,
    endDate: string
) => {
    return useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        const merged = subscriptionStatsResponse.stats.reduce((acc: Record<string, {date: string; signups: number; cancellations: number}>, cur: any) => {
            const key = cur.date;
            if (!acc[key]) {
                acc[key] = {date: key, signups: 0, cancellations: 0};
            }
            acc[key].signups += cur.signups;
            acc[key].cancellations += cur.cancellations;
            return acc;
        }, {});

        const array = Object.values(merged).sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        const from = moment(dateFrom);
        const to = moment(endDate);
        return array.filter(item => {
            const d = moment(item.date);
            return d.isSameOrAfter(from) && d.isSameOrBefore(to);
        });
    }, [subscriptionStatsResponse, dateFrom, endDate]);
};

/**
 * Hook exposing growth statistics.
 */
export const useGrowthStats = (range: number) => {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);
    const memberDataStartDate = range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom;

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemberData(memberCountResponse, range, dateFrom);
    const {mrrData, selectedCurrency} = useMrrData(mrrHistoryResponse, range, dateFrom);
    const totals = useMemo(
        () => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals),
        [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]
    );
    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);
    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);
    const isLoading = useMemo(
        () => isMemberCountLoading || isMrrLoading || isSubscriptionLoading,
        [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]
    );
    const subscriptionData = useSubscriptionData(subscriptionStatsResponse, dateFrom, endDate);

    return {
        isLoading,
        memberData,
        mrrData,
        dateFrom,
        endDate,
        totals,
        chartData,
        subscriptionData,
        selectedCurrency,
        currencySymbol
    };
};