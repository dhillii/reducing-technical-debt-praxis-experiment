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

// Helper: Calculate MRR change with special handling for zero start
const calculateMrrChange = (firstMrr: number, totalMrr: number): {percentage: string; direction: DiffDirection} => {
    if (firstMrr === 0) {
        return {
            percentage: formatPercentage(totalMrr > 0 ? 1 : 0),
            direction: totalMrr > 0 ? 'up' : totalMrr < 0 ? 'down' : 'same'
        };
    }
    return calculateChange(totalMrr, firstMrr);
};

// Helper: Find first MRR data point in range
const findFirstMrrInRange = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
    const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
                                moment(dateFrom).year() < moment().year();

    if (!firstActualPoint) {
        return isFromBeginningRange ? 0 : totalMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return isFromBeginningRange ? 0 : totalMrr;
};

// Calculate totals from member data
const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
): TotalsData => {
    if (!memberData.length) {
        return getEmptyTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const result: TotalsData = {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: latestMrr,
        percentChanges: {total: '0%', free: '0%', paid: '0%', mrr: '0%'},
        directions: {total: 'same', free: 'same', paid: 'same', mrr: 'same'}
    };

    if (memberData.length > 1) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const change = calculateChange(totalMembers, firstTotal);
            result.percentChanges.total = change.percentage;
            result.directions.total = change.direction;
        }

        if (first.free > 0) {
            const change = calculateChange(latest.free, first.free);
            result.percentChanges.free = change.percentage;
            result.directions.free = change.direction;
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latest.paid + latest.comped;

        if (firstPaidTotal > 0) {
            const change = calculateChange(latestPaidTotal, firstPaidTotal);
            result.percentChanges.paid = change.percentage;
            result.directions.paid = change.direction;
        }
    }

    if (mrrData.length > 1) {
        const firstMrr = findFirstMrrInRange(mrrData, dateFrom, latestMrr);
        const change = calculateMrrChange(firstMrr, latestMrr);
        result.percentChanges.mrr = change.percentage;
        result.directions.mrr = change.direction;
    }

    return result;
};

// Helper: Create data map for efficient lookup
const createDataMap = <T extends {date: string}>(data: T[]): Map<string, T> => {
    return new Map(data.map(item => [item.date, item]));
};

// Helper: Sort data by date
const sortByDate = <T extends {date: string}>(data: T[]): T[] => {
    return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// Format chart data
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]): ChartDataPoint[] => {
    const sortedMemberData = sortByDate(memberData);
    const sortedMrrData = sortByDate(mrrData);

    const allDates = [...new Set([
        ...sortedMemberData.map(item => item.date),
        ...sortedMrrData.map(item => item.date)
    ])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const memberMap = createDataMap(sortedMemberData);
    const mrrMap = createDataMap(sortedMrrData);

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

// Helper: Extract member data from response
const extractMemberData = (response: any): MemberStatusItem[] => {
    if (response?.stats) {
        return response.stats;
    }
    return Array.isArray(response) ? response : [];
};

// Helper: Process single day member data
const processSingleDayMemberData = (rawData: MemberStatusItem[], dateFrom: string): MemberStatusItem[] => {
    if (rawData.length < 2) {
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
const ensureMrrBoundaryPoints = (
    data: MrrHistoryItem[],
    dateFromMoment: moment.Moment,
    dateToMoment: moment.Moment,
    range: number
): MrrHistoryItem[] => {
    const result = [...data];
    const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;

    // Ensure start point
    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!hasStartPoint && result.length > 0) {
        const mostRecentBefore = [...result]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .find(item => moment(item.date).isBefore(dateFromMoment));

        if (mostRecentBefore) {
            result.unshift({...mostRecentBefore, date: dateFromMoment.format('YYYY-MM-DD')});
        } else {
            const earliest = sortByDate(result)[0];
            result.unshift({...earliest, date: dateFromMoment.format('YYYY-MM-DD')});
        }
    }

    // Ensure end point
    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
    if (!hasEndPoint && result.length > 0) {
        const mostRecent = sortByDate(result)[result.length - 1];
        result.push({...mostRecent, date: endDateToCheck.format('YYYY-MM-DD')});
    }

    return sortByDate(result);
};

// Helper: Process MRR data
const processMrrData = (response: any, dateFrom: string, range: number, endDate: moment.Moment) => {
    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const selectedCurrency = selectHighestMrrCurrency(response.meta.totals);
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFiltered = response.stats.filter((d: MrrHistoryItem) => d.currency === selectedCurrency);
    const filtered = currencyFiltered.filter((item: MrrHistoryItem) =>
        moment(item.date).isSameOrAfter(dateFromMoment)
    );

    const mrrData = ensureMrrBoundaryPoints(filtered, dateFromMoment, dateToMoment, range);

    return {mrrData, selectedCurrency};
};

// Helper: Process subscription data
const processSubscriptionData = (response: any, dateFrom: string, endDate: moment.Moment): SubscriptionDataPoint[] => {
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

    const memberData = useMemo(() => {
        const rawData = extractMemberData(memberCountResponse);
        return range === 1 ? processSingleDayMemberData(rawData, dateFrom) : rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        return processMrrData(mrrHistoryResponse, dateFrom, range, moment(endDate));
    }, [mrrHistoryResponse, dateFrom, range, endDate]);

    const totalsData = useMemo(
        () => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals),
        [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]
    );

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(