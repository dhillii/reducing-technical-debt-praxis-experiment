import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Guard: returns true when the member data array is empty.
 */
function isMemberDataEmpty(memberData: MemberStatusItem[]): boolean {
    return memberData.length === 0;
}

/**
 * Guard: returns true when there is more than one member data point.
 */
function hasMultipleMemberPoints(memberData: MemberStatusItem[]): boolean {
    return memberData.length > 1;
}

/**
 * Guard: returns true when there is more than one MRR data point.
 */
function hasMultipleMrrPoints(mrrData: MrrHistoryItem[]): boolean {
    return mrrData.length > 1;
}

/**
 * Guard: returns true when the first total members count is greater than zero.
 */
function hasPositiveFirstTotal(first: MemberStatusItem): boolean {
    return (first.free + first.paid + first.comped) > 0;
}

/**
 * Guard: returns true when the first free members count is greater than zero.
 */
function hasPositiveFirstFree(first: MemberStatusItem): boolean {
    return first.free > 0;
}

/**
 * Guard: returns true when the first paid+comped total is greater than zero.
 */
function hasPositiveFirstPaidTotal(first: MemberStatusItem): boolean {
    return (first.paid + first.comped) > 0;
}

/**
 * Guard: returns true when a valid first actual MRR point exists.
 */
function hasFirstActualPoint(mrrData: MrrHistoryItem[], startDate: string): MrrHistoryItem | undefined {
    return mrrData.find(point => moment(point.date).isSameOrAfter(startDate));
}

/**
 * Guard: determines if the selected range starts from the beginning of a year or earlier.
 */
function isFromBeginningRange(dateFrom: string): boolean {
    const start = moment(dateFrom);
    return start.isSame(moment().startOf('year'), 'day') || start.year() < moment().year();
}

/**
 * Calculates percentage change and direction for a given delta.
 */
function calculateChange(delta: number): {percent: string; direction: DiffDirection} {
    const percent = formatPercentage(delta / 100);
    const direction: DiffDirection = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
    return {percent, direction};
}

/**
 * Calculates totals and percentage changes from member and MRR data.
 */
const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) => {
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

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
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

    if (hasMultipleMemberPoints(memberData)) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (hasPositiveFirstTotal(first)) {
            const totalDelta = ((totalMembers - firstTotal) / firstTotal) * 100;
            const {percent, direction} = calculateChange(totalDelta);
            percentChanges.total = percent;
            directions.total = direction;
        }

        if (hasPositiveFirstFree(first)) {
            const freeDelta = ((latestMember.free - first.free) / first.free) * 100;
            const {percent, direction} = calculateChange(freeDelta);
            percentChanges.free = percent;
            directions.free = direction;
        }

        if (hasPositiveFirstPaidTotal(first)) {
            const firstPaidTotal = first.paid + first.comped;
            const latestPaidTotal = latestMember.paid + latestMember.comped;
            const paidDelta = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
            const {percent, direction} = calculateChange(paidDelta);
            percentChanges.paid = percent;
            directions.paid = direction;
        }
    }

    if (hasMultipleMrrPoints(mrrData)) {
        const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
        const firstActual = hasFirstActualPoint(mrrData, actualStartDate);
        const fromBeginning = isFromBeginningRange(dateFrom);
        let firstMrr = 0;

        if (firstActual) {
            const isExactStart = moment(firstActual.date).isSame(actualStartDate, 'day');
            if (isExactStart) {
                firstMrr = firstActual.mrr;
            } else if (fromBeginning) {
                firstMrr = 0;
            } else {
                firstMrr = totalMrr;
            }
        } else if (fromBeginning) {
            firstMrr = 0;
        } else {
            firstMrr = totalMrr;
        }

        if (firstMrr >= 0) {
            const mrrDelta = firstMrr === 0 ? (totalMrr > 0 ? 100 : 0) : ((totalMrr - firstMrr) / firstMrr) * 100;
            const {percent, direction} = calculateChange(mrrDelta);
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
 * Formats chart data by merging member and MRR series.
 */
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
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
        const currentMember = memberMap.get(date);
        if (currentMember) {
            lastMemberItem = currentMember;
        }

        const currentMrr = mrrMap.get(date);
        if (currentMrr) {
            lastMrrItem = currentMrr;
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
 * Determines the currency with the highest total MRR.
 */
function selectCurrency(totals: {currency: string; mrr: number}[]): {currency: string; mrr: number} | null {
    if (totals.length === 0) {
        return null;
    }
    let max = totals[0];
    for (const total of totals) {
        if (total.mrr > max.mrr) {
            max = total;
        }
    }
    return max;
}

/**
 * Ensures the result set contains a data point at the start of the range.
 */
function ensureStartPoint(
    result: MrrHistoryItem[],
    allData: MrrHistoryItem[],
    dateFromMoment: moment.Moment
): MrrHistoryItem[] {
    const hasStart = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (hasStart) {
        return result;
    }

    const before = allData.find(item => moment(item.date).isBefore(dateFromMoment));
    if (before) {
        result.unshift({...before, date: dateFromMoment.format('YYYY-MM-DD')});
        return result;
    }

    if (result.length > 0) {
        const earliest = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        result.unshift({...earliest, date: dateFromMoment.format('YYYY-MM-DD')});
    }
    return result;
}

/**
 * Ensures the result set contains a data point at the end of the range.
 */
function ensureEndPoint(
    result: MrrHistoryItem[],
    dateToMoment: moment.Moment,
    range: number
): MrrHistoryItem[] {
    const endCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    const hasEnd = result.some(item => moment(item.date).isSame(endCheck, 'day'));
    if (hasEnd || result.length === 0) {
        return result;
    }

    const sorted = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const mostRecent = sorted[0];
    result.push({...mostRecent, date: endCheck.format('YYYY-MM-DD')});
    return result;
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

    const memberData = useMemo(() => {
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
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

        if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const currencyInfo = selectCurrency(mrrHistoryResponse.meta.totals);
        if (!currencyInfo) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const useCurrency = currencyInfo.currency;
        const currencyFiltered = mrrHistoryResponse.stats.filter(d => d.currency === useCurrency);
        const filtered = currencyFiltered.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));
        const allSorted = [...currencyFiltered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        let result = [...filtered];
        result = ensureStartPoint(result, allSorted, dateFromMoment);
        result = ensureEndPoint(result, dateToMoment, range);
        const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return {mrrData: finalResult, selectedCurrency: useCurrency};
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

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