import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Calculate totals and percentage changes from member and MRR data.
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

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const percentChanges = {total: '0%', free: '0%', paid: '0%', mrr: '0%'};
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
            const totalChange = ((totalMembers - firstTotal) / firstTotal) * 100;
            percentChanges.total = formatPercentage(totalChange / 100);
            directions.total = totalChange > 0 ? 'up' : totalChange < 0 ? 'down' : 'same';
        }

        if (first.free > 0) {
            const freeChange = ((latest.free - first.free) / first.free) * 100;
            percentChanges.free = formatPercentage(freeChange / 100);
            directions.free = freeChange > 0 ? 'up' : freeChange < 0 ? 'down' : 'same';
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latest.paid + latest.comped;

        if (firstPaidTotal > 0) {
            const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
            percentChanges.paid = formatPercentage(paidChange / 100);
            directions.paid = paidChange > 0 ? 'up' : paidChange < 0 ? 'down' : 'same';
        }
    }

    if (mrrData.length > 1) {
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

        if (firstMrr >= 0) {
            const mrrChange = firstMrr === 0 ? (totalMrr > 0 ? 100 : 0) : ((totalMrr - firstMrr) / firstMrr) * 100;
            percentChanges.mrr = formatPercentage(mrrChange / 100);
            directions.mrr = mrrChange > 0 ? 'up' : mrrChange < 0 ? 'down' : 'same';
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
 * Merge and fill member & MRR series so both share the same date axis.
 */
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMember = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrr = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMember.map(i => i.date);
    const mrrDates = sortedMrr.map(i => i.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])].sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    const memberMap = new Map(sortedMember.map(i => [i.date, i]));
    const mrrMap = new Map(sortedMrr.map(i => [i.date, i]));

    let lastMember: MemberStatusItem | null = null;
    let lastMrr: MrrHistoryItem | null = null;

    return allDates.map(date => {
        const curMember = memberMap.get(date);
        if (curMember) lastMember = curMember;

        const curMrr = mrrMap.get(date);
        if (curMrr) lastMrr = curMrr;

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
};

/**
 * Extract member data from API response and handle single‑day edge case.
 */
const extractMemberData = (
    response: any,
    range: number,
    dateFrom: string
): MemberStatusItem[] => {
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
};

/**
 * Determine the currency with the highest total MRR and return filtered series.
 */
const extractMrrData = (
    response: any,
    dateFrom: string,
    range: number
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    // Choose currency with max total MRR
    const totals = response.meta.totals;
    let max = totals[0] ?? {currency: 'usd', mrr: 0};
    for (const t of totals) {
        if (t.mrr > max.mrr) max = t;
    }
    const currency = max.currency;

    // Filter series to chosen currency and date range
    const filtered = response.stats
        .filter((d: any) => d.currency === currency)
        .filter((d: any) => moment(d.date).isSameOrAfter(dateFromMoment));

    // Ensure start point exists
    const allSorted = [...response.stats]
        .filter((d: any) => d.currency === currency)
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const result = [...filtered];
    const hasStart = result.some(i => moment(i.date).isSame(dateFromMoment, 'day'));
    if (!hasStart) {
        const before = allSorted.find(i => moment(i.date).isBefore(dateFromMoment));
        if (before) {
            result.unshift({...before, date: dateFromMoment.format('YYYY-MM-DD')});
        } else if (result.length) {
            const earliest = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
            result.unshift({...earliest, date: dateFromMoment.format('YYYY-MM-DD')});
        }
    }

    // Ensure end point exists
    const endCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    const hasEnd = result.some(i => moment(i.date).isSame(endCheck, 'day'));
    if (!hasEnd && result.length) {
        const mostRecent = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        result.push({...mostRecent, date: endCheck.format('YYYY-MM-DD')});
    }

    const final = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return {mrrData: final, selectedCurrency: currency};
};

/**
 * Merge subscription stats by date and limit to the requested range.
 */
const extractSubscriptionData = (
    response: any,
    dateFrom: string,
    endDate: string
) => {
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
};

/**
 * Hook that aggregates growth statistics for the selected date range.
 */
export const useGrowthStats = (range: number) => {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);
    const memberStart = range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom;

    const {data: memberResp, isLoading: memberLoading} = useMemberCountHistory({
        searchParams: {date_from: memberStart}
    });

    const {data: mrrResp, isLoading: mrrLoading} = useMrrHistory({
        searchParams: {date_from: memberStart}
    });

    const {data: subResp, isLoading: subLoading} = useSubscriptionStats();

    const memberData = useMemo(() => extractMemberData(memberResp, range, dateFrom), [memberResp, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(
        () => extractMrrData(mrrResp, dateFrom, range),
        [mrrResp, dateFrom, range]
    );

    const totals = useMemo(
        () => calculateTotals(memberData, mrrData, dateFrom, memberResp?.meta?.totals),
        [memberData, mrrData, dateFrom, memberResp?.meta?.totals]
    );

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const subscriptionData = useMemo(
        () => extractSubscriptionData(subResp, dateFrom, endDate),
        [subResp, dateFrom, endDate]
    );

    const isLoading = useMemo(() => memberLoading || mrrLoading || subLoading, [memberLoading, mrrLoading, subLoading]);

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