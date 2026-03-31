```typescript
import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

type PercentChanges = Record<'total' | 'free' | 'paid' | 'mrr', string>;
type Directions = Record<'total' | 'free' | 'paid' | 'mrr', DiffDirection>;

const DEFAULT_PERCENT_CHANGES: PercentChanges = {total: '0%', free: '0%', paid: '0%', mrr: '0%'};
const DEFAULT_DIRECTIONS: Directions = {total: 'same', free: 'same', paid: 'same', mrr: 'same'};

const EMPTY_TOTALS = {
    totalMembers: 0,
    freeMembers: 0,
    paidMembers: 0,
    mrr: 0,
    percentChanges: DEFAULT_PERCENT_CHANGES,
    directions: DEFAULT_DIRECTIONS
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const getDirection = (change: number): DiffDirection =>
    change > 0 ? 'up' : change < 0 ? 'down' : 'same';

const calcPercentChange = (current: number, previous: number): number =>
    previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100;

const sortByDate = <T extends {date: string}>(items: T[]): T[] =>
    [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const toDateMap = <T extends {date: string}>(items: T[]): Map<string, T> =>
    new Map(items.map(item => [item.date, item]));

// ─── MRR Helpers ────────────────────────────────────────────────────────────

const isFromBeginningRange = (dateFrom: string): boolean =>
    moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
    moment(dateFrom).year() < moment().year();

const resolveFirstMrr = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(p => moment(p.date).isSameOrAfter(actualStartDate));
    const fromBeginning = isFromBeginningRange(dateFrom);

    if (!firstActualPoint) {
        return fromBeginning ? 0 : totalMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return fromBeginning ? 0 : totalMrr;
};

const selectDominantCurrency = (totals: {currency: string; mrr: number}[]) =>
    totals.reduce((max, t) => (t.mrr > max.mrr ? t : max), totals[0]);

// ─── Boundary Point Helpers ──────────────────────────────────────────────────

const ensureStartPoint = (
    result: MrrHistoryItem[],
    allDataDesc: MrrHistoryItem[],
    dateFromMoment: moment.Moment
): MrrHistoryItem[] => {
    const hasStart = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (hasStart) {
        return result;
    }

    const beforeRange = allDataDesc.find(item => moment(item.date).isBefore(dateFromMoment));
    const fallback = beforeRange ?? sortByDate(result)[0];

    return fallback
        ? [{...fallback, date: dateFromMoment.format('YYYY-MM-DD')}, ...result]
        : result;
};

const ensureEndPoint = (
    result: MrrHistoryItem[],
    endDateMoment: moment.Moment
): MrrHistoryItem[] => {
    const hasEnd = result.some(item => moment(item.date).isSame(endDateMoment, 'day'));
    if (hasEnd || result.length === 0) {
        return result;
    }

    const mostRecent = sortByDate(result).at(-1)!;
    return [...result, {...mostRecent, date: endDateMoment.format('YYYY-MM-DD')}];
};

// ─── calculateTotals ────────────────────────────────────────────────────────

const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) => {
    if (!memberData.length) {
        return EMPTY_TOTALS;
    }

    const currentTotals = memberCountTotals ?? memberData.at(-1)!;
    const latest = memberData.at(-1) ?? {free: 0, paid: 0, comped: 0};
    const totalMrr = mrrData.at(-1)?.mrr ?? 0;
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;

    const percentChanges = {...DEFAULT_PERCENT_CHANGES};
    const directions = {...DEFAULT_DIRECTIONS};

    if (memberData.length > 1) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const totalChange = calcPercentChange(totalMembers, firstTotal);
            percentChanges.total = formatPercentage(totalChange / 100);
            directions.total = getDirection(totalChange);
        }

        if (first.free > 0) {
            const freeChange = calcPercentChange(latest.free, first.free);
            percentChanges.free = formatPercentage(freeChange / 100);
            directions.free = getDirection(freeChange);
        }

        const firstPaid = first.paid + first.comped;
        const latestPaid = latest.paid + latest.comped;
        if (firstPaid > 0) {
            const paidChange = calcPercentChange(latestPaid, firstPaid);
            percentChanges.paid = formatPercentage(paidChange / 100);
            directions.paid = getDirection(paidChange);
        }
    }

    if (mrrData.length > 1) {
        const firstMrr = resolveFirstMrr(mrrData, dateFrom, totalMrr);
        const mrrChange = calcPercentChange(totalMrr, firstMrr);
        percentChanges.mrr = formatPercentage(mrrChange / 100);
        directions.mrr = getDirection(mrrChange);
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

// ─── formatChartData ─────────────────────────────────────────────────────────

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMembers = sortByDate(memberData);
    const sortedMrr = sortByDate(mrrData);

    const allDates = [...new Set([
        ...sortedMembers.map(i => i.date),
        ...sortedMrr.map(i => i.date)
    ])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const memberMap = toDateMap(sortedMembers);
    const mrrMap = toDateMap(sortedMrr);

    let lastMember: MemberStatusItem | null = null;
    let lastMrr: MrrHistoryItem | null = null;

    return allDates.map((date) => {
        lastMember = memberMap.get(date) ?? lastMember;
        lastMrr = mrrMap.get(date) ?? lastMrr;

        const free = lastMember?.free ?? 0;
        const paid = (lastMember?.paid ?? 0) + (lastMember?.comped ?? 0);
        const value = free + paid;

        return {
            date,
            value,
            free,
            paid,
            comped: lastMember?.comped ?? 0,
            mrr: lastMrr?.mrr ?? 0,
            paid_subscribed: lastMember?.paid_subscribed ?? 0,
            paid_canceled: lastMember?.paid_canceled ?? 0,
            formattedValue: formatNumber(value),
            label: 'Total members'
        };
    });
};

// ─── useMemberData ───────────────────────────────────────────────────────────

const useMemberData = (
    memberCountResponse: {stats?: MemberStatusItem[]} | MemberStatusItem[] | undefined,
    range: number,
    dateFrom: string
): MemberStatusItem[] =>
    useMemo(() => {
        const rawData: MemberStatusItem[] = Array.isArray(memberCountResponse)
            ? memberCountResponse
            : (memberCountResponse?.stats ?? []);

        if (range !== 1 || rawData.length < 2) {
            return rawData;
        }

        const yesterday = rawData.at(-2)!;
        const today = rawData.at(-1)!;

        return [
            {...yesterday, date: moment(dateFrom).format('YYYY-MM-DD')},
            {...today, date: moment(dateFrom).add(1, 'day').format('YYYY-MM-DD')}
        ];
    }, [memberCountResponse, range, dateFrom]);

// ─── useMrrData ──────────────────────────────────────────────────────────────

const useMrrData = (
    mrrHistoryResponse: {stats?: MrrHistoryItem[]; meta?: {totals: {currency: string; mrr: number}[]}} | undefined,
    dateFrom: string,
    range: number
) =>
    useMemo(() => {
        const stats = mrrHistoryResponse?.stats;
        const totals = mrrHistoryResponse?.meta?.totals;

        if (!stats || !totals?.length) {
            return {mrrData: [] as MrrHistoryItem[], selectedCurrency: 'usd'};
        }

        const dominant = selectDominantCurrency(totals);
        if (!dominant) {
            return {mrrData: [] as MrrHistoryItem[], selectedCurrency: 'usd'};
        }

        const useCurrency = dominant.currency;
        const dateFromMoment = moment(dateFrom);
        const endDateMoment = range === 1 ? moment().startOf('day') : moment().startOf('day');

        const currencyData = stats.filter(d => d.currency === useCurrency);
        const inRange = currencyData.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));
        const allDesc = sortByDate(currencyData).reverse();

        let result = inRange;
        result = ensureStartPoint(result, allDesc, dateFromMoment);
        result = ensureEndPoint(result, endDateMoment);
        result = sortByDate(result);

        return {mrrData: result, selectedCurrency: useCurrency};
    }, [mrrHistoryResponse, dateFrom, range]);

// ─── useSubscriptionData ─────────────────────────────────────────────────────

const useSubscriptionData = (
    subscriptionStatsResponse: {stats?: {date: string; signups: number; cancellations: number}[]} | undefined,
    dateFrom: string,
    endDate: Date
) =>
    useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        const mergedByDate = subscriptionStatsResponse.stats.reduce<
            Record<string, {date: string; signups: number; cancellations: number}>
        >((acc, current) => {
            if (!acc[current.date]) {
                acc[current.date] = {date: current.date, signups: 0, cancellations: 0};
            }
            acc[current.date].signups += current.signups;
            acc[current.date].cancellations += current.cancellations;
            return acc;
        }, {});

        const dateFromMoment = moment(dateFrom);
        const dateToMoment = moment(endDate);

        return sortByDate(Object.values(mergedByDate)).filter(item =>
            moment(item.date).isSameOrAfter(dateFromMoment) &&
            moment(item.date).isSameOrBefore(dateToMoment)
        );
    }, [subscriptionStatsResponse, dateFrom, endDate]);

// ─── useGrowthStats ──────────────────────────────────────────────────────────

export const useGrowthStats = (range: number) => {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);
    const memberDataStartDate = range === 1
        ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD')
        : dateFrom;

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemberData(memberCountResponse, range, dateFrom);
    const {mrrData, selectedCurrency} = useMrrData(mrrHistoryResponse, dateFrom, range);

    const totals = useMemo(
        () => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals),
        [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]
    );

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);
    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);
    const subscriptionData = useSubscriptionData(subscriptionStatsResponse, dateFrom, endDate);
    const isLoading = isMemberCountLoading || isMrrLoading || isSubscriptionLoading;

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
```