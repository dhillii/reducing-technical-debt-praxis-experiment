import moment from 'moment';
import {
    MemberStatusItem,
    MrrHistoryItem,
    useMemberCountHistory,
    useMrrHistory,
    useSubscriptionStats
} from '@tryghost/admin-x-framework/api/stats';
import {
    formatNumber,
    formatPercentage,
    formatQueryDate,
    getRangeDates
} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

/**
 * Direction of a diff value.
 */
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Guard: checks if there are at least two data points.
 */
function hasMultipleData<T>(data: T[]): boolean {
    return data.length > 1;
}

/**
 * Returns a DiffDirection based on a numeric change.
 */
function getDirection(change: number): DiffDirection {
    if (change > 0) return 'up';
    if (change < 0) return 'down';
    return 'same';
}

/**
 * Initializes a percent change map with zero values.
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
 * Initializes a direction map with "same" values.
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
 * Calculates member‑related percentage changes and directions.
 */
function computeMemberChanges(
    memberData: MemberStatusItem[],
    latest: MemberStatusItem,
    totalMembers: number,
    percentChanges: ReturnType<typeof initPercentChanges>,
    directions: ReturnType<typeof initDirections>
) {
    const first = memberData[0];
    const firstTotal = first.free + first.paid + first.comped;

    if (firstTotal > 0) {
        const totalChange = ((totalMembers - firstTotal) / firstTotal) * 100;
        percentChanges.total = formatPercentage(totalChange / 100);
        directions.total = getDirection(totalChange);
    }

    if (first.free > 0) {
        const freeChange = ((latest.free - first.free) / first.free) * 100;
        percentChanges.free = formatPercentage(freeChange / 100);
        directions.free = getDirection(freeChange);
    }

    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;

    if (firstPaidTotal > 0) {
        const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
        percentChanges.paid = formatPercentage(paidChange / 100);
        directions.paid = getDirection(paidChange);
    }
}

/**
 * Determines whether the requested range starts at the beginning of a year or earlier.
 */
function isFromBeginningRange(dateFrom: string): boolean {
    const start = moment(dateFrom);
    return start.isSame(moment().startOf('year'), 'day') || start.year() < moment().year();
}

/**
 * Retrieves the first actual MRR point that falls on or after the start date.
 */
function getFirstActualPoint(mrrData: MrrHistoryItem[], dateFrom: string) {
    const start = moment(dateFrom).format('YYYY-MM-DD');
    return mrrData.find(point => moment(point.date).isSameOrAfter(start));
}

/**
 * Calculates the starting MRR value based on range characteristics.
 */
function determineFirstMrr(
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number
): number {
    const actualStart = moment(dateFrom).format('YYYY-MM-DD');
    const firstActual = getFirstActualPoint(mrrData, dateFrom);
    const fromBeginning = isFromBeginningRange(dateFrom);

    if (firstActual) {
        const isExactStart = moment(firstActual.date).isSame(actualStart, 'day');
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
 * Calculates MRR‑related percentage changes and directions.
 */
function computeMrrChanges(
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number,
    percentChanges: ReturnType<typeof initPercentChanges>,
    directions: ReturnType<typeof initDirections>
) {
    const firstMrr = determineFirstMrr(mrrData, dateFrom, totalMrr);

    if (firstMrr >= 0) {
        const mrrChange = firstMrr === 0
            ? (totalMrr > 0 ? 100 : 0)
            : ((totalMrr - firstMrr) / firstMrr) * 100;

        percentChanges.mrr = formatPercentage(mrrChange / 100);
        directions.mrr = getDirection(mrrChange);
    }
}

/**
 * Calculates totals, percentage changes and directions for members and MRR.
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
            percentChanges: initPercentChanges(),
            directions: initDirections()
        };
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latestMember = memberData[memberData.length - 1];
    const latestMrr = mrrData[mrrData.length - 1] ?? {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const percentChanges = initPercentChanges();
    const directions = initDirections();

    if (hasMultipleData(memberData)) {
        computeMemberChanges(memberData, latestMember, totalMembers, percentChanges, directions);
    }

    if (hasMultipleData(mrrData)) {
        computeMrrChanges(mrrData, dateFrom, totalMrr, percentChanges, directions);
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
export const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
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
 * Extracts member data from the API response, handling single‑day edge cases.
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
        const startToday = moment(dateFrom).format('YYYY-MM-DD');
        const startTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

        return [
            {...yesterday, date: startToday},
            {...today, date: startTomorrow}
        ];
    }

    return raw;
}

/**
 * Determines the currency with the highest total MRR and filters the data accordingly.
 */
function selectCurrencyAndFilter(
    response: any,
    dateFrom: string,
    range: number
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} {
    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const totals = response.meta.totals;
    let top = totals[0];
    if (!top) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    for (const t of totals) {
        if (t.mrr > top.mrr) top = t;
    }

    const currency = top.currency;
    const filtered = response.stats.filter((d: any) => d.currency === currency);
    const startMoment = moment(dateFrom);
    const afterStart = filtered.filter((item: any) => moment(item.date).isSameOrAfter(startMoment));

    const allSortedDesc = [...filtered].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...afterStart];

    const ensureStartPoint = () => {
        const hasStart = result.some(item => moment(item.date).isSame(startMoment, 'day'));
        if (hasStart) return;

        const before = allSortedDesc.find(item => moment(item.date).isBefore(startMoment));
        if (before) {
            result.unshift({...before, date: startMoment.format('YYYY-MM-DD')});
        } else if (result.length) {
            const earliest = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
            result.unshift({...earliest, date: startMoment.format('YYYY-MM-DD')});
        }
    };

    const ensureEndPoint = () => {
        const endMoment = range === 1 ? moment().startOf('day') : moment().endOf('day');
        const hasEnd = result.some(item => moment(item.date).isSame(endMoment, 'day'));
        if (hasEnd || !result.length) return;

        const mostRecent = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        result.push({...mostRecent, date: endMoment.format('YYYY-MM-DD')});
    };

    ensureStartPoint();
    ensureEndPoint();

    const finalSorted = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalSorted, selectedCurrency: currency};
}

/**
 * Merges and filters subscription stats into a date‑range array.
 */
function extractSubscriptionData(
    response: any,
    dateFrom: string,
    endDate: string
) {
    if (!response?.stats) {
        return [];
    }

    const merged = response.stats.reduce((acc: any, cur: any) => {
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
}

/**
 * Hook providing growth statistics.
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
        () => selectCurrencyAndFilter(mrrResp, dateFrom, range),
        [mrrResp, dateFrom, range]
    );

    const totals = useMemo(
        () => calculateTotals(memberData, mrrData, dateFrom, memberResp?.meta?.totals),
        [memberData, mrrData, dateFrom, memberResp?.meta?.totals]
    );

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => memberLoading || mrrLoading || subLoading, [memberLoading, mrrLoading, subLoading]);

    const subscriptionData = useMemo(
        () => extractSubscriptionData(subResp, dateFrom, endDate),
        [subResp, dateFrom, endDate]
    );

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