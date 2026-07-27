import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Compute percentage change and direction for a numeric metric.
 */
function computeChange(current: number, previous: number): {percent: string; direction: DiffDirection} {
    if (previous === 0) {
        const percent = current > 0 ? formatPercentage(1) : formatPercentage(0);
        const direction: DiffDirection = current > 0 ? 'up' : 'same';
        return {percent, direction};
    }
    const change = ((current - previous) / previous) * 100;
    return {
        percent: formatPercentage(change / 100),
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same'
    };
}

/**
 * Calculate totals and percentage changes for member and MRR data.
 */
export const calculateTotals = (
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
    const latestMember = memberData[memberData.length - 1];
    const latestMrr = mrrData.length ? mrrData[mrrData.length - 1].mrr : 0;

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr;

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
            const {percent, direction} = computeChange(totalMembers, firstTotal);
            percentChanges.total = percent;
            directions.total = direction;
        }

        if (first.free > 0) {
            const {percent, direction} = computeChange(latestMember.free, first.free);
            percentChanges.free = percent;
            directions.free = direction;
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latestMember.paid + latestMember.comped;

        if (firstPaidTotal > 0) {
            const {percent, direction} = computeChange(latestPaidTotal, firstPaidTotal);
            percentChanges.paid = percent;
            directions.paid = direction;
        }
    }

    if (mrrData.length > 1) {
        const firstMrr = determineFirstMrr(mrrData, dateFrom);
        if (firstMrr >= 0) {
            const {percent, direction} = computeChange(totalMrr, firstMrr);
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
 * Determine the appropriate starting MRR value for percentage change calculations.
 */
function determineFirstMrr(mrrData: MrrHistoryItem[], dateFrom: string): number {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(p => moment(p.date).isSameOrAfter(actualStartDate));

    const isFromBeginningRange =
        moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
        moment(dateFrom).year() < moment().year();

    if (firstActualPoint) {
        if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
            return firstActualPoint.mrr;
        }
        return isFromBeginningRange ? 0 : mrrData[mrrData.length - 1].mrr;
    }

    return isFromBeginningRange ? 0 : mrrData[mrrData.length - 1].mrr;
}

/**
 * Format chart data by merging member and MRR series.
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

/**
 * Select the currency with the highest total MRR.
 */
function selectCurrency(totals: {currency: string; mrr: number}[]): {currency: string; mrr: number} | null {
    if (!totals.length) return null;
    return totals.reduce((max, cur) => (cur.mrr > max.mrr ? cur : max), totals[0]);
}

/**
 * Ensure the result set contains a data point at the start of the range.
 */
function ensureStartPoint(
    result: MrrHistoryItem[],
    allData: MrrHistoryItem[],
    startMoment: moment.Moment
): MrrHistoryItem[] {
    const hasStart = result.some(item => moment(item.date).isSame(startMoment, 'day'));
    if (hasStart) return result;

    const before = allData.find(item => moment(item.date).isBefore(startMoment));
    if (before) {
        result.unshift({...before, date: startMoment.format('YYYY-MM-DD')});
        return result;
    }

    if (result.length) {
        const earliest = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        result.unshift({...earliest, date: startMoment.format('YYYY-MM-DD')});
    }
    return result;
}

/**
 * Ensure the result set contains a data point at the end of the range.
 */
function ensureEndPoint(
    result: MrrHistoryItem[],
    endMoment: moment.Moment
): MrrHistoryItem[] {
    const hasEnd = result.some(item => moment(item.date).isSame(endMoment, 'day'));
    if (hasEnd || !result.length) return result;

    const mostRecent = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    result.push({...mostRecent, date: endMoment.format('YYYY-MM-DD')});
    return result;
}

/**
 * Hook providing growth statistics for a given range.
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

    const memberData = useMemo(() => {
        let raw: MemberStatusItem[] = [];

        if (memberCountResponse?.stats) {
            raw = memberCountResponse.stats;
        } else if (Array.isArray(memberCountResponse)) {
            raw = memberCountResponse;
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
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        const startMoment = moment(dateFrom);
        const endMoment = range === 1 ? moment().startOf('day') : moment().startOf('day');

        if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const currencyInfo = selectCurrency(mrrHistoryResponse.meta.totals);
        if (!currencyInfo) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const filteredByCurrency = mrrHistoryResponse.stats.filter(d => d.currency === currencyInfo.currency);
        const afterStart = filteredByCurrency.filter(item => moment(item.date).isSameOrAfter(startMoment));
        const allSortedDesc = [...filteredByCurrency].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        let result = [...afterStart];
        result = ensureStartPoint(result, allSortedDesc, startMoment);
        result = ensureEndPoint(result, endMoment);
        result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return {mrrData: result, selectedCurrency: currencyInfo.currency};
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
        if (!subscriptionStatsResponse?.stats) return [];

        const merged = subscriptionStatsResponse.stats.reduce((acc, cur) => {
            const key = cur.date;
            if (!acc[key]) {
                acc[key] = {date: key, signups: 0, cancellations: 0};
            }
            acc[key].signups += cur.signups;
            acc[key].cancellations += cur.cancellations;
            return acc;
        }, {} as Record<string, {date: string; signups: number; cancellations: number}>);

        const array = Object.values(merged).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const from = moment(dateFrom);
        const to = moment(endDate);
        return array.filter(item => {
            const d = moment(item.date);
            return d.isSameOrAfter(from) && d.isSameOrBefore(to);
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