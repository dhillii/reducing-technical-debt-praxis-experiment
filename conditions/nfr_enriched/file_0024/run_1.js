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

// Helper: Calculate percentage change and direction
const calculateChange = (current: number, previous: number): {percentage: string; direction: DiffDirection} => {
    if (previous === 0) {
        return {
            percentage: formatPercentage(current > 0 ? 1 : 0),
            direction: current > 0 ? 'up' : current < 0 ? 'down' : 'same'
        };
    }

    const change = ((current - previous) / previous) * 100;
    return {
        percentage: formatPercentage(change / 100),
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same'
    };
};

// Helper: Get initial totals structure
const getEmptyTotals = (): TotalsData => ({
    totalMembers: 0,
    freeMembers: 0,
    paidMembers: 0,
    mrr: 0,
    percentChanges: {total: '0%', free: '0%', paid: '0%', mrr: '0%'},
    directions: {total: 'same', free: 'same', paid: 'same', mrr: 'same'}
});

// Helper: Extract member data from response
const extractMemberData = (response: any): MemberStatusItem[] => {
    if (response?.stats) {
        return response.stats;
    }
    return Array.isArray(response) ? response : [];
};

// Helper: Calculate MRR changes
const calculateMrrChange = (mrrData: MrrHistoryItem[], dateFrom: string): {percentage: string; direction: DiffDirection} => {
    if (mrrData.length <= 1) {
        return {percentage: '0%', direction: 'same'};
    }

    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
    const latestMrr = mrrData[mrrData.length - 1].mrr;
    const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
                                moment(dateFrom).year() < moment().year();

    let firstMrr = 0;

    if (firstActualPoint) {
        if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
            firstMrr = firstActualPoint.mrr;
        } else if (!isFromBeginningRange) {
            firstMrr = latestMrr;
        }
    } else if (!isFromBeginningRange) {
        firstMrr = latestMrr;
    }

    return calculateChange(latestMrr, firstMrr);
};

// Helper: Calculate member count changes
const calculateMemberChanges = (memberData: MemberStatusItem[], currentTotals: any) => {
    const changes: Record<string, {percentage: string; direction: DiffDirection}> = {
        total: {percentage: '0%', direction: 'same'},
        free: {percentage: '0%', direction: 'same'},
        paid: {percentage: '0%', direction: 'same'}
    };

    if (memberData.length <= 1) {
        return changes;
    }

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];

    const firstTotal = first.free + first.paid + first.comped;
    if (firstTotal > 0) {
        changes.total = calculateChange(currentTotals.free + currentTotals.paid + currentTotals.comped, firstTotal);
    }

    if (first.free > 0) {
        changes.free = calculateChange(latest.free, first.free);
    }

    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;
    if (firstPaidTotal > 0) {
        changes.paid = calculateChange(latestPaidTotal, firstPaidTotal);
    }

    return changes;
};

const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: any): TotalsData => {
    if (!memberData.length) {
        return getEmptyTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;

    const memberChanges = calculateMemberChanges(memberData, currentTotals);
    const mrrChange = calculateMrrChange(mrrData, dateFrom);

    return {
        totalMembers: currentTotals.free + currentTotals.paid + currentTotals.comped,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: latestMrr,
        percentChanges: {
            total: memberChanges.total.percentage,
            free: memberChanges.free.percentage,
            paid: memberChanges.paid.percentage,
            mrr: mrrChange.percentage
        },
        directions: {
            total: memberChanges.total.direction,
            free: memberChanges.free.direction,
            paid: memberChanges.paid.direction,
            mrr: mrrChange.direction
        }
    };
};

// Helper: Create data maps for efficient lookup
const createDataMaps = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const allDates = [...new Set([
        ...sortedMemberData.map(item => item.date),
        ...sortedMrrData.map(item => item.date)
    ])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return {
        allDates,
        memberMap: new Map(sortedMemberData.map(item => [item.date, item])),
        mrrMap: new Map(sortedMrrData.map(item => [item.date, item]))
    };
};

// Helper: Build chart data point
const buildChartDataPoint = (date: string, lastMemberItem: MemberStatusItem | null, lastMrrItem: MrrHistoryItem | null): ChartDataPoint => {
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
};

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]): ChartDataPoint[] => {
    const {allDates, memberMap, mrrMap} = createDataMaps(memberData, mrrData);

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    return allDates.map((date) => {
        lastMemberItem = memberMap.get(date) || lastMemberItem;
        lastMrrItem = mrrMap.get(date) || lastMrrItem;
        return buildChartDataPoint(date, lastMemberItem, lastMrrItem);
    });
};

// Helper: Select currency with highest MRR
const selectHighestMrrCurrency = (totals: any[]) => {
    if (!totals?.length) {
        return {currency: 'usd', total: totals?.[0]};
    }
    return totals.reduce((max, current) => current.mrr > max.mrr ? current : max);
};

// Helper: Ensure data points at range boundaries
const ensureRangeBoundaryPoints = (data: MrrHistoryItem[], dateFromMoment: moment.Moment, dateToMoment: moment.Moment, range: number): MrrHistoryItem[] => {
    const result = [...data];
    const allData = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Ensure start point
    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!hasStartPoint) {
        const mostRecentBefore = allData.find(item => moment(item.date).isBefore(dateFromMoment));
        const pointToAdd = mostRecentBefore || [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

        if (pointToAdd) {
            result.unshift({...pointToAdd, date: dateFromMoment.format('YYYY-MM-DD')});
        }
    }

    // Ensure end point
    const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
    if (!hasEndPoint && result.length > 0) {
        const mostRecentValue = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        result.push({...mostRecentValue, date: endDateToCheck.format('YYYY-MM-DD')});
    }

    return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// Helper: Process MRR data
const processMrrData = (mrrHistoryResponse: any, dateFrom: string, range: number, endDate: moment.Moment) => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const selectedCurrencyData = selectHighestMrrCurrency(mrrHistoryResponse.meta.totals);
    const useCurrency = selectedCurrencyData.currency;
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = mrrHistoryResponse.stats.filter((d: MrrHistoryItem) => d.currency === useCurrency);
    const filteredData = currencyFilteredData.filter((item: MrrHistoryItem) => moment(item.date).isSameOrAfter(dateFromMoment));
    const result = ensureRangeBoundaryPoints(filteredData, dateFromMoment, dateToMoment, range);

    return {mrrData: result, selectedCurrency: useCurrency};
};

// Helper: Process member data for single day range
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

// Helper: Merge subscription stats by date
const mergeSubscriptionStatsByDate = (stats: any[]): SubscriptionDataPoint[] => {
    const mergedByDate = stats.reduce((acc, current) => {
        const dateKey = current.date;
        if (!acc[dateKey]) {
            acc[dateKey] = {date: dateKey, signups: 0, cancellations: 0};
        }
        acc[dateKey].signups += current.signups;
        acc[dateKey].cancellations += current.cancellations;
        return acc;
    }, {} as Record<string, SubscriptionDataPoint>);

    return Object.values(mergedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// Helper: Filter subscription data by date range
const filterSubscriptionDataByRange = (subscriptionArray: SubscriptionDataPoint[], dateFrom: string, endDate: moment.Moment): SubscriptionDataPoint[] => {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = moment(endDate);
    return subscriptionArray.filter((item) => {
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

    const {mrrData,