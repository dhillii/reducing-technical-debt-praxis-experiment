import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

/** Direction of a diff */
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Guard: checks if member data array is empty.
 */
function isMemberDataEmpty(memberData: MemberStatusItem[]): boolean {
    return memberData.length === 0;
}

/**
 * Returns the current totals either from API meta or the latest time‑series entry.
 */
function resolveCurrentTotals(memberCountTotals: {paid: number; free: number; comped: number} | undefined, memberData: MemberStatusItem[]) {
    return memberCountTotals ?? memberData[memberData.length - 1];
}

/**
 * Returns a direction string based on a numeric change.
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
 * Calculates percentage change safely (previous must be > 0).
 */
function calculatePercentChange(current: number, previous: number): number {
    return ((current - previous) / previous) * 100;
}

/**
 * Determines if the provided range start date represents a “from beginning” range.
 */
function isFromBeginningRange(dateFrom: string): boolean {
    const start = moment(dateFrom);
    return start.isSame(moment().startOf('year'), 'day') || start.year() < moment().year();
}

/**
 * Finds the first actual MRR point on or after the start date.
 */
function findFirstActualMrrPoint(mrrData: MrrHistoryItem[], dateFrom: string) {
    const start = moment(dateFrom).format('YYYY-MM-DD');
    return mrrData.find(point => moment(point.date).isSameOrAfter(start));
}

/**
 * Returns the appropriate start MRR value based on range characteristics.
 */
function resolveStartMrr(firstActualPoint: MrrHistoryItem | undefined, dateFrom: string, totalMrr: number): number {
    const start = moment(dateFrom);
    if (!firstActualPoint) {
        return isFromBeginningRange(dateFrom) ? 0 : totalMrr;
    }

    const actualStart = moment(firstActualPoint.date);
    const startDay = moment(dateFrom).format('YYYY-MM-DD');

    if (actualStart.isSame(startDay, 'day')) {
        return firstActualPoint.mrr;
    }

    if (isFromBeginningRange(dateFrom)) {
        return 0;
    }

    return totalMrr;
}

/**
 * Calculates totals, percentage changes and directions for members and MRR.
 */
function calculateTotals(
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) {
    if (isMemberDataEmpty(memberData)) {
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

    const currentTotals = resolveCurrentTotals(memberCountTotals, memberData);
    const latestMember = memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

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
            const totalChange = calculatePercentChange(totalMembers, firstTotal);
            percentChanges.total = formatPercentage(totalChange / 100);
            directions.total = getDirection(totalChange);
        }

        if (first.free > 0) {
            const freeChange = calculatePercentChange(latestMember.free, first.free);
            percentChanges.free = formatPercentage(freeChange / 100);
            directions.free = getDirection(freeChange);
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latestMember.paid + latestMember.comped;

        if (firstPaidTotal > 0) {
            const paidChange = calculatePercentChange(latestPaidTotal, firstPaidTotal);
            percentChanges.paid = formatPercentage(paidChange / 100);
            directions.paid = getDirection(paidChange);
        }
    }

    if (mrrData.length > 1) {
        const startMrr = resolveStartMrr(findFirstActualMrrPoint(mrrData, dateFrom), dateFrom, totalMrr);

        if (startMrr >= 0) {
            const mrrChange = startMrr === 0 ? (totalMrr > 0 ? 100 : 0) : ((totalMrr - startMrr) / startMrr) * 100;
            percentChanges.mrr = formatPercentage(mrrChange / 100);
            directions.mrr = getDirection(mrrChange);
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
}

/**
 * Formats chart data by merging member and MRR series.
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
 * Retrieves the most recent MRR entry before a given moment.
 */
function findMostRecentBefore(mrrData: MrrHistoryItem[], momentDate: moment.Moment) {
    return mrrData.find(item => moment(item.date).isBefore(momentDate));
}

/**
 * Ensures a data point exists at the start of the range.
 */
function ensureStartPoint(result: MrrHistoryItem[], allData: MrrHistoryItem[], dateFromMoment: moment.Moment) {
    const hasStart = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (hasStart) {
        return;
    }

    const mostRecent = findMostRecentBefore(allData, dateFromMoment);
    if (mostRecent) {
        result.unshift({
            ...mostRecent,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
        return;
    }

    if (result.length > 0) {
        const earliest = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        result.unshift({
            ...earliest,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
    }
}

/**
 * Ensures a data point exists at the end of the range.
 */
function ensureEndPoint(result: MrrHistoryItem[], dateToMoment: moment.Moment) {
    const hasEnd = result.some(item => moment(item.date).isSame(dateToMoment, 'day'));
    if (hasEnd || result.length === 0) {
        return;
    }

    const mostRecent = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    result.push({
        ...mostRecent,
        date: dateToMoment.format('YYYY-MM-DD')
    });
}

/**
 * Processes MRR history response into sorted data for the selected currency.
 */
function processMrrHistory(
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
    const currencyFiltered = mrrHistoryResponse.stats.filter((d: any) => d.currency === useCurrency);
    const dateFromMoment = moment(dateFrom);
    const filtered = currencyFiltered.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));
    const allData = [...currencyFiltered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const result = [...filtered];
    ensureStartPoint(result, allData, dateFromMoment);

    const dateToMoment = range === 1 ? moment().startOf('day') : moment(dateFrom).add(range, 'day').startOf('day');
    ensureEndPoint(result, dateToMoment);

    const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalResult, selectedCurrency: useCurrency};
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

    const {mrrData, selectedCurrency} = useMemo(() => {
        return processMrrHistory(mrrHistoryResponse, dateFrom, range);
    }, [mrrHistoryResponse, dateFrom, range]);

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

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

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

        const fromMoment = moment(dateFrom);
        const toMoment = moment(endDate);
        return array.filter(item => {
            const itemDate = moment(item.date);
            return itemDate.isSameOrAfter(fromMoment) && itemDate.isSameOrBefore(toMoment);
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