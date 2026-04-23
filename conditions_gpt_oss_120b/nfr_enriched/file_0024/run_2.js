import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Compute member percentage changes and direction indicators.
 */
const computeMemberChanges = (
    memberData: MemberStatusItem[],
    currentTotals: {free: number; paid: number; comped: number}
) => {
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

    if (memberData.length <= 1) {
        return {percentChanges, directions};
    }

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
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

    return {percentChanges, directions};
};

/**
 * Compute MRR percentage change and direction.
 */
const computeMrrChange = (
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number
) => {
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

    if (mrrData.length <= 1) {
        return {percentChanges, directions};
    }

    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));

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
 * Calculate totals and change metrics.
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
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const memberChanges = computeMemberChanges(memberData, currentTotals);
    const mrrChanges = computeMrrChange(mrrData, dateFrom, totalMrr);

    const percentChanges = {
        ...memberChanges.percentChanges,
        mrr: mrrChanges.percentChanges.mrr
    };
    const directions = {
        ...memberChanges.directions,
        mrr: mrrChanges.directions.mrr
    };

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
 * Prepare member data for charting.
 */
const getMemberData = (
    memberCountResponse: any,
    range: number,
    dateFrom: string
): MemberStatusItem[] => {
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
};

/**
 * Prepare MRR data for charting.
 */
const getMrrData = (
    mrrHistoryResponse: any,
    dateFrom: string,
    range: number
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const totals = mrrHistoryResponse.meta.totals;
    let currentMax = totals[0] ?? null;
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
    const filtered = currencyFiltered.filter((item: any) => moment(item.date).isSameOrAfter(dateFromMoment));

    const allSortedDesc = [...currencyFiltered].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...filtered];

    const hasStart = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!hasStart) {
        const before = allSortedDesc.find(item => moment(item.date).isBefore(dateFromMoment));
        if (before) {
            result.unshift({...before, date: dateFromMoment.format('YYYY-MM-DD')});
        } else if (result.length > 0) {
            const earliest = [...result].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
            result.unshift({...earliest, date: dateFromMoment.format('YYYY-MM-DD')});
        }
    }

    const endCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    const hasEnd = result.some(item => moment(item.date).isSame(endCheck, 'day'));
    if (!hasEnd && result.length > 0) {
        const mostRecent = [...result].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        result.push({...mostRecent, date: endCheck.format('YYYY-MM-DD')});
    }

    const finalResult = result.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalResult, selectedCurrency: useCurrency};
};

/**
 * Prepare subscription data for charting.
 */
const getSubscriptionData = (
    subscriptionStatsResponse: any,
    dateFrom: string,
    endDate: string
) => {
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
};

/**
 * Format chart data combining member and MRR series.
 */
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
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

    const memberData = useMemo(() => getMemberData(memberCountResponse, range, dateFrom), [
        memberCountResponse,
        range,
        dateFrom
    ]);

    const {mrrData, selectedCurrency} = useMemo(() => getMrrData(mrrHistoryResponse, dateFrom, range), [
        mrrHistoryResponse,
        dateFrom,
        range
    ]);

    const totals = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [
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

    const subscriptionData = useMemo(() => getSubscriptionData(subscriptionStatsResponse, dateFrom, endDate), [
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
        totals,
        chartData,
        subscriptionData,
        selectedCurrency,
        currencySymbol
    };
};