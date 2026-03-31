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

const calculatePercentChange = (current: number, previous: number): {percentage: string; direction: DiffDirection} => {
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

    const totalChange = calculatePercentChange(totalMembers, firstTotal);
    const freeChange = calculatePercentChange(currentTotals.free, first.free);
    const paidChange = calculatePercentChange(currentTotals.paid + currentTotals.comped, first.paid + first.comped);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
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

const getFirstMrrValue = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number => {
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

const calculateMrrChange = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) => {
    const firstMrr = getFirstMrrValue(mrrData, dateFrom, totalMrr);
    const mrrChange = calculatePercentChange(totalMrr, firstMrr);

    return {
        percentage: mrrChange.percentage,
        direction: mrrChange.direction
    };
};

const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
): TotalsData => {
    if (!memberData.length) {
        return DEFAULT_TOTALS;
    }

    const memberTotals = calculateMemberTotals(memberData, memberCountTotals);
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;

    const result: TotalsData = {
        totalMembers: memberTotals.totalMembers,
        freeMembers: memberTotals.freeMembers,
        paidMembers: memberTotals.paidMembers,
        mrr: latestMrr,
        percentChanges: {
            total: memberTotals.percentChanges.total,
            free: memberTotals.percentChanges.free,
            paid: memberTotals.percentChanges.paid,
            mrr: '0%'
        },
        directions: {
            total: memberTotals.directions.total,
            free: memberTotals.directions.free,
            paid: memberTotals.directions.paid,
            mrr: 'same'
        }
    };

    if (mrrData.length > 1) {
        const mrrChange = calculateMrrChange(mrrData, dateFrom, latestMrr);
        result.percentChanges.mrr = mrrChange.percentage;
        result.directions.mrr = mrrChange.direction;
    }

    return result;
};

const sortByDate = <T extends {date: string}>(data: T[]): T[] => {
    return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const createDateMap = <T extends {date: string}>(data: T[]): Map<string, T> => {
    return new Map(data.map(item => [item.date, item]));
};

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]): ChartDataPoint[] => {
    const sortedMemberData = sortByDate(memberData);
    const sortedMrrData = sortByDate(mrrData);

    const memberMap = createDateMap(sortedMemberData);
    const mrrMap = createDateMap(sortedMrrData);

    const allDates = [...new Set([...sortedMemberData.map(d => d.date), ...sortedMrrData.map(d => d.date)])].sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

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

const extractMemberData = (response: any): MemberStatusItem[] => {
    if (response?.stats) {
        return response.stats;
    }
    return Array.isArray(response) ? response : [];
};

const processMemberDataForRange = (rawData: MemberStatusItem[], range: number, dateFrom: string): MemberStatusItem[] => {
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

const selectCurrencyWithHighestMrr = (totals: Array<{currency: string; mrr: number}>): string => {
    if (!totals.length) return 'usd';
    return totals.reduce((max, current) => (current.mrr > max.mrr ? current : max)).currency;
};

const ensureMrrRangeDataPoints = (
    data: MrrHistoryItem[],
    dateFromMoment: moment.Moment,
    dateToMoment: moment.Moment,
    allData: MrrHistoryItem[]
): MrrHistoryItem[] => {
    const result = [...data];

    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!hasStartPoint) {
        const mostRecentBeforeRange = allData.find(item => moment(item.date).isBefore(dateFromMoment));
        if (mostRecentBeforeRange) {
            result.unshift({...mostRecentBeforeRange, date: dateFromMoment.format('YYYY-MM-DD')});
        } else if (result.length > 0) {
            const earliestInRange = sortByDate(result)[0];
            result.unshift({...earliestInRange, date: dateFromMoment.format('YYYY-MM-DD')});
        }
    }

    const hasEndPoint = result.some(item => moment(item.date).isSame(dateToMoment, 'day'));
    if (!hasEndPoint && result.length > 0) {
        const mostRecentValue = sortByDate(result)[result.length - 1];
        result.push({...mostRecentValue, date: dateToMoment.format('YYYY-MM-DD')});
    }

    return sortByDate(result);
};

const processMrrData = (response: any, dateFrom: string, range: number, endDate: moment.Moment) => {
    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const selectedCurrency = selectCurrencyWithHighestMrr(response.meta.totals);
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = response.stats.filter((d: MrrHistoryItem) => d.currency === selectedCurrency);
    const filteredData = currencyFilteredData.filter((item: MrrHistoryItem) => moment(item.date).isSameOrAfter(dateFromMoment));
    const allData = sortByDate(currencyFilteredData);

    const mrrData = ensureMrrRangeDataPoints(filteredData, dateFromMoment, dateToMoment, allData);

    return {mrrData, selectedCurrency};
};

const mergeSubscriptionStatsByDate = (stats: Array<{date: string; signups: number; cancellations: number}>): SubscriptionDataPoint[] => {
    const merged = stats.reduce(
        (acc, current) => {
            if (!acc[current.date]) {
                acc[current.date] = {date: current.date, signups: 0, cancellations: 0};
            }
            acc[current.date].signups += current.signups;
            acc[current.date].cancellations += current.cancellations;
            return acc;
        },
        {} as Record<string, SubscriptionDataPoint>
    );

    return sortByDate(Object.values(merged));
};

const filterSubscriptionDataByRange = (data: SubscriptionDataPoint[], dateFrom: string, endDate: moment.Moment): SubscriptionDataPoint[] => {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = moment(endDate);

    return data.filter(item => {
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

    const memberData = useMemo(() => {
        const rawData = extractMemberData(memberCountResponse);
        return processMemberDataForRange(rawData, range, dateFrom);
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => processMrrData(mrrHistoryResponse, dateFrom, range, endDate), [mrrHistoryResponse, dateFrom, range, endDate]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }
        const merged = mergeSubscriptionStatsByDate(subscriptionStatsResponse.stats);
        return filterSubscriptionDataByRange(merged, dateFrom, endDate);
    }, [subsc