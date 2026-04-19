import moment from 'moment';
import {
    MemberStatusItem,
    MrrHistoryItem,
    useMemberCountHistory,
    useMrrHistory,
    useSubscriptionStats
} from '@tryghost/admin-x-framework/api/stats';
import {
    formatNumber,
    formatPercentage,
    formatQueryDate,
    getRangeDates
} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Calculate percentage change and direction between two values.
 */
const computePercentChange = (
    oldValue: number,
    newValue: number
): { percent: string; direction: DiffDirection } => {
    if (oldValue === 0) {
        return { percent: '0%', direction: 'same' };
    }
    const change = ((newValue - oldValue) / oldValue) * 100;
    const percent = formatPercentage(change / 100);
    const direction: DiffDirection =
        change > 0 ? 'up' : change < 0 ? 'down' : 'same';
    return { percent, direction };
};

/**
 * Calculate MRR change and direction.
 */
const computeMrrChange = (
    firstMrr: number,
    totalMrr: number
): { percent: string; direction: DiffDirection } => {
    if (firstMrr === 0) {
        const percent = totalMrr > 0 ? '100%' : '0%';
        return { percent, direction: totalMrr > 0 ? 'up' : 'same' };
    }
    const change = ((totalMrr - firstMrr) / firstMrr) * 100;
    const percent = formatPercentage(change / 100);
    const direction: DiffDirection =
        change > 0 ? 'up' : change < 0 ? 'down' : 'same';
    return { percent, direction };
};

/**
 * Ensure MRR data contains points at the start and end of the range.
 */
const ensureMrrRangePoints = (
    data: MrrHistoryItem[],
    dateFrom: string,
    dateTo: string,
    range: number
): MrrHistoryItem[] => {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().startOf('day') : moment(dateTo);

    const sortedData = [...data].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const result = [...data];

    // Start point
    const hasStart = result.some((item) =>
        moment(item.date).isSame(dateFromMoment, 'day')
    );
    if (!hasStart) {
        const mostRecentBefore = sortedData.find((item) =>
            moment(item.date).isBefore(dateFromMoment)
        );
        if (mostRecentBefore) {
            result.unshift({
                ...mostRecentBefore,
                date: dateFromMoment.format('YYYY-MM-DD')
            });
        } else if (result.length > 0) {
            const earliest = [...result].sort(
                (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            )[0];
            result.unshift({
                ...earliest,
                date: dateFromMoment.format('YYYY-MM-DD')
            });
        }
    }

    // End point
    const hasEnd = result.some((item) =>
        moment(item.date).isSame(dateToMoment, 'day')
    );
    if (!hasEnd && result.length > 0) {
        const mostRecent = [...result].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )[0];
        result.push({
            ...mostRecent,
            date: dateToMoment.format('YYYY-MM-DD')
        });
    }

    return result.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
};

/**
 * Merge subscription stats by date.
 */
const mergeSubscriptionStatsByDate = (
    stats: Array<{ date: string; signups: number; cancellations: number }>
) => {
    const merged: Record<
        string,
        { date: string; signups: number; cancellations: number }
    > = {};

    stats.forEach((current) => {
        const dateKey = current.date;
        if (!merged[dateKey]) {
            merged[dateKey] = { date: dateKey, signups: 0, cancellations: 0 };
        }
        merged[dateKey].signups += current.signups;
        merged[dateKey].cancellations += current.cancellations;
    });

    return Object.values(merged).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
};

/**
 * Calculate totals and percentage changes.
 */
const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: { paid: number; free: number; comped: number }
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

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData[mrrData.length - 1] || { mrr: 0 };

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
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;
        if (firstTotal > 0) {
            const { percent, direction } = computePercentChange(
                firstTotal,
                totalMembers
            );
            percentChanges.total = percent;
            directions.total = direction;
        }

        if (first.free > 0) {
            const { percent, direction } = computePercentChange(
                first.free,
                latest.free
            );
            percentChanges.free = percent;
            directions.free = direction;
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latest.paid + latest.comped;
        if (firstPaidTotal > 0) {
            const { percent, direction } = computePercentChange(
                firstPaidTotal,
                latestPaidTotal
            );
            percentChanges.paid = percent;
            directions.paid = direction;
        }
    }

    if (mrrData.length > 1) {
        const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
        const firstActualPoint = mrrData.find((point) =>
            moment(point.date).isSameOrAfter(actualStartDate)
        );

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
        } else if (isFromBeginningRange) {
            firstMrr = 0;
        } else {
            firstMrr = totalMrr;
        }

        if (firstMrr >= 0) {
            const { percent, direction } = computeMrrChange(firstMrr, totalMrr);
            percentChanges.mrr = percent;
            directions.mrr = direction;
        }
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

/**
 * Format chart data for visualization.
 */
const formatChartData = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[]
) => {
    const sortedMemberData = [...memberData].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const sortedMrrData = [...mrrData].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const memberDates = sortedMemberData.map((item) => item.date);
    const mrrDates = sortedMrrData.map((item) => item.date);

    const allDates = [...new Set([...memberDates, ...mrrDates])].sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    const memberMap = new Map(sortedMemberData.map((item) => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map((item) => [item.date, item]));

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

export const useGrowthStats = (range: number) => {
    const { startDate, endDate } = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);

    const memberDataStartDate =
        range === 1
            ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD')
            : dateFrom;

    const { data: memberCountResponse, isLoading: isMemberCountLoading } =
        useMemberCountHistory({
            searchParams: { date_from: memberDataStartDate }
        });

    const { data: mrrHistoryResponse, isLoading: isMrrLoading } = useMrrHistory({
        searchParams: { date_from: memberDataStartDate }
    });

    const { data: subscriptionStatsResponse, isLoading: isSubscriptionLoading } =
        useSubscriptionStats();

    const memberData = useMemo(() => {
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
                { ...yesterdayData, date: startOfToday },
                { ...todayData, date: startOfTomorrow }
            ];
        }

        return rawData;
    }, [memberCountResponse, range, dateFrom]);

    const { mrrData, selectedCurrency } = useMemo(() => {
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

        if (mrrHistoryResponse?.stats && mrrHistoryResponse?.meta?.totals) {
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
            const currencyFilteredData = mrrHistoryResponse.stats.filter(
                (d) => d.currency === useCurrency
            );

            const filteredData = currencyFilteredData.filter((item) =>
                moment(item.date).isSameOrAfter(dateFromMoment)
            );

            const finalData = ensureMrrRangePoints(
                filteredData,
                dateFrom,
                dateToMoment.format('YYYY-MM-DD'),
                range
            );

            return { mrrData: finalData, selectedCurrency: useCurrency };
        }

        return { mrrData: [], selectedCurrency: 'usd' };
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(
        () => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals),
        [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]
    );

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(
        () => isMemberCountLoading || isMrrLoading || isSubscriptionLoading,
        [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]
    );

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        const merged = mergeSubscriptionStatsByDate(subscriptionStatsResponse.stats);

        const dateFromMoment = moment(dateFrom);
        const dateToMoment = moment(endDate);

        return merged.filter((item) => {
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