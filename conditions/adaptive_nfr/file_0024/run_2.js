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

// Helper: Calculate member totals
const calculateMemberTotals = (memberData: MemberStatusItem[], memberCountTotals?: {paid: number; free: number; comped: number}) => {
    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData.length > 0 ? memberData[memberData.length - 1] : {free: 0, paid: 0, comped: 0};
    const first = memberData[0];

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const firstTotal = first.free + first.paid + first.comped;

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        totalChange: calculateChange(totalMembers, firstTotal),
        freeChange: calculateChange(latest.free, first.free),
        paidChange: calculateChange(latest.paid + latest.comped, first.paid + first.comped)
    };
};

// Helper: Find first MRR value in range
const findFirstMrrInRange = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number => {
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

const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}): TotalsData => {
    if (!memberData.length) {
        return getEmptyTotals();
    }

    const memberTotals = calculateMemberTotals(memberData, memberCountTotals);
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;

    const result: TotalsData = {
        totalMembers: memberTotals.totalMembers,
        freeMembers: memberTotals.freeMembers,
        paidMembers: memberTotals.paidMembers,
        mrr: latestMrr,
        percentChanges: {
            total: memberData.length > 1 ? memberTotals.totalChange.percentage : '0%',
            free: memberData.length > 1 ? memberTotals.freeChange.percentage : '0%',
            paid: memberData.length > 1 ? memberTotals.paidChange.percentage : '0%',
            mrr: '0%'
        },
        directions: {
            total: memberData.length > 1 ? memberTotals.totalChange.direction : 'same',
            free: memberData.length > 1 ? memberTotals.freeChange.direction : 'same',
            paid: memberData.length > 1 ? memberTotals.paidChange.direction : 'same',
            mrr: 'same'
        }
    };

    if (mrrData.length > 1) {
        const firstMrr = findFirstMrrInRange(mrrData, dateFrom, latestMrr);
        const mrrChange = calculateChange(latestMrr, firstMrr);
        result.percentChanges.mrr = mrrChange.percentage;
        result.directions.mrr = mrrChange.direction;
    }

    return result;
};

// Helper: Create date-indexed maps
const createDataMaps = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const allDates = [...new Set([...sortedMemberData.map(d => d.date), ...sortedMrrData.map(d => d.date)])]
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return {
        allDates,
        memberMap: new Map(sortedMemberData.map(item => [item.date, item])),
        mrrMap: new Map(sortedMrrData.map(item => [item.date, item]))
    };
};

// Helper: Build single chart data point
const buildChartPoint = (date: string, lastMemberItem: MemberStatusItem | null, lastMrrItem: MrrHistoryItem | null): ChartDataPoint => {
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
        return buildChartPoint(date, lastMemberItem, lastMrrItem);
    });
};

// Helper: Extract member data from response
const extractMemberData = (response: any): MemberStatusItem[] => {
    if (response?.stats) return response.stats;
    if (Array.isArray(response)) return response;
    return [];
};

// Helper: Process single day member data
const processSingleDayMemberData = (rawData: MemberStatusItem[], dateFrom: string): MemberStatusItem[] => {
    if (rawData.length < 2) return rawData;

    const yesterdayData = rawData[rawData.length - 2];
    const todayData = rawData[rawData.length - 1];
    const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
    const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

    return [
        {...yesterdayData, date: startOfToday},
        {...todayData, date: startOfTomorrow}
    ];
};

// Helper: Select currency with highest MRR
const selectHighestMrrCurrency = (totals: any[]): string => {
    if (!totals?.length) return 'usd';
    return totals.reduce((max, current) => current.mrr > max.mrr ? current : max).currency;
};

// Helper: Ensure start and end points in MRR data
const ensureMrrRangePoints = (data: MrrHistoryItem[], dateFromMoment: moment.Moment, dateToMoment: moment.Moment, range: number, allData: MrrHistoryItem[]): MrrHistoryItem[] => {
    const result = [...data];

    // Ensure start point
    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!hasStartPoint) {
        const mostRecentBefore = allData.find(item => moment(item.date).isBefore(dateFromMoment));
        const pointToAdd = mostRecentBefore || result[0];
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
const processMrrData = (response: any, dateFrom: string, range: number) => {
    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const selectedCurrency = selectHighestMrrCurrency(response.meta.totals);
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = response.stats.filter((d: MrrHistoryItem) => d.currency === selectedCurrency);
    const filteredData = currencyFilteredData.filter((item: MrrHistoryItem) => moment(item.date).isSameOrAfter(dateFromMoment));
    const mrrData = ensureMrrRangePoints(filteredData, dateFromMoment, dateToMoment, range, currencyFilteredData);

    return {mrrData, selectedCurrency};
};

// Helper: Merge subscription stats by date
const mergeSubscriptionStats = (stats: any[]): SubscriptionDataPoint[] => {
    const merged = stats.reduce((acc, current) => {
        if (!acc[current.date]) {
            acc[current.date] = {date: current.date, signups: 0, cancellations: 0};
        }
        acc[current.date].signups += current.signups;
        acc[current.date].cancellations += current.cancellations;
        return acc;
    }, {} as Record<string, SubscriptionDataPoint>);

    return Object.values(merged).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// Helper: Filter subscription data by date range
const filterSubscriptionByRange = (data: SubscriptionDataPoint[], dateFrom: string, endDate: string): SubscriptionDataPoint[] => {
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
        return range === 1 ? processSingleDayMemberData(rawData, dateFrom) : rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => processMrrData(mrrHistoryResponse, dateFrom, range), [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [