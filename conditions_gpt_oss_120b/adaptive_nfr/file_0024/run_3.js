import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

/**
 * Direction of a diff value.
 */
export type DiffDirection = 'up' | 'down' | 'same';

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
 * Guard predicate – true when array has at least one element.
 */
function hasData<T>(arr: T[]): arr is [T, ...T[]] {
    return arr.length > 0;
}

/**
 * Guard predicate – true when array has at least two elements.
 */
function hasMultiple<T>(arr: T[]): arr is [T, T, ...T[]] {
    return arr.length > 1;
}

/**
 * Calculates member and MRR totals and percentage changes.
 */
function calculateTotals(
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) {
    if (!hasData(memberData)) {
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
    const latestMember = memberData[memberData.length - 1];
    const latestMrr = hasData(mrrData) ? mrrData[mrrData.length - 1] : {mrr: 0};

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

    // Member changes
    if (hasMultiple(memberData)) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const totalChange = ((totalMembers - firstTotal) / firstTotal) * 100;
            percentChanges.total = formatPercentage(totalChange / 100);
            directions.total = getDirection(totalChange);
        }

        if (first.free > 0) {
            const freeChange = ((latestMember.free - first.free) / first.free) * 100;
            percentChanges.free = formatPercentage(freeChange / 100);
            directions.free = getDirection(freeChange);
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latestMember.paid + latestMember.comped;

        if (firstPaidTotal > 0) {
            const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
            percentChanges.paid = formatPercentage(paidChange / 100);
            directions.paid = getDirection(paidChange);
        }
    }

    // MRR changes
    if (hasMultiple(mrrData)) {
        const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
        const firstActualPoint = mrrData.find(p => moment(p.date).isSameOrAfter(actualStartDate));

        const isFromBeginningRange =
            moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
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

        const mrrChange = firstMrr === 0
            ? totalMrr > 0 ? 100 : 0
            : ((totalMrr - firstMrr) / firstMrr) * 100;

        percentChanges.mrr = formatPercentage(mrrChange / 100);
        directions.mrr = getDirection(mrrChange);
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
 * Formats chart data for members and MRR.
 */
function formatChartData(memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMemberData.map(i => i.date);
    const mrrDates = sortedMrrData.map(i => i.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const memberMap = new Map(sortedMemberData.map(i => [i.date, i]));
    const mrrMap = new Map(sortedMrrData.map(i => [i.date, i]));

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
 * Extracts member data from API response, handling single‑day edge cases.
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
 * Extracts MRR data and selects the currency with the highest total.
 */
function extractMrrData(
    response: any,
    range: number,
    dateFrom: string
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const totals = response.meta.totals;
    let top = totals[0];
    if (!top) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    for (const t of totals) {
        if (t.mrr > top.mrr) {
            top = t;
        }
    }

    const currency = top.currency;
    const filtered = response.stats.filter((d: any) => d.currency === currency);
    const afterStart = filtered.filter((item: any) => moment(item.date).isSameOrAfter(dateFromMoment));
    const allSortedDesc = [...filtered].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const result = [...afterStart];

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

    const endCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    const hasEnd = result.some(item => moment(item.date).isSame(endCheck, 'day'));
    if (!hasEnd && result.length) {
        const mostRecent = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        result.push({...mostRecent, date: endCheck.format('YYYY-MM-DD')});
    }

    const final = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: final, selectedCurrency: currency};
}

/**
 * Extracts subscription stats merged by date and limited to the requested range.
 */
function extractSubscriptionData(
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

    const array = Object.values(merged).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const from = moment(dateFrom);
    const to = moment(endDate);
    return array.filter(item => {
        const d = moment(item.date);
        return d.isSameOrAfter(from) && d.isSameOrBefore(to);
    });
}

/**
 * Hook providing growth statistics.
 */
export function useGrowthStats(range: number) {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);
    const memberStartDate = range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom;

    const {data: memberResp, isLoading: memberLoading} = useMemberCountHistory({
        searchParams: {date_from: memberStartDate}
    });

    const {data: mrrResp, isLoading: mrrLoading} = useMrrHistory({
        searchParams: {date_from: memberStartDate}
    });

    const {data: subResp, isLoading: subLoading} = useSubscriptionStats();

    const memberData = useMemo(() => extractMemberData(memberResp, range, dateFrom), [memberResp, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => extractMrrData(mrrResp, range, dateFrom), [mrrResp, range, dateFrom]);

    const totals = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberResp?.meta?.totals), [
        memberData,
        mrrData,
        dateFrom,
        memberResp?.meta?.totals
    ]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => memberLoading || mrrLoading || subLoading, [memberLoading, mrrLoading, subLoading]);

    const subscriptionData = useMemo(() => extractSubscriptionData(subResp, dateFrom, endDate), [subResp, dateFrom, endDate]);

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
}