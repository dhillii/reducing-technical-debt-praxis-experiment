```typescript
import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

type PercentChangeKeys = 'total' | 'free' | 'paid' | 'mrr';

interface ChangeMetrics {
    percentChanges: Record<PercentChangeKeys, string>;
    directions: Record<PercentChangeKeys, DiffDirection>;
}

interface TotalsResult extends ChangeMetrics {
    totalMembers: number;
    freeMembers: number;
    paidMembers: number;
    mrr: number;
}

interface ChartDataPoint {
    date: string;
    value: number;
    free: number;
    paid: number;
    comped: number;
    mrr: number;
    paid_subscribed: number;
    paid_canceled: number;
    formattedValue: string;
    label: string;
}

interface SubscriptionDataPoint {
    date: string;
    signups: number;
    cancellations: number;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

const getDirection = (change: number): DiffDirection =>
    change > 0 ? 'up' : change < 0 ? 'down' : 'same';

const emptyChangeMetrics = (): ChangeMetrics => ({
    percentChanges: {total: '0%', free: '0%', paid: '0%', mrr: '0%'},
    directions: {total: 'same', free: 'same', paid: 'same', mrr: 'same'}
});

const calcPercentChange = (current: number, previous: number): number => {
    if (previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
};

const applyChange = (
    metrics: ChangeMetrics,
    key: PercentChangeKeys,
    change: number
): void => {
    metrics.percentChanges[key] = formatPercentage(change / 100);
    metrics.directions[key] = getDirection(change);
};

// ─── Member change calculations ──────────────────────────────────────────────

const calcMemberChanges = (
    memberData: MemberStatusItem[],
    currentTotals: {free: number; paid: number; comped: number},
    totalMembers: number,
    metrics: ChangeMetrics
): void => {
    if (memberData.length <= 1) {
        return;
    }

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];
    const firstTotal = first.free + first.paid + first.comped;

    if (firstTotal > 0) {
        applyChange(metrics, 'total', calcPercentChange(totalMembers, firstTotal));
    }

    if (first.free > 0) {
        applyChange(metrics, 'free', calcPercentChange(latest.free, first.free));
    }

    const firstPaid = first.paid + first.comped;
    const latestPaid = latest.paid + latest.comped;
    if (firstPaid > 0) {
        applyChange(metrics, 'paid', calcPercentChange(latestPaid, firstPaid));
    }
};

// ─── MRR change calculations ─────────────────────────────────────────────────

const isFromBeginningRange = (dateFrom: string): boolean =>
    moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
    moment(dateFrom).year() < moment().year();

const resolveFirstMrr = (
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number
): number => {
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

const calcMrrChange = (
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number,
    metrics: ChangeMetrics
): void => {
    if (mrrData.length <= 1) {
        return;
    }

    const firstMrr = resolveFirstMrr(mrrData, dateFrom, totalMrr);
    const mrrChange = calcPercentChange(totalMrr, firstMrr);
    applyChange(metrics, 'mrr', mrrChange);
};

// ─── calculateTotals ─────────────────────────────────────────────────────────

const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
): TotalsResult => {
    const empty: TotalsResult = {
        totalMembers: 0,
        freeMembers: 0,
        paidMembers: 0,
        mrr: 0,
        ...emptyChangeMetrics()
    };

    if (!memberData.length) {
        return empty;
    }

    const currentTotals = memberCountTotals ?? memberData[memberData.length - 1];
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;

    const metrics = emptyChangeMetrics();
    calcMemberChanges(memberData, currentTotals, totalMembers, metrics);
    calcMrrChange(mrrData, dateFrom, totalMrr, metrics);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        ...metrics
    };
};

// ─── formatChartData ─────────────────────────────────────────────────────────

const sortByDate = <T extends {date: string}>(items: T[]): T[] =>
    [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const buildDateUnion = (a: string[], b: string[]): string[] =>
    [...new Set([...a, ...b])].sort((x, y) => new Date(x).getTime() - new Date(y).getTime());

const formatChartData = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[]
): ChartDataPoint[] => {
    const sortedMembers = sortByDate(memberData);
    const sortedMrr = sortByDate(mrrData);

    const allDates = buildDateUnion(
        sortedMembers.map(i => i.date),
        sortedMrr.map(i => i.date)
    );

    const memberMap = new Map(sortedMembers.map(i => [i.date, i]));
    const mrrMap = new Map(sortedMrr.map(i => [i.date, i]));

    let lastMember: MemberStatusItem | null = null;
    let lastMrr: MrrHistoryItem | null = null;

    return allDates.map((date): ChartDataPoint => {
        lastMember = memberMap.get(date) ?? lastMember;
        lastMrr = mrrMap.get(date) ?? lastMrr;

        const free = lastMember?.free ?? 0;
        const paid = lastMember?.paid ?? 0;
        const comped = lastMember?.comped ?? 0;
        const paidTotal = paid + comped;

        return {
            date,
            value: free + paidTotal,
            free,
            paid: paidTotal,
            comped,
            mrr: lastMrr?.mrr ?? 0,
            paid_subscribed: lastMember?.paid_subscribed ?? 0,
            paid_canceled: lastMember?.paid_canceled ?? 0,
            formattedValue: formatNumber(free + paidTotal),
            label: 'Total members'
        };
    });
};

// ─── MRR data processing ─────────────────────────────────────────────────────

const selectDominantCurrency = (
    totals: {currency: string; mrr: number}[]
): string => totals.reduce((max, t) => (t.mrr > max.mrr ? t : max), totals[0]).currency;

const ensureBoundaryPoint = (
    result: MrrHistoryItem[],
    targetDate: moment.Moment,
    allDataDesc: MrrHistoryItem[],
    position: 'start' | 'end'
): void => {
    const hasPoint = result.some(i => moment(i.date).isSame(targetDate, 'day'));
    if (hasPoint || result.length === 0) {
        return;
    }

    const dateStr = targetDate.format('YYYY-MM-DD');

    if (position === 'start') {
        const source =
            allDataDesc.find(i => moment(i.date).isBefore(targetDate)) ??
            sortByDate(result)[0];
        if (source) {
            result.unshift({...source, date: dateStr});
        }
    } else {
        const source = sortByDate(result).reverse()[0];
        result.push({...source, date: dateStr});
    }
};

const processMrrData = (
    mrrHistoryResponse: {
        stats: MrrHistoryItem[];
        meta: {totals: {currency: string; mrr: number}[]};
    },
    dateFrom: string,
    range: number
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    const {stats, meta} = mrrHistoryResponse;
    if (!stats || !meta?.totals?.length) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const currency = selectDominantCurrency(meta.totals);
    const dateFromMoment = moment(dateFrom);
    const endMoment = range === 1 ? moment().startOf('day') : moment().startOf('day');

    const currencyData = stats.filter(d => d.currency === currency);
    const allDataDesc = sortByDate(currencyData).reverse();
    const result = currencyData.filter(i => moment(i.date).isSameOrAfter(dateFromMoment));

    ensureBoundaryPoint(result, dateFromMoment, allDataDesc, 'start');
    ensureBoundaryPoint(result, endMoment, allDataDesc, 'end');

    return {
        mrrData: sortByDate(result),
        selectedCurrency: currency
    };
};

// ─── Member data processing ───────────────────────────────────────────────────

const extractMemberData = (memberCountResponse: {stats?: MemberStatusItem[]} | MemberStatusItem[] | undefined): MemberStatusItem[] => {
    if (!memberCountResponse) {
        return [];
    }
    if ('stats' in memberCountResponse && memberCountResponse.stats) {
        return memberCountResponse.stats;
    }
    if (Array.isArray(memberCountResponse)) {
        return memberCountResponse;
    }
    return [];
};

const buildTodayMemberData = (
    rawData: MemberStatusItem[],
    dateFrom: string
): MemberStatusItem[] => {
    if (rawData.length < 2) {
        return rawData;
    }

    const yesterday = rawData[rawData.length - 2];
    const today = rawData[rawData.length - 1];

    return [
        {...yesterday, date: moment(dateFrom).format('YYYY-MM-DD')},
        {...today, date: moment(dateFrom).add(1, 'day').format('YYYY-MM-DD')}
    ];
};

// ─── Subscription data processing ────────────────────────────────────────────

const mergeSubscriptionsByDate = (
    stats: {date: string; signups: number; cancellations: number}[]
): SubscriptionDataPoint[] => {
    const merged = stats.reduce<Record<string, SubscriptionDataPoint>>((acc, item) => {
        if (!acc[item.date]) {
            acc[item.date] = {date: item.date, signups: 0, cancellations: 0};
        }
        acc[item.date].signups += item.signups;
        acc[item.date].cancellations += item.cancellations;
        return acc;
    }, {});

    return sortByDate(Object.values(merged));
};

// ─── useGrowthStats ───────────────────────────────────────────────────────────

export const useGrowthStats = (range: number) => {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);

    const memberDataStartDate =
        range === 1
            ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD')
            : dateFrom;

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemo(() => {
        const raw = extractMemberData(memberCountResponse as {stats?: MemberStatusItem[]} | MemberStatusItem[] | undefined);
        return range === 1 ? buildTodayMemberData(raw, dateFrom) : raw;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        if (mrrHistoryResponse?.stats && mrrHistoryResponse?.meta?.totals) {
            return processMrrData(mrrHistoryResponse as {stats: MrrHistoryItem[]; meta: {totals: {currency: string; mrr: number}[]}}, dateFrom, range);
        }
        return {mrrData: [] as MrrHistoryItem[], selectedCurrency: 'usd'};
    }, [mrrHistoryResponse, dateFrom, range]);

    const totals = useMemo(
        () => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals),
        [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]
    );

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = isMemberCountLoading || isMrrLoading || isSubscriptionLoading;

    const subscriptionData = useMemo