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

const EMPTY_CHANGE_METRICS: ChangeMetrics = {
    percentChanges: {total: '0%', free: '0%', paid: '0%', mrr: '0%'},
    directions: {total: 'same', free: 'same', paid: 'same', mrr: 'same'}
};

const getDirection = (change: number): DiffDirection =>
    change > 0 ? 'up' : change < 0 ? 'down' : 'same';

const calcPercentChange = (current: number, previous: number): number => {
    if (previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
};

const applyChange = (
    metrics: ChangeMetrics,
    key: PercentChangeKeys,
    current: number,
    previous: number
): void => {
    if (previous < 0) {
        return;
    }
    const change = calcPercentChange(current, previous);
    metrics.percentChanges[key] = formatPercentage(change / 100);
    metrics.directions[key] = getDirection(change);
};

const calcMemberChanges = (
    memberData: MemberStatusItem[],
    totalMembers: number,
    metrics: ChangeMetrics
): void => {
    if (memberData.length <= 1) {
        return;
    }

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];
    const firstTotal = first.free + first.paid + first.comped;

    applyChange(metrics, 'total', totalMembers, firstTotal);
    applyChange(metrics, 'free', latest.free, first.free);
    applyChange(metrics, 'paid', latest.paid + latest.comped, first.paid + first.comped);
};

const resolveMrrStartValue = (
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number
): number => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(p => moment(p.date).isSameOrAfter(actualStartDate));

    const isFromBeginningRange =
        moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
        moment(dateFrom).year() < moment().year();

    if (!firstActualPoint) {
        return isFromBeginningRange ? 0 : totalMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return isFromBeginningRange ? 0 : totalMrr;
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

    const firstMrr = resolveMrrStartValue(mrrData, dateFrom, totalMrr);
    applyChange(metrics, 'mrr', totalMrr, firstMrr);
};

const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
): TotalsResult => {
    if (!memberData.length) {
        return {totalMembers: 0, freeMembers: 0, paidMembers: 0, mrr: 0, ...EMPTY_CHANGE_METRICS};
    }

    const currentTotals = memberCountTotals ?? memberData[memberData.length - 1];
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;

    const metrics: ChangeMetrics = {
        percentChanges: {...EMPTY_CHANGE_METRICS.percentChanges},
        directions: {...EMPTY_CHANGE_METRICS.directions}
    };

    calcMemberChanges(memberData, totalMembers, metrics);
    calcMrrChange(mrrData, dateFrom, totalMrr, metrics);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        ...metrics
    };
};

const sortByDate = <T extends {date: string}>(items: T[]): T[] =>
    [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const buildDateUnion = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]): string[] => {
    const allDates = new Set([...memberData.map(d => d.date), ...mrrData.map(d => d.date)]);
    return sortByDate([...allDates].map(date => ({date}))).map(d => d.date);
};

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMembers = sortByDate(memberData);
    const sortedMrr = sortByDate(mrrData);
    const allDates = buildDateUnion(sortedMembers, sortedMrr);

    const memberMap = new Map(sortedMembers.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrr.map(item => [item.date, item]));

    let lastMember: MemberStatusItem | null = null;
    let lastMrr: MrrHistoryItem | null = null;

    return allDates.map((date) => {
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

const extractMemberData = (
    memberCountResponse: {stats?: MemberStatusItem[]} | MemberStatusItem[] | undefined
): MemberStatusItem[] => {
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

const buildTodayMemberData = (rawData: MemberStatusItem[], dateFrom: string): MemberStatusItem[] => {
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

const selectDominantCurrency = (totals: {currency: string; mrr: number}[]): string => {
    if (!totals.length) {
        return 'usd';
    }
    return totals.reduce((max, t) => (t.mrr > max.mrr ? t : max), totals[0]).currency;
};

const ensureBoundaryPoint = (
    result: MrrHistoryItem[],
    targetDate: moment.Moment,
    allDataDesc: MrrHistoryItem[],
    position: 'start' | 'end'
): void => {
    const hasPoint = result.some(item => moment(item.date).isSame(targetDate, 'day'));
    if (hasPoint || result.length === 0) {
        return;
    }

    const dateStr = targetDate.format('YYYY-MM-DD');

    if (position === 'start') {
        const reference = allDataDesc.find(item => moment(item.date).isBefore(targetDate))
            ?? sortByDate(result)[0];
        if (reference) {
            result.unshift({...reference, date: dateStr});
        }
    } else {
        const reference = sortByDate(result).reverse()[0];
        if (reference) {
            result.push({...reference, date: dateStr});
        }
    }
};

const processMrrData = (
    mrrHistoryResponse: {stats?: MrrHistoryItem[]; meta?: {totals?: {currency: string; mrr: number}[]}} | undefined,
    dateFrom: string,
    range: number
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    const empty = {mrrData: [], selectedCurrency: 'usd'};

    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return empty;
    }

    const totals = mrrHistoryResponse.meta.totals;
    if (!totals.length) {
        return empty;
    }

    const selectedCurrency = selectDominantCurrency(totals);
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().startOf('day') : moment().startOf('day');

    const currencyData = mrrHistoryResponse.stats.filter(d => d.currency === selectedCurrency);
    const allDataDesc = sortByDate(currencyData).reverse();
    const result = currencyData.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));

    ensureBoundaryPoint(result, dateFromMoment, allDataDesc, 'start');
    ensureBoundaryPoint(result, dateToMoment, allDataDesc, 'end');

    return {mrrData: sortByDate(result), selectedCurrency};
};

const mergeSubscriptionsByDate = (
    stats: {date: string; signups: number; cancellations: number}[]
): {date: string; signups: number; cancellations: number}[] => {
    const merged = stats.reduce((acc, current) => {
        if (!acc[current.date]) {
            acc[current.date] = {date: current.date, signups: 0, cancellations: 0};
        }
        acc[current.date].signups += current.signups;
        acc[current.date].cancellations += current.cancellations;
        return acc;
    }, {} as Record<string, {date: string; signups: number; cancellations: number}>);

    return sortByDate(Object.values(merged));
};

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

    const memberData = useMemo(() => {
        const rawData = extractMemberData(memberCountResponse as Parameters<typeof extractMemberData>[0]);
        return range === 1 ? buildTodayMemberData(rawData, dateFrom) : rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(
        () => processMrrData(mrrHistoryResponse, dateFrom, range),
        [mrrHistoryResponse, dateFrom, range]
    );

    const totals = useMemo(
        () => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals),
        [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]
    );

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = isMemberCountLoading || isMrrLoading || isSubscriptionLoading;

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        const merged = mergeSubscriptionsByDate(subscriptionStatsResponse.stats);
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = moment(endDate);

        return merged.filter(item =>
            moment(item.date).isSameOrAfter(dateFromMoment) &&
            moment(item.date).isSameOrBefore(dateToMoment)
        );
    }, [subscriptionStatsResponse, dateFrom, endDate]);

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