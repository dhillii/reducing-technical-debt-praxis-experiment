import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

/** Direction of a diff */
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Guard: check if an array is empty
 */
function isEmptyArray<T>(arr: T[]): boolean {
    return arr.length === 0;
}

/**
 * Guard: check if a number is greater than zero
 */
function isPositive(num: number): boolean {
    return num > 0;
}

/**
 * Compute direction based on a numeric change
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
 * Compute percentage string from a change value
 */
function formatChangePercentage(change: number): string {
    return formatPercentage(change / 100);
}

/**
 * Extract the first element of an array safely
 */
function getFirst<T>(arr: T[]): T | undefined {
    return arr[0];
}

/**
 * Extract the last element of an array safely
 */
function getLast<T>(arr: T[]): T | undefined {
    return arr[arr.length - 1];
}

/**
 * Calculate member and MRR totals together with percent changes and directions.
 */
function calculateTotals(
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) {
    if (isEmptyArray(memberData)) {
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

    const currentTotals = memberCountTotals ?? getLast(memberData)!;
    const latestMember = getLast(memberData)!;
    const latestMrr = getLast(mrrData) ?? {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const {percentChanges: memberPercent, directions: memberDir} = computeMemberChanges(
        memberData,
        totalMembers,
        currentTotals,
        latestMember
    );

    const {percentChanges: mrrPercent, directions: mrrDir} = computeMrrChanges(
        mrrData,
        dateFrom,
        totalMrr
    );

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges: {
            total: memberPercent.total,
            free: memberPercent.free,
            paid: memberPercent.paid,
            mrr: mrrPercent.mrr
        },
        directions: {
            total: memberDir.total,
            free: memberDir.free,
            paid: memberDir.paid,
            mrr: mrrDir.mrr
        }
    };
}

/**
 * Compute member related percent changes and directions.
 */
function computeMemberChanges(
    memberData: MemberStatusItem[],
    totalMembers: number,
    currentTotals: {free: number; paid: number; comped: number},
    latestMember: MemberStatusItem
) {
    const percentChanges = {
        total: '0%',
        free: '0%',
        paid: '0%'
    };
    const directions = {
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection
    };

    if (memberData.length <= 1) {
        return {percentChanges, directions};
    }

    const first = getFirst(memberData)!;
    const firstTotal = first.free + first.paid + first.comped;

    if (isPositive(firstTotal)) {
        const totalChange = ((totalMembers - firstTotal) / firstTotal) * 100;
        percentChanges.total = formatChangePercentage(totalChange);
        directions.total = getDirection(totalChange);
    }

    if (isPositive(first.free)) {
        const freeChange = ((latestMember.free - first.free) / first.free) * 100;
        percentChanges.free = formatChangePercentage(freeChange);
        directions.free = getDirection(freeChange);
    }

    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latestMember.paid + latestMember.comped;

    if (isPositive(firstPaidTotal)) {
        const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
        percentChanges.paid = formatChangePercentage(paidChange);
        directions.paid = getDirection(paidChange);
    }

    return {percentChanges, directions};
}

/**
 * Compute MRR related percent changes and directions.
 */
function computeMrrChanges(
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number
) {
    const percentChanges = {mrr: '0%'};
    const directions = {mrr: 'same' as DiffDirection};

    if (mrrData.length <= 1) {
        return {percentChanges, directions};
    }

    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));

    const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
        moment(dateFrom).year() < moment().year();

    let firstMrr = 0;

    if (firstActualPoint) {
        if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
            firstMrr = firstActualPoint.mrr;
        } else if (isFromBeginningRange) {
            firstMrr = 0;
        } else {
            firstMrr = totalMrr;
        }
    } else if (isFromBeginningRange) {
        firstMrr = 0;
    } else {
        firstMrr = totalMrr;
    }

    if (firstMrr >= 0) {
        const mrrChange = firstMrr === 0
            ? (totalMrr > 0 ? 100 : 0)
            : ((totalMrr - firstMrr) / firstMrr) * 100;

        percentChanges.mrr = formatChangePercentage(mrrChange);
        directions.mrr = getDirection(mrrChange);
    }

    return {percentChanges, directions};
}

