```typescript
import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

// ─── Pure helpers ────────────────────────────────────────────────────────────

const getDirection = (change: number): DiffDirection =>
    change > 0 ? 'up' : change < 0 ? 'down' : 'same';

const calcPercentChange = (current: number, previous: number): number => {
    if (previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
};

const formatChange = (change: number) => ({
    formatted: formatPercentage(change / 100),
    direction: getDirection(change)
});

const sortByDate = <T extends {date: string}>(items: T[]): T[] =>
    [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const buildDateMap = <T extends {date: string}>(items: T[]): Map<string, T> =>
    new Map(items.map(item => [item.date, item]));

const toYMD = (m: moment.Moment) => m.format('YYYY-MM-DD');

// ─── Empty defaults ──────────────────────────────────────────────────────────

const ZERO_CHANGES = {total: '0%', free: '0%', paid: '0%', mrr: '0%'};
const SAME_DIRECTIONS = {
    total: 'same' as DiffDirection,
    free: 'same' as DiffDirection,
    paid: 'same' as DiffDirection,
    mrr: 'same' as DiffDirection
};

const EMPTY_TOTALS = {
    totalMembers: 0,
    freeMembers: 0,
    paidMembers: 0,
    mrr: 0,
    percentChanges: ZERO_CHANGES,
    directions: SAME_DIRECTIONS
};

// ─── MRR change calculation ──────────────────────────────────────────────────

const isFromBeginningRange = (dateFrom: string): boolean => {
    const from = moment(dateFrom);
    return from.isSame(moment().startOf('year'), 'day') || from.year() < moment().year();
};

const calcMrrFirstValue = (
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    currentMrr: number
): number => {
    const actualStartDate = toYMD(moment(dateFrom));
    const firstActualPoint = mrrData.find(p => moment(p.date).isSameOrAfter(actualStartDate));
    const fromBeginning = isFromBeginningRange(dateFrom);

    if (!firstActualPoint) {
        return fromBeginning ? 0 : currentMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return fromBeginning ? 0 : currentMrr;
};

// ─── Member change calculations ──────────────────────────────────────────────

const calcMemberChanges = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMembers: number,
    currentTotals: {free: number; paid: number; comped: number}
) => {
    const percentChanges = {...ZERO_CHANGES};
    const directions = {...SAME_DIRECTIONS};

    if (memberData.length > 1) {
        const first = memberData[0];
        const latest = memberData[memberData.length - 1];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const {formatted, direction} = formatChange(calcPercentChange(totalMembers, firstTotal));
            percentChanges.total = formatted;
            directions.total = direction;
        }

        if (first.free > 0) {
            const {formatted, direction} = formatChange(calcPercentChange(latest.free, first.free));
            percentChanges.free = formatted;
            directions.free = direction;
        }

        const firstPaid = first.paid + first.comped;
        const latestPaid = latest.paid + latest.comped;
        if (firstPaid > 0) {
            const {formatted, direction} = formatChange(calcPercentChange(latestPaid, firstPaid));
            percentChanges.paid = formatted;
            directions.paid = direction;
        }
    }

    if (mrrData.length > 1) {
        const currentMrr = mrrData[mrrData.length - 1]?.mrr ?? 0;
        const firstMrr = calcMrrFirstValue(mrrData, dateFrom, currentMrr);
        const mrrChange = calcPercentChange(currentMrr, firstMrr);
        const {formatted, direction} = formatChange(mrrChange);
        percentChanges.mrr = formatted;
        directions.mrr = direction;
    }

    return {percentChanges, directions};
};

// ─── calculateTotals ─────────────────────────────────────────────────────────

const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) => {
    if (!memberData.length) {
        return EMPTY_TOTALS;
    }

    const currentTotals = memberCountTotals ?? memberData[memberData.length - 1];
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;

    const {percentChanges, directions} = calcMemberChanges(
        memberData, mrrData, dateFrom, totalMembers, currentTotals
    );

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges,
        directions
    };
};

// ─── formatChartData ─────────────────────────────────────────────────────────

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMembers = sortByDate(memberData);
    const sortedMrr = sortByDate(mrrData);

    const allDates = sortByDate([
        ...new Set([...sortedMembers.map(i => i.date), ...sortedMrr.map(i => i.date)])
    ].map(date => ({date}))).map(i => i.date);

    const memberMap = buildDateMap(sortedMembers);
    const mrrMap = buildDateMap(sortedMrr);

    let lastMember: MemberStatusItem | null = null;
    let lastMrr: MrrHistoryItem | null = null;

    return allDates.map((date) => {
        lastMember = memberMap.get(date) ?? lastMember;
        lastMrr = mrrMap.get(date) ?? lastMrr;

        const free = lastMember?.free ?? 0;
        const paid = lastMember?.paid ?? 0;
        const comped = lastMember?.comped ?? 0;
        const paidTotal = paid + comped;
        const value = free + paidTotal;
        const mrr = lastMrr?.mrr ?? 0;

        return {
            date,
            value,
            free,
            paid: paidTotal,
            comped,
            mrr,
            paid_subscribed: lastMember?.paid_subscribed ?? 0,
            paid_canceled: lastMember?.paid_canceled ?? 0,
            formattedValue: formatNumber(value),
            label: 'Total members'
        };
    });
};

// ─── MRR data processing ─────────────────────────────────────────────────────

const selectDominantCurrency = (totals: {currency: string; mrr: number}[]) =>
    totals.reduce((max, t) => (t.mrr > max.mrr ? t : max), totals[0]);

const ensureBoundaryPoint = (
    result: MrrHistoryItem[],
    targetDate: moment.Moment,
    allDataDesc: MrrHistoryItem[],
    position: 'start' | 'end'
): MrrHistoryItem[] => {
    const hasPoint = result.some(item => moment(item.date).isSame(targetDate, 'day'));
    if (hasPoint || result.length === 0) {
        return result;
    }

    const dateStr = toYMD(targetDate);

    if (position === 'start') {
        const source =
            allDataDesc.find(item => moment(item.date).isBefore(targetDate)) ??
            sortByDate(result)[0];
        if (source) {
            return [{...source, date: dateStr}, ...result];
        }
    } else {
        const source = sortByDate([...result]).reverse()[0];
        if (source) {
            return [...result, {...source, date: dateStr}];
        }
    }

    return result;
};

const processMrrData = (
    mrrHistoryResponse: {stats: MrrHistoryItem[]; meta: {totals: {currency: string; mrr: number}[]}} | undefined,
    dateFrom: string,
    range: number
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals?.length) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const dominant = selectDominantCurrency(mrrHistoryResponse.meta.totals);
    if (!dominant) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const currency = dominant.currency;
    const dateFromMoment = moment(dateFrom);
    const endDateMoment = range === 1 ? moment().startOf('day') : moment().startOf('day');

    const currencyData = mrrHistoryResponse.stats.filter(d => d.currency === currency);
    const allDataDesc = sortByDate(currencyData).reverse();

    let result = currencyData.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));

    result = ensureBoundaryPoint(result, dateFromMoment, allDataDesc, 'start');
    result = ensureBoundaryPoint(result, endDateMoment, allDataDesc, 'end');

    return {mrrData: sortByDate(result), selectedCurrency: currency};
};

// ─── Member data processing ──────────────────────────────────────────────────

const processMemberData = (
    memberCountResponse: {stats?: MemberStatusItem[]} | MemberStatusItem[] | undefined,
    range: number,
    dateFrom: string
): MemberStatusItem[] => {
    let rawData: MemberStatusItem[] = [];

    if (memberCountResponse && 'stats' in memberCountResponse && memberCountResponse.stats) {
        rawData = memberCountResponse.stats;
    } else if (Array.isArray(memberCountResponse)) {
        rawData = memberCountResponse;
    }

    if (range !== 1 || rawData.length < 2) {
        return rawData;
    }

    const yesterday = rawData[rawData.length - 2];
    const today = rawData[rawData.length - 1];

    return [
        {...yesterday, date: toYMD(moment(dateFrom))},
        {...today, date: toYMD(moment(dateFrom).add(1, 'day'))}
    ];
};

// ─── Subscription data processing ────────────────────────────────────────────

type SubscriptionStat = {date: string; signups: number; cancellations: number};

const mergeSubscriptionsByDate = (
    stats: {date: string; signups: number; cancellations: number}[]
): SubscriptionStat[] => {
    const merged = stats.reduce<Record<string, SubscriptionStat>>((acc, item) => {
        if (!acc[item.date]) {
            acc[item.date] = {date: item.date, signups: 0, cancellations: 0};
        }
        acc[item.date].signups += item.signups;
        acc[item.date].cancellations += item.cancellations;
        return acc;
    }, {});

    return sortByDate(Object.values(merged));
};

const processSubscriptionData = (
    subscriptionStatsResponse: {stats?: {date: string; signups: number; cancellations: number}[]} | undefined,
    dateFrom: string,
    endDate: Date
): SubscriptionStat[] => {
    if (!subscriptionStatsResponse?.stats) {
        return [];
    }

    const merged = mergeSubscriptionsByDate(subscriptionStatsResponse.stats);
    const from = moment(dateFrom);
    const to = moment(endDate);

    return merged.filter(item => {
        const d = moment(item.date);
        return d.isSameOrAfter(from) && d.isSameOrBefore(to);
    });
};

// ─── Main hook ───────────────────────────────────────────────────────────────

export const useGrowthStats = (range: number) => {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);

    const memberDataStartDate = range === 1
        ? toYMD(moment(dateFrom).subtract(1, 'day'))
        : dateFrom;

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemo(
        () => processMemberData(memberCountResponse, range, dateFrom),
        [memberCountResponse, range, dateFrom]
    );

    const {mrrData, selectedCurrency} = useMemo(
        () => processMrrData(mrrHistoryResponse, dateFrom, range),
        [mrrHistoryResponse, dateFrom, range]
    );

    const totals = useMemo(
        () => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals),
        [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]
    );

    const chartData = useMemo(
        () => formatChartData(memberData, mrrData),
        [memberData, mrrData]
    );

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = isMemberCountLoading || isMrrLoading || isSubscriptionLoading;

    const subscriptionData = useMemo(
        () => processSubscriptionData(