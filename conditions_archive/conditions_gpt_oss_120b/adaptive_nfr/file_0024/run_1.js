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
 * Guard: checks if an array has at least one element.
 */
const hasData = <T>(arr: T[]): boolean => arr.length > 0;

/**
 * Guard: checks if an array has more than one element.
 */
const hasMultipleData = <T>(arr: T[]): boolean => arr.length > 1;

/**
 * Guard: checks if the range starts from the beginning of the year or earlier.
 */
const isFromBeginningRange = (dateFrom: string): boolean => {
    const start = moment(dateFrom);
    return start.isSame(moment().startOf('year'), 'day') || start.year() < moment().year();
};

/**
 * Initializes a percent changes object with zero values.
 */
const initPercentChanges = () => ({
    total: '0%',
    free: '0%',
    paid: '0%',
    mrr: '0%'
});

/**
 * Initializes a directions object with "same" values.
 */
const initDirections = () => ({
    total: 'same' as DiffDirection,
    free: 'same' as DiffDirection,
    paid: 'same' as DiffDirection,
    mrr: 'same' as DiffDirection
});

/**
 * Calculates member‑related percentage changes and directions.
 */
function computeMemberChanges(
    memberData: MemberStatusItem[],
    latest: MemberStatusItem,
    currentTotals: MemberStatusItem,
    percentChanges: ReturnType<typeof initPercentChanges>,
    directions: ReturnType<typeof initDirections>
) {
    const first = memberData[0];
    const firstTotal = first.free + first.paid + first.comped;

    if (firstTotal > 0) {
        const totalChange = ((currentTotals.free + currentTotals.paid + currentTotals.comped - firstTotal) / firstTotal) * 100;
        percentChanges.total = formatPercentage(totalChange / 100);
        if (totalChange > 0) directions.total = 'up';
        else if (totalChange < 0) directions.total = 'down';
    }

    if (first.free > 0) {
        const freeChange = ((latest.free - first.free) / first.free) * 100;
        percentChanges.free = formatPercentage(freeChange / 100);
        if (freeChange > 0) directions.free = 'up';
        else if (freeChange < 0) directions.free = 'down';
    }

    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;

    if (firstPaidTotal > 0) {
        const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
        percentChanges.paid = formatPercentage(paidChange / 100);
        if (paidChange > 0) directions.paid = 'up';
        else if (paidChange < 0) directions.paid = 'down';
    }
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
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(p => moment(p.date).isSameOrAfter(actualStartDate));

    let firstMrr = 0;

    if (firstActualPoint) {
        if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
            firstMrr = firstActualPoint.mrr;
        } else if (isFromBeginningRange(dateFrom)) {
            firstMrr = 0;
        } else {
            firstMrr = totalMrr;
        }
    } else if (isFromBeginningRange(dateFrom)) {
        firstMrr = 0;
    } else {
        firstMrr = totalMrr;
    }

    if (firstMrr >= 0) {
        const mrrChange = firstMrr === 0 ? (totalMrr > 0 ? 100 : 0) : ((totalMrr - firstMrr) / firstMrr) * 100;
        percentChanges.mrr = formatPercentage(mrrChange / 100);
        if (mrrChange > 0) directions.mrr = 'up';
        else if (mrrChange < 0) directions.mrr = 'down';
    }
}

/**
 * Calculates totals, percent changes and directions for members and MRR.
 */
export const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) => {
    if (!hasData(memberData)) {
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
    const latestMrr = hasData(mrrData) ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const percentChanges = initPercentChanges();
    const directions = initDirections();

    if (hasMultipleData(memberData)) {
        computeMemberChanges(memberData, latestMember, currentTotals, percentChanges, directions);
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
 * Extracts member data from the API response, handling single‑day ranges.
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
 * Determines the currency with the highest total MRR and filters data accordingly.
 */
function extractMrrData(
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
    const fromMoment = moment(dateFrom);
    const toMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const inRange = filtered.filter((item: any) => moment(item.date).isSameOrAfter(fromMoment));
    const allSortedDesc = [...filtered].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const result = [...inRange];

    const hasStart = result.some(item => moment(item.date).isSame(fromMoment, 'day'));
    if (!hasStart) {
        const before = allSortedDesc.find(item => moment(item.date).isBefore(fromMoment));
        if (before) {
            result.unshift({...before, date: fromMoment.format('YYYY-MM-DD')});
        } else if (result.length) {
            const earliest = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
            result.unshift({...earliest, date: fromMoment.format('YYYY-MM-DD')});
        }
    }

    const endCheck = range === 1 ? moment().startOf('day') : toMoment;
    const hasEnd = result.some(item => moment(item.date).isSame(endCheck, 'day'));
    if (!hasEnd && result.length) {
        const mostRecent = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        result.push({...mostRecent, date: endCheck.format('YYYY-MM-DD')});
    }

    const final = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: final, selectedCurrency: currency};
}

/**
 * Merges subscription stats by date and filters to the requested range.
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
 * Hook that provides growth statistics for a given date range.
 */
export const useGrowthStats = (range: number) => {
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

    const {mrrData, selectedCurrency} = useMemo(() => extractMrrData(mrrResp, dateFrom, range), [mrrResp, dateFrom, range]);

    const totals = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberResp?.meta?.totals), [
        memberData,
        mrrData,
        dateFrom,
        memberResp?.meta?.totals
    ]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const subscriptionData = useMemo(() => extractSubscriptionData(subResp, dateFrom, endDate), [
        subResp,
        dateFrom,
        endDate
    ]);

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