/**
 * Format chart data for member and MRR series.
 */
function formatChartData(memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) {
    const sortedMember = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrr = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMember.map(i => i.date);
    const mrrDates = sortedMrr.map(i => i.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const memberMap = new Map(sortedMember.map(i => [i.date, i]));
    const mrrMap = new Map(sortedMrr.map(i => [i.date, i]));

    let lastMember: MemberStatusItem | null = null;
    let lastMrr: MrrHistoryItem | null = null;

    return allDates.map(date => {
        const curMember = memberMap.get(date);
        if (curMember) {
            lastMember = curMember;
        }

        const curMrr = mrrMap.get(date);
        if (curMrr) {
            lastMrr = curMrr;
        }

        const free = lastMember?.free ?? 0;
        const paid = lastMember?.paid ?? 0;
        const comped = lastMember?.comped ?? 0;
        const paidTotal = paid + comped;
        const value = free + paidTotal;
        const mrr = lastMrr?.mrr ?? 0;
        const paidSubscribed = lastMember?.paid_subscribed ?? 0;
        const paidCanceled = lastMember?.paid_canceled ?? 0;

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
 * Extract member data handling single‑day edge case.
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
        const yesterday = rawData[rawData.length - 2];
        const today = rawData[rawData.length - 1];

        const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
        const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

        return [
            {...yesterday, date: startOfToday},
            {...today, date: startOfTomorrow}
        ];
    }

    return rawData;
}

/**
 * Extract MRR data for the selected currency and ensure start/end points.
 */
function extractMrrData(
    mrrHistoryResponse: any,
    dateFrom: string,
    range: number
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

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
    const currencyFiltered = mrrHistoryResponse.stats.filter((d: any) => d.currency === useCurrency);
    const filtered = currencyFiltered.filter((item: MrrHistoryItem) =>
        moment(item.date).isSameOrAfter(dateFromMoment)
    );

    const allSortedDesc = [...currencyFiltered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...filtered];

    // Ensure start point
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

    // Ensure end point
    const endCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    const hasEnd = result.some(item => moment(item.date).isSame(endCheck, 'day'));
    if (!hasEnd && result.length > 0) {
        const mostRecent = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        result.push({...mostRecent, date: endCheck.format('YYYY-MM-DD')});
    }

    const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalResult, selectedCurrency: useCurrency};
}

/**
 * Extract subscription data merged by date and limited to the requested range.
 */
function extractSubscriptionData(
    subscriptionStatsResponse: any,
    dateFrom: string,
    endDate: string
) {
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

    const array = Object.values(merged).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const fromMoment = moment(dateFrom);
    const toMoment = moment(endDate);

    return array.filter(item => {
        const d = moment(item.date);
        return d.isSameOrAfter(fromMoment) && d.isSameOrBefore(toMoment);
    });
}

/**
 * Hook providing growth statistics.
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

    const memberData = useMemo(() => extractMemberData(memberCountResponse, range, dateFrom), [
        memberCountResponse,
        range,
        dateFrom
    ]);

    const {mrrData, selectedCurrency} = useMemo(() => extractMrrData(mrrHistoryResponse, dateFrom, range), [
        mrrHistoryResponse,
        dateFrom,
        range
    ]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [
        memberData,
        mrrData,
        dateFrom,
        memberCountResponse?.meta?.totals
    ]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [
        isMemberCountLoading,
        isMrrLoading,
        isSubscriptionLoading
    ]);

    const subscriptionData = useMemo(() => extractSubscriptionData(subscriptionStatsResponse, dateFrom, endDate), [
        subscriptionStatsResponse,
        dateFrom,
        endDate
    ]);

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