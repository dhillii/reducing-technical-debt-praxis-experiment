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
function getCurrentTotals(
    memberData: MemberStatusItem[],
    metaTotals?: {paid: number; free: number; comped: number}
) {
    if (metaTotals) {
        return metaTotals;
    }
    const latest = memberData[memberData.length - 1] ?? {free: 0, paid: 0, comped: 0};
    return {
        free: latest.free,
        paid: latest.paid,
        comped: latest.comped
    };
}

/**
 * Compute percentage changes and direction indicators for member counts.
 */
function computeMemberChanges(
    memberData: MemberStatusItem[],
    currentTotals: {free: number; paid: number; comped: number}
) {
    const percentChanges = {
        total: '0%',
        free: '0%',
        paid: '0%',
        mrr: '0%'
    };
    const directions: Record<keyof typeof percentChanges, DiffDirection> = {
        total: 'same',
        free: 'same',
        paid: 'same',
        mrr: 'same'
    };

    if (memberData.length < 2) {
        return {percentChanges, directions};
    }

    const first = memberData[0];
    const firstTotal = first.free + first.paid + first.comped;
    const latest = memberData[memberData.length - 1];
    const latestPaidTotal = latest.paid + latest.comped;
    const firstPaidTotal = first.paid + first.comped;

    // Total members
    if (firstTotal > 0) {
        const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
        const totalChange = ((totalMembers - firstTotal) / firstTotal) * 100;
        percentChanges.total = formatPercentage(totalChange / 100);
        directions.total = totalChange > 0 ? 'up' : totalChange < 0 ? 'down' : 'same';
    }

    // Free members
    if (first.free > 0) {
        const freeChange = ((latest.free - first.free) / first.free) * 100;
        percentChanges.free = formatPercentage(freeChange / 100);
        directions.free = freeChange > 0 ? 'up' : freeChange < 0 ? 'down' : 'same';
    }

    // Paid + comped members
    if (firstPaidTotal > 0) {
        const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
        percentChanges.paid = formatPercentage(paidChange / 100);
        directions.paid = paidChange > 0 ? 'up' : paidChange < 0 ? 'down' : 'same';
    }

    return {percentChanges, directions};
}

/**
 * Compute MRR percentage change and direction.
 */
function computeMrrChanges(
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number
) {
    const percentChanges = {
        total: '0%',
        free: '0%',
        paid: '0%',
        mrr: '0%'
    };
    const directions: Record<keyof typeof percentChanges, DiffDirection> = {
        total: 'same',
        free: 'same',
        paid: 'same',
        mrr: 'same'
    };

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
        const mrrChange =
            firstMrr === 0 ? (totalMrr > 0 ? 100 : 0) : ((totalMrr - firstMrr) / firstMrr) * 100;
        percentChanges.mrr = formatPercentage(mrrChange / 100);
        directions.mrr = mrrChange > 0 ? 'up' : mrrChange < 0 ? 'down' : 'same';
    }

    return {percentChanges, directions};
}

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

    const {percentChanges: memberPercents, directions: memberDirs} = computeMemberChanges(
        memberData,
        currentTotals
    );
    const {percentChanges: mrrPercents, directions: mrrDirs} = computeMrrChanges(
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
            total: memberDirs.total,
            free: memberDirs.free,
            paid: memberDirs.paid,
            mrr: mrrDirs.mrr
        }
    };
};

/**
 * Format chart data – unchanged but extracted for clarity.
 */
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const sortedMrrData = [...mrrData].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const memberDates = sortedMemberData.map(i => i.date);
    const mrrDates = sortedMrrData.map(i => i.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])].sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    const memberMap = new Map(sortedMemberData.map(i => [i.date, i]));
    const mrrMap = new Map(sortedMrrData.map(i => [i.date, i]));

    return allDates.map(date => {
        const curMember = memberMap.get(date);
        if (curMember) lastMemberItem = curMember;

        const curMrr = mrrMap.get(date);
        if (curMrr) lastMrrItem = curMrr;

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
 * Extract raw member data handling single‑day edge case.
 */
function extractMemberData(
    response: any,
    range: number,
    dateFrom: string
): MemberStatusItem[] {
    let raw: MemberStatusItem[] = [];

    if (response?.stats) {
        raw = response.stats;
    } else if (Array.isArray(response)) {
        raw = response;
    }

    if (range === 1 && raw.length >= 2) {
        const yesterday = raw[raw.length - 2];
        const today = raw[raw.length - 1];
        const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
        const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

        return [
            {...yesterday, date: startOfToday},
            {...today, date: startOfTomorrow}
        ];
    }

    return raw;
}

/**
 * Choose the currency with the highest total MRR and filter data accordingly.
 */
function selectCurrency(mrrResponse: any) {
    const totals = mrrResponse?.meta?.totals;
    if (!totals?.length) {
        return {currency: 'usd', data: [] as MrrHistoryItem[]};
    }

    let max = totals[0];
    for (const t of totals) {
        if (t.mrr > max.mrr) max = t;
    }

    const filtered = mrrResponse.stats.filter((d: any) => d.currency === max.currency);
    return {currency: max.currency, data: filtered as MrrHistoryItem[]};
}

/**
 * Ensure the MRR series contains explicit start and end points for the range.
 */
function normalizeMrrSeries(
    data: MrrHistoryItem[],
    dateFrom: string,
    range: number
): MrrHistoryItem[] {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const afterStart = data.filter(item =>
        moment(item.date).isSameOrAfter(dateFromMoment)
    );

    const sortedAll = [...data].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const result = [...afterStart];

    // start point
    const hasStart = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!hasStart) {
        const before = sortedAll.find(item => moment(item.date).isBefore(dateFromMoment));
        if (before) {
            result.unshift({...before, date: dateFromMoment.format('YYYY-MM-DD')});
        } else if (result.length) {
            const earliest = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
            result.unshift({...earliest, date: dateFromMoment.format('YYYY-MM-DD')});
        }
    }

    // end point
    const endCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    const hasEnd = result.some(item => moment(item.date).isSame(endCheck, 'day'));
    if (!hasEnd && result.length) {
        const mostRecent = [...result].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )[0];
        result.push({...mostRecent, date: endCheck.format('YYYY-MM-DD')});
    }

    return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Merge subscription stats by date and filter to the requested range.
 */
function mergeSubscriptionStats(
    response: any,
    dateFrom: string,
    endDate: string
) {
    if (!response?.stats) {
        return [];
    }

    const merged = response.stats.reduce((acc: Record<string, {date: string; signups: number; cancellations: number}>, cur: any) => {
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
}

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

    const memberData = useMemo(
        () => extractMemberData(memberCountResponse, range, dateFrom),
        [memberCountResponse, range, dateFrom]
    );

    const {mrrData, selectedCurrency} = useMemo(() => {
        if (!mrrHistoryResponse?.stats) {
            return {mrrData: [] as MrrHistoryItem[], selectedCurrency: 'usd'};
        }
        const {currency, data} = selectCurrency(mrrHistoryResponse);
        const normalized = normalizeMrrSeries(data, dateFrom, range);
        return {mrrData: normalized, selectedCurrency: currency};
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

    const subscriptionData = useMemo(
        () => mergeSubscriptionStats(subscriptionStatsResponse, dateFrom, endDate),
        [subscriptionStatsResponse, dateFrom, endDate]
    );

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