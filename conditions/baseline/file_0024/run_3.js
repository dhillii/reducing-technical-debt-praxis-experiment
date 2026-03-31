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

// --- Helpers ---

const getDirection = (change: number): DiffDirection =>
    change > 0 ? 'up' : change < 0 ? 'down' : 'same';

const calcPercentChange = (current: number, previous: number): number => {
    if (previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
};

const applyChange = (
    key: keyof PercentChanges,
    current: number,
    previous: number,
    percentChanges: PercentChanges,
    directions: Directions
) => {
    if (previous < 0) {
        return;
    }
    const change = calcPercentChange(current, previous);
    percentChanges[key] = formatPercentage(change / 100);
    directions[key] = getDirection(change);
};

const sortByDate = <T extends {date: string}>(items: T[]): T[] =>
    [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

// --- MRR helpers ---

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

// --- Core calculations ---

const calculateMemberPercentChanges = (
    memberData: MemberStatusItem[],
    totalMembers: number,
    percentChanges: PercentChanges,
    directions: Directions
) => {
    if (memberData.length <= 1) {
        return;
    }

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];
    const firstTotal = first.free + first.paid + first.comped;
    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;

    if (firstTotal > 0) {
        applyChange('total', totalMembers, firstTotal, percentChanges, directions);
    }
    if (first.free > 0) {
        applyChange('free', latest.free, first.free, percentChanges, directions);
    }
    if (firstPaidTotal > 0) {
        applyChange('paid', latestPaidTotal, firstPaidTotal, percentChanges, directions);
    }
};

const calculateMrrPercentChange = (
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number,
    percentChanges: PercentChanges,
    directions: Directions
) => {
    if (mrrData.length <= 1) {
        return;
    }

    const firstMrr = resolveFirstMrr(mrrData, dateFrom, totalMrr);
    applyChange('mrr', totalMrr, firstMrr, percentChanges, directions);
};

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

    const percentChanges = {...DEFAULT_PERCENT_CHANGES};
    const directions = {...DEFAULT_DIRECTIONS};

    calculateMemberPercentChanges(memberData, totalMembers, percentChanges, directions);
    calculateMrrPercentChange(mrrData, dateFrom, totalMrr, percentChanges, directions);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges,
        directions
    };
};

// --- Chart data ---

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = sortByDate(memberData);
    const sortedMrrData = sortByDate(mrrData);

    const allDates = [...new Set([
        ...sortedMemberData.map(i => i.date),
        ...sortedMrrData.map(i => i.date)
    ])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const memberMap = new Map(sortedMemberData.map(i => [i.date, i]));
    const mrrMap = new Map(sortedMrrData.map(i => [i.date, i]));

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    return allDates.map((date) => {
        lastMemberItem = memberMap.get(date) ?? lastMemberItem;
        lastMrrItem = mrrMap.get(date) ?? lastMrrItem;

        const free = lastMemberItem?.free ?? 0;
        const paid = lastMemberItem?.paid ?? 0;
        const comped = lastMemberItem?.comped ?? 0;
        const paidTotal = paid + comped;
        const value = free + paidTotal;

        return {
            date,
            value,
            free,
            paid: paidTotal,
            comped,
            mrr: lastMrrItem?.mrr ?? 0,
            paid_subscribed: lastMemberItem?.paid_subscribed ?? 0,
            paid_canceled: lastMemberItem?.paid_canceled ?? 0,
            formattedValue: formatNumber(value),
            label: 'Total members'
        };
    });
};

// --- MRR data processing ---

const ensureStartPoint = (
    result: MrrHistoryItem[],
    allDataDesc: MrrHistoryItem[],
    dateFromMoment: moment.Moment
) => {
    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (hasStartPoint) {
        return;
    }

    const mostRecentBefore = allDataDesc.find(item => moment(item.date).isBefore(dateFromMoment));
    const fallback = mostRecentBefore ?? sortByDate(result)[0];

    if (fallback) {
        result.unshift({...fallback, date: dateFromMoment.format('YYYY-MM-DD')});
    }
};

const ensureEndPoint = (
    result: MrrHistoryItem[],
    endDateMoment: moment.Moment
) => {
    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateMoment, 'day'));
    if (hasEndPoint || result.length === 0) {
        return;
    }

    const mostRecent = sortByDate(result).at(-1)!;
    result.push({...mostRecent, date: endDateMoment.format('YYYY-MM-DD')});
};

const processMrrData = (
    mrrHistoryResponse: {stats: MrrHistoryItem[]; meta: {totals: {currency: string; mrr: number}[]}} | undefined,
    dateFrom: string,
    range: number
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    const fallback = {mrrData: [], selectedCurrency: 'usd'};

    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return fallback;
    }

    const totals = mrrHistoryResponse.meta.totals;
    const topCurrency = totals.reduce((max, t) => (t.mrr > max.mrr ? t : max), totals[0]);

    if (!topCurrency) {
        return fallback;
    }

    const dateFromMoment = moment(dateFrom);
    const endDateMoment = range === 1 ? moment().startOf('day') : moment().startOf('day');

    const currencyData = mrrHistoryResponse.stats.filter(d => d.currency === topCurrency.currency);
    const filteredData = currencyData.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));
    const allDataDesc = [...currencyData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const result = [...filteredData];
    ensureStartPoint(result, allDataDesc, dateFromMoment);
    ensureEndPoint(result, endDateMoment);

    return {
        mrrData: sortByDate(result),
        selectedCurrency: topCurrency.currency
    };
};

// --- Member data processing ---

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

    const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
    const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

    return [
        {...rawData[rawData.length - 2], date: startOfToday},
        {...rawData[rawData.length - 1], date: startOfTomorrow}
    ];
};

// --- Subscription data processing ---

const processSubscriptionData = (
    subscriptionStatsResponse: {stats?: {date: string; signups: number; cancellations: number}[]} | undefined,
    dateFrom: string,
    endDate: Date
) => {
    if (!subscriptionStatsResponse?.stats) {
        return [];
    }

    const mergedByDate = subscriptionStatsResponse.stats.reduce<Record<string, {date: string; signups: number; cancellations: number}>>(
        (acc, current) => {
            if (!acc[current.date]) {
                acc[current.date] = {date: current.date, signups: 0, cancellations: 0};
            }
            acc[current.date].signups += current.signups;
            acc[current.date].cancellations += current.cancellations;
            return acc;
        },
        {}
    );

    const dateFromMoment = moment(dateFrom);
    const dateToMoment = moment(endDate);

    return Object.values(mergedByDate)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .filter(item => moment(item.date).isSameOrAfter(dateFromMoment) && moment(item.date).isSameOrBefore(dateToMoment));
};

// --- Main hook ---

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
        () => processSubscriptionData(subscriptionStatsResponse, dateFrom, endDate),
        [subscriptionStatsResponse, dateFrom, endDate]
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
```