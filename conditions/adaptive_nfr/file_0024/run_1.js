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

// Helper: Calculate MRR change with range awareness
const calculateMrrChange = (mrrData: MrrHistoryItem[], dateFrom: string): {percentage: string; direction: DiffDirection} => {
    if (mrrData.length <= 1) {
        return {percentage: '0%', direction: 'same'};
    }

    const totalMrr = mrrData[mrrData.length - 1].mrr;
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
    const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') || moment(dateFrom).year() < moment().year();

    let firstMrr = 0;

    if (firstActualPoint) {
        if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
            firstMrr = firstActualPoint.mrr;
        } else if (!isFromBeginningRange) {
            firstMrr = totalMrr;
        }
    } else if (!isFromBeginningRange) {
        firstMrr = totalMrr;
    }

    return calculateChange(totalMrr, firstMrr);
};

// Helper: Extract member data from response
const extractMemberData = (response: any): MemberStatusItem[] => {
    if (response?.stats) {
        return response.stats;
    }
    return Array.isArray(response) ? response : [];
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

// Helper: Select currency with highest MRR
const selectHighestMrrCurrency = (totals: any[]): string => {
    if (!totals?.length) return 'usd';
    return totals.reduce((max, current) => current.mrr > max.mrr ? current : max).currency;
};

// Helper: Ensure start and end points in MRR data
const ensureMrrBoundaryPoints = (data: MrrHistoryItem[], dateFromMoment: moment.Moment, range: number): MrrHistoryItem[] => {
    const result = [...data];
    const dateToMoment = range === 1 ? moment().startOf('day') : moment().endOf('day');

    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!hasStartPoint && result.length > 0) {
        const sortedByDate = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const earliestInRange = sortedByDate[0];
        result.unshift({...earliestInRange, date: dateFromMoment.format('YYYY-MM-DD')});
    }

    const hasEndPoint = result.some(item => moment(item.date).isSame(dateToMoment, 'day'));
    if (!hasEndPoint && result.length > 0) {
        const sortedByDate = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const mostRecentValue = sortedByDate[0];
        result.push({...mostRecentValue, date: dateToMoment.format('YYYY-MM-DD')});
    }

    return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// Helper: Filter and process MRR data
const processMrrData = (response: any, dateFrom: string, range: number): {data: MrrHistoryItem[]; currency: string} => {
    if (!response?.stats || !response?.meta?.totals) {
        return {data: [], currency: 'usd'};
    }

    const selectedCurrency = selectHighestMrrCurrency(response.meta.totals);
    const dateFromMoment = moment(dateFrom);
    const currencyFilteredData = response.stats.filter((d: MrrHistoryItem) => d.currency === selectedCurrency);
    const filteredData = currencyFilteredData.filter((item: MrrHistoryItem) => moment(item.date).isSameOrAfter(dateFromMoment));

    const result = ensureMrrBoundaryPoints(filteredData, dateFromMoment, range);
    return {data: result, currency: selectedCurrency};
};

const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: any): TotalsData => {
    if (!memberData.length) {
        return getEmptyTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;

    const totals = getEmptyTotals();
    totals.totalMembers = totalMembers;
    totals.freeMembers = currentTotals.free;
    totals.paidMembers = currentTotals.paid + currentTotals.comped;
    totals.mrr = latestMrr;

    if (memberData.length > 1) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const change = calculateChange(totalMembers, firstTotal);
            totals.percentChanges.total = change.percentage;
            totals.directions.total = change.direction;
        }

        if (first.free > 0) {
            const change = calculateChange(latest.free, first.free);
            totals.percentChanges.free = change.percentage;
            totals.directions.free = change.direction;
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latest.paid + latest.comped;

        if (firstPaidTotal > 0) {
            const change = calculateChange(latestPaidTotal, firstPaidTotal);
            totals.percentChanges.paid = change.percentage;
            totals.directions.paid = change.direction;
        }
    }

    if (mrrData.length > 1) {
        const mrrChange = calculateMrrChange(mrrData, dateFrom);
        totals.percentChanges.mrr = mrrChange.percentage;
        totals.directions.mrr = mrrChange.direction;
    }

    return totals;
};

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]): ChartDataPoint[] => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const allDates = [...new Set([...sortedMemberData.map(d => d.date), ...sortedMrrData.map(d => d.date)])]
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

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

const processSubscriptionData = (response: any, dateFrom: string, endDate: string): SubscriptionDataPoint[] => {
    if (!response?.stats) {
        return [];
    }

    const mergedByDate = response.stats.reduce((acc: Record<string, SubscriptionDataPoint>, current: any) => {
        const dateKey = current.date;
        if (!acc[dateKey]) {
            acc[dateKey] = {date: dateKey, signups: 0, cancellations: 0};
        }
        acc[dateKey].signups += current.signups;
        acc[dateKey].cancellations += current.cancellations;
        return acc;
    }, {});

    const subscriptionArray = Object.values(mergedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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

    const {mrrData, selectedCurrency} = useMemo(() => {
        const {data, currency} = processMrrData(mrrHistoryResponse, dateFrom, range);
        return {mrrData: data, selectedCurrency: currency};
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => processSubscriptionData(subscriptionStatsResponse, dateFrom, endDate), [subscriptionStatsResponse, dateFrom, endDate]);

    return {
        isLoading,
        memberData,
        mrrData,
        dateFrom,
        endDate,
        totals: totalsData,
        chartData,
        subscriptionData,
        selectedCurrency,
        currencySymbol
    };
};
```