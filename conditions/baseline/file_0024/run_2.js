```typescript
import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

interface MemberTotals {
    free: number;
    paid: number;
    comped: number;
}

interface PercentChanges {
    total: string;
    free: string;
    paid: string;
    mrr: string;
}

interface Directions {
    total: DiffDirection;
    free: DiffDirection;
    paid: DiffDirection;
    mrr: DiffDirection;
}

interface TotalsData {
    totalMembers: number;
    freeMembers: number;
    paidMembers: number;
    mrr: number;
    percentChanges: PercentChanges;
    directions: Directions;
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

const EMPTY_TOTALS: TotalsData = {
    totalMembers: 0,
    freeMembers: 0,
    paidMembers: 0,
    mrr: 0,
    percentChanges: {total: '0%', free: '0%', paid: '0%', mrr: '0%'},
    directions: {total: 'same', free: 'same', paid: 'same', mrr: 'same'}
};

const getDirectionFromChange = (change: number): DiffDirection => {
    return change > 0 ? 'up' : change < 0 ? 'down' : 'same';
};

const calculatePercentageChange = (current: number, previous: number): {percentage: string; direction: DiffDirection} => {
    if (previous === 0) {
        return {
            percentage: formatPercentage(current > 0 ? 1 : 0),
            direction: getDirectionFromChange(current)
        };
    }
    const change = ((current - previous) / previous) * 100;
    return {
        percentage: formatPercentage(change / 100),
        direction: getDirectionFromChange(change)
    };
};

const calculateMemberChanges = (memberData: MemberStatusItem[], currentTotals: MemberTotals): {percentChanges: Partial<PercentChanges>; directions: Partial<Directions>} => {
    const result: {percentChanges: Partial<PercentChanges>; directions: Partial<Directions>} = {
        percentChanges: {},
        directions: {}
    };

    if (memberData.length <= 1) {
        return result;
    }

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];

    // Total members change
    const firstTotal = first.free + first.paid + first.comped;
    const currentTotal = currentTotals.free + currentTotals.paid + currentTotals.comped;
    if (firstTotal > 0) {
        const {percentage, direction} = calculatePercentageChange(currentTotal, firstTotal);
        result.percentChanges.total = percentage;
        result.directions.total = direction;
    }

    // Free members change
    if (first.free > 0) {
        const {percentage, direction} = calculatePercentageChange(currentTotals.free, first.free);
        result.percentChanges.free = percentage;
        result.directions.free = direction;
    }

    // Paid members change
    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;
    if (firstPaidTotal > 0) {
        const {percentage, direction} = calculatePercentageChange(latestPaidTotal, firstPaidTotal);
        result.percentChanges.paid = percentage;
        result.directions.paid = direction;
    }

    return result;
};

const calculateMrrChange = (mrrData: MrrHistoryItem[], dateFrom: string, currentMrr: number): {percentage: string; direction: DiffDirection} => {
    if (mrrData.length <= 1) {
        return {percentage: '0%', direction: 'same'};
    }

    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
    const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') || moment(dateFrom).year() < moment().year();

    let firstMrr = 0;

    if (firstActualPoint) {
        if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
            firstMrr = firstActualPoint.mrr;
        } else if (!isFromBeginningRange) {
            firstMrr = currentMrr;
        }
    } else if (!isFromBeginningRange) {
        firstMrr = currentMrr;
    }

    return calculatePercentageChange(currentMrr, firstMrr);
};

const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: MemberTotals): TotalsData => {
    if (!memberData.length) {
        return EMPTY_TOTALS;
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;

    const memberChanges = calculateMemberChanges(memberData, currentTotals);
    const mrrChange = calculateMrrChange(mrrData, dateFrom, latestMrr);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: latestMrr,
        percentChanges: {
            total: memberChanges.percentChanges.total ?? '0%',
            free: memberChanges.percentChanges.free ?? '0%',
            paid: memberChanges.percentChanges.paid ?? '0%',
            mrr: mrrChange.percentage
        },
        directions: {
            total: memberChanges.directions.total ?? 'same',
            free: memberChanges.directions.free ?? 'same',
            paid: memberChanges.directions.paid ?? 'same',
            mrr: mrrChange.direction
        }
    };
};

const sortByDate = <T extends {date: string}>(data: T[]): T[] => {
    return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const createDataMap = <T extends {date: string}>(data: T[]): Map<string, T> => {
    return new Map(data.map(item => [item.date, item]));
};

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]): ChartDataPoint[] => {
    const sortedMemberData = sortByDate(memberData);
    const sortedMrrData = sortByDate(mrrData);

    const memberMap = createDataMap(sortedMemberData);
    const mrrMap = createDataMap(sortedMrrData);

    const allDates = [...new Set([...sortedMemberData.map(d => d.date), ...sortedMrrData.map(d => d.date)])];
    const sortedDates = sortByDate(allDates.map(date => ({date})));

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    return sortedDates.map(({date}) => {
        lastMemberItem = memberMap.get(date) || lastMemberItem;
        lastMrrItem = mrrMap.get(date) || lastMrrItem;

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

const extractMemberData = (response: unknown, range: number, dateFrom: string): MemberStatusItem[] => {
    let rawData: MemberStatusItem[] = [];

    if (response && typeof response === 'object' && 'stats' in response) {
        rawData = (response as {stats: MemberStatusItem[]}).stats;
    } else if (Array.isArray(response)) {
        rawData = response;
    }

    if (range === 1 && rawData.length >= 2) {
        const yesterdayData = rawData[rawData.length - 2];
        const todayData = rawData[rawData.length - 1];
        const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
        const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

        return [
            {...yesterdayData, date: startOfToday},
            {...todayData, date: startOfTomorrow}
        ];
    }

    return rawData;
};

interface MrrResponse {
    stats: MrrHistoryItem[];
    meta?: {totals: Array<{currency: string; mrr: number}>};
}

const selectCurrencyAndFilter = (response: MrrResponse | undefined, dateFrom: string, range: number): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const currentMax = response.meta.totals.reduce((max, total) => total.mrr > max.mrr ? total : max);
    const useCurrency = currentMax.currency;

    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = sortByDate(response.stats.filter(d => d.currency === useCurrency));
    const filteredData = currencyFilteredData.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));

    const result = [...filteredData];

    // Ensure start point
    if (!result.some(item => moment(item.date).isSame(dateFromMoment, 'day'))) {
        const mostRecentBefore = currencyFilteredData.find(item => moment(item.date).isBefore(dateFromMoment));
        if (mostRecentBefore) {
            result.unshift({...mostRecentBefore, date: dateFromMoment.format('YYYY-MM-DD')});
        } else if (result.length > 0) {
            const earliest = result[0];
            result.unshift({...earliest, date: dateFromMoment.format('YYYY-MM-DD')});
        }
    }

    // Ensure end point
    const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    if (!result.some(item => moment(item.date).isSame(endDateToCheck, 'day')) && result.length > 0) {
        const mostRecent = sortByDate(result)[result.length - 1];
        result.push({...mostRecent, date: endDateToCheck.format('YYYY-MM-DD')});
    }

    return {mrrData: sortByDate(result), selectedCurrency: useCurrency};
};

const mergeSubscriptionStats = (stats: Array<{date: string; signups: number; cancellations: number}>): Array<{date: string; signups: number; cancellations: number}> => {
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
    const memberDataStartDate = range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom;

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemo(() => extractMemberData(memberCountResponse, range, dateFrom), [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => selectCurrencyAndFilter(mrrHistoryResponse as MrrResponse | undefined, dateFrom, range), [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, (memberCountResponse as {meta?: {totals?: MemberTotals}})?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse || typeof subscriptionStatsResponse !== 'object' || !('stats' in subscriptionStatsResponse)) {
            return [];
        }

        const stats = (subscriptionStatsResponse as {stats: Array<{date: string; signups: number; cancellations: number}>}).stats;
        const merged = mergeSubscriptionStats(stats);
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = moment(endDate);

        return merged.filter(item => {
            const itemDate = moment(item.date);
            return item