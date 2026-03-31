```typescript
import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

type PercentChanges = Record<'total' | 'free' | 'paid' | 'mrr', string>;
type Directions = Record<'total' | 'free' | 'paid' | 'mrr', DiffDirection>;

interface Totals {
    totalMembers: number;
    freeMembers: number;
    paidMembers: number;
    mrr: number;
    percentChanges: PercentChanges;
    directions: Directions;
}

const DEFAULT_PERCENT_CHANGES: PercentChanges = {total: '0%', free: '0%', paid: '0%', mrr: '0%'};
const DEFAULT_DIRECTIONS: Directions = {total: 'same', free: 'same', paid: 'same', mrr: 'same'};

const getDirection = (change: number): DiffDirection => {
    if (change > 0) {
        return 'up';
    }
    if (change < 0) {
        return 'down';
    }
    return 'same';
};

const calcPercentChange = (current: number, previous: number): number => {
    if (previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
};

const calcMemberPercentChanges = (
    memberData: MemberStatusItem[],
    currentTotals: {free: number; paid: number; comped: number},
    totalMembers: number
): {percentChanges: PercentChanges; directions: Directions} => {
    if (memberData.length <= 1) {
        return {percentChanges: DEFAULT_PERCENT_CHANGES, directions: DEFAULT_DIRECTIONS};
    }

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];
    const firstTotal = first.free + first.paid + first.comped;
    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;

    const percentChanges = {...DEFAULT_PERCENT_CHANGES};
    const directions = {...DEFAULT_DIRECTIONS};

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

    if (firstPaidTotal > 0) {
        const paidChange = calcPercentChange(latestPaidTotal, firstPaidTotal);
        percentChanges.paid = formatPercentage(paidChange / 100);
        directions.paid = getDirection(paidChange);
    }

    return {percentChanges, directions};
};

const isFromBeginningRange = (dateFrom: string): boolean => {
    return (
        moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
        moment(dateFrom).year() < moment().year()
    );
};

const calcMrrFirstValue = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
    const fromBeginning = isFromBeginningRange(dateFrom);

    if (!firstActualPoint) {
        return fromBeginning ? 0 : totalMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return fromBeginning ? 0 : totalMrr;
};

const calcMrrPercentChange = (
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number
): {percentChange: string; direction: DiffDirection} => {
    if (mrrData.length <= 1) {
        return {percentChange: '0%', direction: 'same'};
    }

    const firstMrr = calcMrrFirstValue(mrrData, dateFrom, totalMrr);
    const mrrChange = calcPercentChange(totalMrr, firstMrr);

    return {
        percentChange: formatPercentage(mrrChange / 100),
        direction: getDirection(mrrChange)
    };
};

const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
): Totals => {
    if (!memberData.length) {
        return {
            totalMembers: 0,
            freeMembers: 0,
            paidMembers: 0,
            mrr: 0,
            percentChanges: DEFAULT_PERCENT_CHANGES,
            directions: DEFAULT_DIRECTIONS
        };
    }

    const currentTotals = memberCountTotals ?? memberData[memberData.length - 1];
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;

    const {percentChanges, directions} = calcMemberPercentChanges(memberData, currentTotals, totalMembers);

    const {percentChange: mrrPercentChange, direction: mrrDirection} = calcMrrPercentChange(mrrData, dateFrom, totalMrr);
    percentChanges.mrr = mrrPercentChange;
    directions.mrr = mrrDirection;

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges,
        directions
    };
};

const sortByDate = <T extends {date: string}>(data: T[]): T[] =>
    [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = sortByDate(memberData);
    const sortedMrrData = sortByDate(mrrData);

    const allDates = sortByDate([
        ...new Set([...sortedMemberData.map(i => i.date), ...sortedMrrData.map(i => i.date)])
    ].map(date => ({date}))).map(i => i.date);

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

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

const selectHighestMrrCurrency = (totals: {currency: string; mrr: number}[]): string => {
    if (!totals.length) {
        return 'usd';
    }
    return totals.reduce((max, t) => (t.mrr > max.mrr ? t : max), totals[0]).currency;
};

const ensureBoundaryPoint = (
    result: MrrHistoryItem[],
    targetDate: moment.Moment,
    fallbackData: MrrHistoryItem[],
    position: 'start' | 'end'
): MrrHistoryItem[] => {
    const hasPoint = result.some(item => moment(item.date).isSame(targetDate, 'day'));
    if (hasPoint || result.length === 0) {
        return result;
    }

    const sorted = sortByDate(fallbackData);
    let sourcePoint: MrrHistoryItem | undefined;

    if (position === 'start') {
        sourcePoint = [...sorted].reverse().find(item => moment(item.date).isBefore(targetDate))
            ?? sorted[0];
    } else {
        sourcePoint = [...sorted].reverse()[0];
    }

    if (!sourcePoint) {
        return result;
    }

    const boundaryPoint = {...sourcePoint, date: targetDate.format('YYYY-MM-DD')};
    return position === 'start'
        ? [boundaryPoint, ...result]
        : [...result, boundaryPoint];
};

const processMrrData = (
    mrrHistoryResponse: {stats: MrrHistoryItem[]; meta: {totals: {currency: string; mrr: number}[]}} | undefined,
    dateFrom: string,
    range: number
): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const {stats, meta: {totals}} = mrrHistoryResponse;
    const selectedCurrency = selectHighestMrrCurrency(totals);

    if (!selectedCurrency) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const dateFromMoment = moment(dateFrom);
    const endDateMoment = range === 1 ? moment().startOf('day') : moment().startOf('day');

    const currencyData = stats.filter(d => d.currency === selectedCurrency);
    let result = currencyData.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));

    result = ensureBoundaryPoint(result, dateFromMoment, currencyData, 'start');
    result = ensureBoundaryPoint(result, endDateMoment, result, 'end');

    return {mrrData: sortByDate(result), selectedCurrency};
};

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

    if (range === 1 && rawData.length >= 2) {
        const yesterdayData = rawData[rawData.length - 2];
        const todayData = rawData[rawData.length - 1];

        return [
            {...yesterdayData, date: moment(dateFrom).format('YYYY-MM-DD')},
            {...todayData, date: moment(dateFrom).add(1, 'day').format('YYYY-MM-DD')}
        ];
    }

    return rawData;
};

const mergeSubscriptionStatsByDate = (
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

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        const merged = mergeSubscriptionStatsByDate(subscriptionStatsResponse.stats);
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