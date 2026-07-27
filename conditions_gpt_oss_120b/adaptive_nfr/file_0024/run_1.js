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
 * Returns a default totals object when no member data is available.
 */
function getDefaultTotals(): {
    totalMembers: number;
    freeMembers: number;
    paidMembers: number;
    mrr: number;
    percentChanges: Record<string, string>;
    directions: Record<string, DiffDirection>;
} {
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
            total: 'same',
            free: 'same',
            paid: 'same',
            mrr: 'same'
        }
    };
}

/**
 * Returns a fresh percent changes object.
 */
function initPercentChanges(): Record<string, string> {
    return {
        total: '0%',
        free: '0%',
        paid: '0%',
        mrr: '0%'
    };
}

/**
 * Returns a fresh directions object.
 */
function initDirections(): Record<string, DiffDirection> {
    return {
        total: 'same',
        free: 'same',
        paid: 'same',
        mrr: 'same'
    };
}

/**
 * Determines direction string from a numeric change.
 */
function getDirectionFromChange(change: number): DiffDirection {
    if (change > 0) {
        return 'up';
    }
    if (change < 0) {
        return 'down';
    }
    return 'same';
}

/**
 * Checks whether member data contains more than one point.
 */
function hasMultipleMemberPoints(data: MemberStatusItem[]): boolean {
    return data.length > 1;
}

/**
 * Checks whether MRR data contains more than one point.
 */
function hasMultipleMrrPoints(data: MrrHistoryItem[]): boolean {
    return data.length > 1;
}

/**
 * Calculates percentage change based on start and end values.
 */
function calculateChange(end: number, start: number): number {
    return ((end - start) / start) * 100;
}

/**
 * Determines if the provided start date represents a "from beginning" range.
 */
function isFromBeginningRange(dateFrom: string): boolean {
    const start = moment(dateFrom);
    return start.isSame(moment().startOf('year'), 'day') || start.year() < moment().year();
}

/**
 * Finds the first actual MRR point on or after the start date.
 */
function findFirstActualPoint(mrrData: MrrHistoryItem[], dateFrom: string): MrrHistoryItem | undefined {
    const start = moment(dateFrom).format('YYYY-MM-DD');
    return mrrData.find(point => moment(point.date).isSameOrAfter(start));
}

/**
 * Determines the starting MRR value for change calculations.
 */
