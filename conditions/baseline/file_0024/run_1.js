```typescript
import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

interface TotalsData {
    totalMembers: number;
    freeMembers: number;
    paidMembers: number;
    mrr: number;
    percentChanges: Record<string, string>;
    directions: Record<string, DiffDirection>;
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

const DEFAULT_TOTALS: TotalsData = {
    totalMembers: 0,
    freeMembers: 0,
    paidMembers: 0,
    mrr: 0,
    percentChanges: {total: '0%', free: '0%', paid: '0%', mrr: '0%'},
    directions: {total: 'same', free: 'same', paid: 'same', mrr: 'same'}
};

const getDirection = (change: number): DiffDirection => {
    return change > 0 ? 'up' : change < 0 ? 'down' : 'same';
};

const calculatePercentageChange = (current: number, previous: number): {percentage: string; direction: DiffDirection} => {
    if (previous === 0) {
        return {
            percentage: formatPercentage(current > 0 ? 1 : 0),
            direction: getDirection(current)
        };
    }
    const change = ((current - previous) / previous) * 100;
    return {
        percentage: formatPercentage(change / 100),
        direction: getDirection(change)
    };
};

const calculateMemberTotals = (memberData: MemberStatusItem[], memberCountTotals?: {paid: number; free: number; comped: number}) => {
    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const first = memberData[0];

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const firstTotal = first.free + first.paid + first.comped;

    const totalChange = firstTotal > 0 ? calculatePercentageChange(totalMembers, firstTotal) : {percentage: '0%', direction: 'same' as DiffDirection};

    const freeChange = first.free > 0 ? calculatePercentageChange(currentTotals.free, first.free) : {percentage: '0%', direction: 'same' as DiffDirection};

    const firstPaidTotal = first.paid + first.comped;
    const currentPaidTotal = currentTotals.paid + currentTotals.comped;
    const paidChange = firstPaidTotal > 0 ? calculatePercentageChange(currentPaidTotal, firstPaidTotal) : {percentage: '0%', direction: 'same' as DiffDirection};

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentPaidTotal,
        percentChanges: {
            total: totalChange.percentage,
            free: freeChange.percentage,
            paid: paidChange.percentage
        },
        directions: {
            total: totalChange.direction,
            free: freeChange.direction,
            paid: paidChange.direction
        }
    };
};

const calculateMrrStartPoint = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
    const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') || moment(dateFrom).year() < moment().year();

    if (!firstActualPoint) {
        return isFromBeginningRange ? 0 : totalMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return isFromBeginningRange ? 0 : totalMrr;
};

const calculateMrrChange = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): {percentage: string; direction: DiffDirection} => {
    const firstMrr = calculateMrrStartPoint(mrrData, dateFrom, totalMrr);
    const mrrChange = firstMrr === 0 ? (totalMrr > 0 ? 100 : 0) : ((totalMrr - firstMrr) / firstMrr) * 100;

    return {
        percentage: formatPercentage(mrrChange / 100),
        direction: getDirection(mrrChange)
    };
};

const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}): TotalsData => {
    if (!memberData.length) {
        return DEFAULT_TOTALS;
    }

    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;
    const memberTotals = memberData.length > 1 ? calculateMemberTotals(memberData, memberCountTotals) : {
        totalMembers: memberCountTotals?.free ?? 0 + memberCountTotals?.paid ?? 0 + memberCountTotals?.comped ?? 0,
        freeMembers: memberCountTotals?.free ?? 0,
        paidMembers: (memberCountTotals?.paid ?? 0) + (memberCountTotals?.comped ?? 0),
        percentChanges: {total: '0%', free: '0%', paid: '0%'},
        directions: {total: 'same' as DiffDirection, free: 'same' as DiffDirection, paid: 'same' as DiffDirection}
    };

    const mrrChange = mrrData.length > 1 ? calculateMrrChange(mrrData, dateFrom, latestMrr) : {percentage: '0%', direction: 'same' as DiffDirection};

    return {
        totalMembers: memberTotals.totalMembers,
        freeMembers: memberTotals.freeMembers,
        paidMembers: memberTotals.paidMembers,
        mrr: latestMrr,
        percentChanges: {
            total: memberTotals.percentChanges.total,
            free: memberTotals.percentChanges.free,
            paid: memberTotals.percentChanges.paid,
            mrr: mrrChange.percentage
        },
        directions: {
            total: memberTotals.directions.total,
            free: memberTotals.directions.free,
            paid: memberTotals.directions.paid,
            mrr: mrrChange.direction
        }
    };
};

const sortByDate = <T extends {date: string}>(data: T[]): T[] => {
    return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const createDataMaps = <T extends {date: string}>(data: T[]): Map<string, T> => {
    return new Map(data.map(item => [item.date, item]));
};

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]): ChartDataPoint[] => {
    const sortedMemberData = sortByDate(memberData);
    const sortedMrrData = sortByDate(mrrData);

    const allDates = [...new Set([...sortedMemberData.map(d => d.date), ...sortedMrrData.map(d => d.date)])].sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    const memberMap = createDataMaps(sortedMemberData);
    const mrrMap = createDataMaps(sortedMrrData);

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    return allDates.map((date) => {
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

const extractMemberData = (response: any, range: number, dateFrom: string): MemberStatusItem[] => {
    const rawData = response?.stats || (Array.isArray(response) ? response : []);

    if (range !== 1 || rawData.length < 2) {
        return rawData;
    }

    const yesterdayData = rawData[rawData.length - 2];
    const todayData = rawData[rawData.length - 1];
    const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
    const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

    return [
        {...yesterdayData, date: startOfToday},
        {...todayData, date: startOfTomorrow}
    ];
};

const selectCurrencyWithHighestMrr = (totals: any[]): string => {
    if (!totals?.length) return 'usd';
    return totals.reduce((max, current) => (current.mrr > max.mrr ? current : max)).currency;
};

const filterMrrDataByDateRange = (data: MrrHistoryItem[], dateFromMoment: moment.Moment): MrrHistoryItem[] => {
    return data.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));
};

const ensureMrrStartPoint = (result: MrrHistoryItem[], allData: MrrHistoryItem[], dateFromMoment: moment.Moment): void => {
    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (hasStartPoint) return;

    const mostRecentBeforeRange = allData.find(item => moment(item.date).isBefore(dateFromMoment));
    if (mostRecentBeforeRange) {
        result.unshift({...mostRecentBeforeRange, date: dateFromMoment.format('YYYY-MM-DD')});
    } else if (result.length > 0) {
        const earliestInRange = sortByDate(result)[0];
        result.unshift({...earliestInRange, date: dateFromMoment.format('YYYY-MM-DD')});
    }
};

const ensureMrrEndPoint = (result: MrrHistoryItem[], range: number, endDateToCheck: moment.Moment): void => {
    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
    if (hasEndPoint || result.length === 0) return;

    const mostRecentValue = sortByDate(result).reverse()[0];
    result.push({...mostRecentValue, date: endDateToCheck.format('YYYY-MM-DD')});
};

const extractMrrData = (response: any, dateFrom: string, range: number, endDate: moment.Moment): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const selectedCurrency = selectCurrencyWithHighestMrr(response.meta.totals);
    const currencyFilteredData = sortByDate(response.stats.filter(d => d.currency === selectedCurrency));

    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const result = filterMrrDataByDateRange(currencyFilteredData, dateFromMoment);
    ensureMrrStartPoint(result, currencyFilteredData, dateFromMoment);
    ensureMrrEndPoint(result, range, dateToMoment);

    return {mrrData: sortByDate(result), selectedCurrency};
};

const mergeSubscriptionStatsByDate = (stats: any[]): Record<string, SubscriptionDataPoint> => {
    return stats.reduce((acc, current) => {
        const dateKey = current.date;
        if (!acc[dateKey]) {
            acc[dateKey] = {date: dateKey, signups: 0, cancellations: 0};
        }
        acc[dateKey].signups += current.signups;
        acc[dateKey].cancellations += current.cancellations;
        return acc;
    }, {} as Record<string, SubscriptionDataPoint>);
};

const extractSubscriptionData = (response: any, dateFrom: string, endDate: moment.Moment): SubscriptionDataPoint[] => {
    if (!response?.stats) return [];

    const mergedByDate = mergeSubscriptionStatsByDate(response.stats);
    const subscriptionArray = sortByDate(Object.values(mergedByDate));

    const dateFromMoment = moment(dateFrom);
    const dateToMoment = moment(endDate);

    return subscriptionArray.filter(item => {
        const itemDate = moment(item.date);
        return itemDate.isSameOrAfter(dateFromMoment) && itemDate.isSameOrBefore(dateToMoment);
    });
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

    const {mrrData, selectedCurrency} = useMemo(() => extract