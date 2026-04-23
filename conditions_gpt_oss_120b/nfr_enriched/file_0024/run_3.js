import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Extract current totals, falling back to latest data point.
 */
function getCurrentTotals(memberData: MemberStatusItem[], memberCountTotals?: {paid: number; free: number; comped: number}) {
    return memberCountTotals || memberData[memberData.length - 1];
}

/**
 * Compute percentage changes and directions for member totals.
 */
function computeMemberChanges(memberData: MemberStatusItem[], latest: MemberStatusItem, totalMembers: number) {
    const first = memberData[0];
    const firstTotal = first.free + first.paid + first.comped;

    const percentChanges = {total: '0%', free: '0%', paid: '0%', mrr: '0%'} as const;
    const directions = {total: 'same' as DiffDirection, free: 'same' as DiffDirection, paid: 'same' as DiffDirection, mrr: 'same' as DiffDirection} as const;

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
}

/**
 * Compute percentage change and direction for MRR.
 */
function computeMrrChange(mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number, percentChanges: any, directions: any) {
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
        const mrrChange = firstMrr === 0 ? (totalMrr > 0 ? 100 : 0) : ((totalMrr - firstMrr) / firstMrr) * 100;
        percentChanges.mrr = formatPercentage(mrrChange / 100);
        directions.mrr = mrrChange > 0 ? 'up' : mrrChange < 0 ? 'down' : 'same';
    }
}

/**
 * Calculate totals from member and MRR data.
 */
const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
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
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const percentChanges = {total: '0%', free: '0%', paid: '0%', mrr: '0%'} as const;
    const directions = {total: 'same' as DiffDirection, free: 'same' as DiffDirection, paid: 'same' as DiffDirection, mrr: 'same' as DiffDirection} as const;

    if (memberData.length > 1) {
        const memberChanges = computeMemberChanges(memberData, latest, totalMembers);
        Object.assign(percentChanges, memberChanges.percentChanges);
        Object.assign(directions, memberChanges.directions);
    }

    if (mrrData.length > 1) {
        computeMrrChange(mrrData, dateFrom, totalMrr, percentChanges, directions);
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
 * Format chart data from member and MRR series.
 */
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMemberData.map(item => item.date);
    const mrrDates = sortedMrrData.map(item => item.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

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
 * Extract raw member data and ensure two points for single‑day range.
 */
function getMemberData(response: any, range: number, dateFrom: string): MemberStatusItem[] {
    let rawData: MemberStatusItem[] = [];

    if (response?.stats) {
        rawData = response.stats;
    } else if (Array.isArray(response)) {
        rawData = response;
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
 * Determine the currency with the highest total MRR.
 */
function selectCurrency(totals: {currency: string; mrr: number}[]) {
    let currentMax = totals[0];
    if (!currentMax) {
        return 'usd';
    }
    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }
    return currentMax.currency;
}

/**
 * Ensure MRR series contains start and end points for the requested range.
 */
function ensureMrrBoundaryPoints(data: MrrHistoryItem[], dateFromMoment: moment.Moment, range: number): MrrHistoryItem[] {
    const result = [...data];
    const startExists = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!startExists) {
        const allSortedDesc = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const mostRecentBefore = allSortedDesc.find(item => moment(item.date).isBefore(dateFromMoment));
        if (mostRecentBefore) {
            result.unshift({...mostRecentBefore, date: dateFromMoment.format('YYYY-MM-DD')});
        } else if (result.length > 0) {
            const earliest = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
            result.unshift({...earliest, date: dateFromMoment.format('YYYY-MM-DD')});
        }
    }

    const endCheck = moment().startOf('day');
    const endExists = result.some(item => moment(item.date).isSame(endCheck, 'day'));
    if (!endExists && result.length > 0) {
        const mostRecent = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        result.push({...mostRecent, date: endCheck.format('YYYY-MM-DD')});
    }

    return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Process MRR response into filtered, ordered series and selected currency.
 */
function getMrrData(response: any, range: number, dateFrom: string) {
    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [] as MrrHistoryItem[], selectedCurrency: 'usd'};
    }

    const selectedCurrency = selectCurrency(response.meta.totals);
    const currencyFiltered = response.stats.filter((d: any) => d.currency === selectedCurrency);
    const dateFromMoment = moment(dateFrom);
    const filtered = currencyFiltered.filter((item: any) => moment(item.date).isSameOrAfter(dateFromMoment));

    const bounded = ensureMrrBoundaryPoints(filtered, dateFromMoment, range);
    return {mrrData: bounded, selectedCurrency};
}

/**
 * Merge and filter subscription stats into the requested date range.
 */
function getSubscriptionData(response: any, dateFrom: string, endDate: string) {
    if (!response?.stats) {
        return [] as {date: string; signups: number; cancellations: number}[];
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

    const memberData = useMemo(() => getMemberData(memberCountResponse, range, dateFrom), [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => getMrrData(mrrHistoryResponse, range, dateFrom), [mrrHistoryResponse, range, dateFrom]);

    const totals = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => getSubscriptionData(subscriptionStatsResponse, dateFrom, endDate), [subscriptionStatsResponse, dateFrom, endDate]);

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