function determineFirstMrr(mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number {
    const firstActual = findFirstActualPoint(mrrData, dateFrom);
    const fromBeginning = isFromBeginningRange(dateFrom);

    if (firstActual) {
        const isExactStart = moment(firstActual.date).isSame(moment(dateFrom), 'day');
        if (isExactStart) {
            return firstActual.mrr;
        }
        if (fromBeginning) {
            return 0;
        }
        return totalMrr;
    }

    if (fromBeginning) {
        return 0;
    }
    return totalMrr;
}

/**
 * Computes MRR change percentage, handling zero start values.
 */
function computeMrrChange(firstMrr: number, totalMrr: number): number {
    if (firstMrr === 0) {
        return totalMrr > 0 ? 100 : 0;
    }
    return ((totalMrr - firstMrr) / firstMrr) * 100;
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
    if (!memberData.length) {
        return getDefaultTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latestMember = memberData[memberData.length - 1];
    const latestMrr = mrrData.length ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const percentChanges = initPercentChanges();
    const directions = initDirections();

    if (hasMultipleMemberPoints(memberData)) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const totalChange = calculateChange(totalMembers, firstTotal);
            percentChanges.total = formatPercentage(totalChange / 100);
            directions.total = getDirectionFromChange(totalChange);
        }

        if (first.free > 0) {
            const freeChange = calculateChange(latestMember.free, first.free);
            percentChanges.free = formatPercentage(freeChange / 100);
            directions.free = getDirectionFromChange(freeChange);
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latestMember.paid + latestMember.comped;

        if (firstPaidTotal > 0) {
            const paidChange = calculateChange(latestPaidTotal, firstPaidTotal);
            percentChanges.paid = formatPercentage(paidChange / 100);
            directions.paid = getDirectionFromChange(paidChange);
        }
    }

    if (hasMultipleMrrPoints(mrrData)) {
        const firstMrr = determineFirstMrr(mrrData, dateFrom, totalMrr);
        if (firstMrr >= 0) {
            const mrrChange = computeMrrChange(firstMrr, totalMrr);
            percentChanges.mrr = formatPercentage(mrrChange / 100);
            directions.mrr = getDirectionFromChange(mrrChange);
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
    const sortedMember = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrr = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMember.map(i => i.date);
    const mrrDates = sortedMrr.map(i => i.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    let lastMember: MemberStatusItem | null = null;
    let lastMrr: MrrHistoryItem | null = null;

    const memberMap = new Map(sortedMember.map(i => [i.date, i]));
    const mrrMap = new Map(sortedMrr.map(i => [i.date, i]));

    return allDates.map(date => {
        const memberItem = memberMap.get(date);
        if (memberItem) {
            lastMember = memberItem;
        }

        const mrrItem = mrrMap.get(date);
        if (mrrItem) {
            lastMrr = mrrItem;
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
};

/**
 * Returns the currency with the highest total MRR.
 */
function getCurrencyWithHighestMrr(totals: {currency: string; mrr: number}[]): string {
    if (!totals.length) {
        return 'usd';
    }
    let max = totals[0];
    for (const t of totals) {
        if (t.mrr > max.mrr) {
            max = t;
        }
    }
    return max.currency;
}

/**
 * Filters MRR data to a specific currency.
 */
function filterMrrByCurrency(data: MrrHistoryItem[], currency: string): MrrHistoryItem[] {
    return data.filter(d => d.currency === currency);
}

/**
 * Returns data points on or after the given start moment.
 */
function filterDataFromStart(data: MrrHistoryItem[], startMoment: moment.Moment): MrrHistoryItem[] {
    return data.filter(item => moment(item.date).isSameOrAfter(startMoment));
}

/**
 * Ensures a data point exists at the start of the range.
 */
function ensureStartPoint(
    data: MrrHistoryItem[],
    allDataDesc: MrrHistoryItem[],
    startMoment: moment.Moment
): MrrHistoryItem[] {
    const hasStart = data.some(item => moment(item.date).isSame(startMoment, 'day'));
    if (hasStart) {
        return data;
    }

    const before = allDataDesc.find(item => moment(item.date).isBefore(startMoment));
    if (before) {
        return [{...before, date: startMoment.format('YYYY-MM-DD')}, ...data];
    }

    if (data.length) {
        const earliest = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        return [{...earliest, date: startMoment.format('YYYY-MM-DD')}, ...data];
    }

    return data;
}

/**
 * Ensures a data point exists at the end of the range.
 */
function ensureEndPoint(
    data: MrrHistoryItem[],
    endMoment: moment.Moment
): MrrHistoryItem[] {
    const hasEnd = data.some(item => moment(item.date).isSame(endMoment, 'day'));
    if (hasEnd || !data.length) {
        return data;
    }

    const mostRecent = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    return [...data, {...mostRecent, date: endMoment.format('YYYY-MM-DD')}];
}

/**
 * Processes raw MRR history response into sorted data and selected currency.
 */
function processMrrHistory(
    mrrHistoryResponse: any,
    dateFrom: string,
    range: number
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const selectedCurrency = getCurrencyWithHighestMrr(mrrHistoryResponse.meta.totals);
    const currencyFiltered = filterMrrByCurrency(mrrHistoryResponse.stats, selectedCurrency);

    const startMoment = moment(dateFrom);
    const filtered = filterDataFromStart(currencyFiltered, startMoment);
    const allDesc = [...currencyFiltered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const withStart = ensureStartPoint(filtered, allDesc, startMoment);
    const endMoment = range === 1 ? moment().startOf('day') : moment(startMoment).add(range - 1, 'day').endOf('day');
    const withEnd = ensureEndPoint(withStart, endMoment);

    const finalSorted = withEnd.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalSorted, selectedCurrency};
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
        if (!memberCountResponse) {
            return [];
        }

        if (Array.isArray(memberCountResponse)) {
            return memberCountResponse;
        }

        if (memberCountResponse.stats) {
            const raw = memberCountResponse.stats;
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

        return [];
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        return processMrrHistory(mrrHistoryResponse, dateFrom, range);
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