import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

/**
 * Direction of a numeric change.
 */
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Guard: checks if member data array is empty.
 */
function isEmptyMemberData(data: MemberStatusItem[]): boolean {
    return data.length === 0;
}

/**
 * Guard: checks if there are at least two data points.
 */
function hasMultipleMemberData(data: MemberStatusItem[]): boolean {
    return data.length > 1;
}

/**
 * Returns the direction based on a numeric change.
 */
function getDirection(change: number): DiffDirection {
    if (change > 0) {
        return 'up';
    }
    if (change < 0) {
        return 'down';
    }
    return 'same';
}

/**
 * Formats a percentage change for display.
 */
function formatChangePercentage(change: number): string {
    return formatPercentage(change / 100);
}

/**
 * Initializes a percent changes object with zero values.
 */
function initPercentChanges() {
    return {
        total: '0%',
        free: '0%',
        paid: '0%',
        mrr: '0%'
    };
}

/**
 * Initializes a directions object with "same" values.
 */
function initDirections() {
    return {
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection,
        mrr: 'same' as DiffDirection
    };
}

/**
 * Calculates MRR start value based on range characteristics.
 */
function determineFirstMrr(
    firstActualPoint: MrrHistoryItem | undefined,
    isFromBeginningRange: boolean,
    totalMrr: number,
    actualStartDate: string
): number {
    if (firstActualPoint) {
        if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
            return firstActualPoint.mrr;
        }
        if (isFromBeginningRange) {
            return 0;
        }
        return totalMrr;
    }
    if (isFromBeginningRange) {
        return 0;
    }
    return totalMrr;
}

/**
 * Computes MRR percentage change and direction.
 */
function computeMrrChanges(
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number
) {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));

    const isFromBeginningRange =
        moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
        moment(dateFrom).year() < moment().year();

    const firstMrr = determineFirstMrr(firstActualPoint, isFromBeginningRange, totalMrr, actualStartDate);

    if (firstMrr < 0) {
        return {percentChanges: {mrr: '0%'}, directions: {mrr: 'same' as DiffDirection}};
    }

    const mrrChange = firstMrr === 0 ? (totalMrr > 0 ? 100 : 0) : ((totalMrr - firstMrr) / firstMrr) * 100;
    return {
        percentChanges: {mrr: formatChangePercentage(mrrChange)},
        directions: {mrr: getDirection(mrrChange)}
    };
}

/**
 * Calculates totals, percent changes, and direction indicators.
 */
function calculateTotals(
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) {
    if (isEmptyMemberData(memberData)) {
        return {
            totalMembers: 0,
            freeMembers: 0,
            paidMembers: 0,
            mrr: 0,
            percentChanges: initPercentChanges(),
            directions: initDirections()
        };
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latestMember = memberData[memberData.length - 1] ?? {free: 0, paid: 0, comped: 0};
    const latestMrr = mrrData[mrrData.length - 1] ?? {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const percentChanges = initPercentChanges();
    const directions = initDirections();

    if (hasMultipleMemberData(memberData)) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const totalChange = ((totalMembers - firstTotal) / firstTotal) * 100;
            percentChanges.total = formatChangePercentage(totalChange);
            directions.total = getDirection(totalChange);
        }

        if (first.free > 0) {
            const freeChange = ((latestMember.free - first.free) / first.free) * 100;
            percentChanges.free = formatChangePercentage(freeChange);
            directions.free = getDirection(freeChange);
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latestMember.paid + latestMember.comped;

        if (firstPaidTotal > 0) {
            const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
            percentChanges.paid = formatChangePercentage(paidChange);
            directions.paid = getDirection(paidChange);
        }
    }

    if (mrrData.length > 1) {
        const {percentChanges: mrrPercent, directions: mrrDir} = computeMrrChanges(mrrData, dateFrom, totalMrr);
        percentChanges.mrr = mrrPercent.mrr;
        directions.mrr = mrrDir.mrr;
    }

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges,
        directions
    };
}

/**
 * Formats chart data for member and MRR series.
 */
function formatChartData(memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMemberData.map(item => item.date);
    const mrrDates = sortedMrrData.map(item => item.date);

    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

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
}

/**
 * Extracts member data from the API response, handling single‑day ranges.
 */
function extractMemberData(
    memberCountResponse: any,
    range: number,
    dateFrom: string
): MemberStatusItem[] {
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
}

/**
 * Determines the currency with the highest total MRR and returns filtered data.
 */
function extractMrrData(
    mrrHistoryResponse: any,
    dateFrom: string,
    range: number
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const totals = mrrHistoryResponse.meta.totals;
    let currentMax = totals[0];
    if (!currentMax) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }

    const useCurrency = currentMax.currency;
    const currencyFiltered = mrrHistoryResponse.stats.filter((d: MrrHistoryItem) => d.currency === useCurrency);
    const dateFromMoment = moment(dateFrom);
    const filtered = currencyFiltered.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));

    const allSortedDesc = [...currencyFiltered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...filtered];

    const hasStart = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!hasStart) {
        const before = allSortedDesc.find(item => moment(item.date).isBefore(dateFromMoment));
        if (before) {
            result.unshift({...before, date: dateFromMoment.format('YYYY-MM-DD')});
        } else if (result.length > 0) {
            const earliest = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
            result.unshift({...earliest, date: dateFromMoment.format('YYYY-MM-DD')});
        }
    }

    const endCheck = range === 1 ? moment().startOf('day') : moment().startOf('day');
    const hasEnd = result.some(item => moment(item.date).isSame(endCheck, 'day'));
    if (!hasEnd && result.length > 0) {
        const mostRecent = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        result.push({...mostRecent, date: endCheck.format('YYYY-MM-DD')});
    }

    const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalResult, selectedCurrency: useCurrency};
}

/**
 * Merges and filters subscription stats into a date‑range array.
 */
function extractSubscriptionData(
    subscriptionStatsResponse: any,
    dateFrom: string,
    endDate: string
) {
    if (!subscriptionStatsResponse?.stats) {
        return [];
    }

    const merged = subscriptionStatsResponse.stats.reduce((acc: Record<string, {date: string; signups: number; cancellations: number}>, cur) => {
        const key = cur.date;
        if (!acc[key]) {
            acc[key] = {date: key, signups: 0, cancellations: 0};
        }
        acc[key].signups += cur.signups;
        acc[key].cancellations += cur.cancellations;
        return acc;
    }, {});

    const array = Object.values(merged).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const fromMoment = moment(dateFrom);
    const toMoment = moment(endDate);
    return array.filter(item => {
        const itemDate = moment(item.date);
        return itemDate.isSameOrAfter(fromMoment) && itemDate.isSameOrBefore(toMoment);
    });
}

/**
 * Hook that provides growth statistics for a given date range.
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

    const memberData = useMemo(() => extractMemberData(memberCountResponse, range, dateFrom), [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => extractMrrData(mrrHistoryResponse, dateFrom, range), [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => extractSubscriptionData(subscriptionStatsResponse, dateFrom, endDate), [subscriptionStatsResponse, dateFrom, endDate]);

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