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
    if (response?.stats) return response.stats;
    if (Array.isArray(response)) return response;
    return [];
};

// Helper: Process member data for single day range
const processSingleDayMemberData = (data: MemberStatusItem[], dateFrom: string): MemberStatusItem[] => {
    if (data.length < 2) return data;

    const yesterdayData = data[data.length - 2];
    const todayData = data[data.length - 1];
    const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
    const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

    return [
        {...yesterdayData, date: startOfToday},
        {...todayData, date: startOfTomorrow}
    ];
};

// Helper: Calculate MRR change with special handling for zero starting point
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
const findFirstMrrInRange = (mrrData: MrrHistoryItem[], dateFrom: string, isFromBeginningRange: boolean, totalMrr: number): number => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));

    if (!firstActualPoint) {
        return isFromBeginningRange ? 0 : totalMrr;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return isFromBeginningRange ? 0 : totalMrr;
};

// Helper: Check if date range is from beginning of period
const isFromBeginningRange = (dateFrom: string): boolean => {
    const dateFromMoment = moment(dateFrom);
    return dateFromMoment.isSame(moment().startOf('year'), 'day') || dateFromMoment.year() < moment().year();
};

// Helper: Calculate totals for member counts
const calculateMemberTotals = (memberData: MemberStatusItem[], currentTotals: any): {total: number; free: number; paid: number} => {
    const latest = memberData.length > 0 ? memberData[memberData.length - 1] : {free: 0, paid: 0, comped: 0};
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;

    return {
        total: totalMembers,
        free: currentTotals.free,
        paid: currentTotals.paid + currentTotals.comped
    };
};

// Helper: Calculate percentage changes for members
const calculateMemberPercentChanges = (memberData: MemberStatusItem[]): {percentChanges: Record<string, string>; directions: Record<string, DiffDirection>} => {
    const percentChanges = {total: '0%', free: '0%', paid: '0%', mrr: '0%'};
    const directions = {total: 'same' as DiffDirection, free: 'same' as DiffDirection, paid: 'same' as DiffDirection, mrr: 'same' as DiffDirection};

    if (memberData.length <= 1) return {percentChanges, directions};

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];
    const firstTotal = first.free + first.paid + first.comped;
    const currentTotal = latest.free + latest.paid + latest.comped;

    if (firstTotal > 0) {
        const change = calculateChange(currentTotal, firstTotal);
        percentChanges.total = change.percentage;
        directions.total = change.direction;
    }

    if (first.free > 0) {
        const change = calculateChange(latest.free, first.free);
        percentChanges.free = change.percentage;
        directions.free = change.direction;
    }

    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;

    if (firstPaidTotal > 0) {
        const change = calculateChange(latestPaidTotal, firstPaidTotal);
        percentChanges.paid = change.percentage;
        directions.paid = change.direction;
    }

    return {percentChanges, directions};
};

const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: any): TotalsData => {
    if (!memberData.length) return getEmptyTotals();

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const memberTotals = calculateMemberTotals(memberData, currentTotals);
    const {percentChanges: memberPercentChanges, directions: memberDirections} = calculateMemberPercentChanges(memberData);

    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;
    let mrrPercentChange = '0%';
    let mrrDirection: DiffDirection = 'same';

    if (mrrData.length > 1) {
        const fromBeginning = isFromBeginningRange(dateFrom);
        const firstMrr = findFirstMrrInRange(mrrData, dateFrom, fromBeginning, latestMrr);
        const mrrChange = calculateMrrChange(firstMrr, latestMrr);
        mrrPercentChange = mrrChange.percentage;
        mrrDirection = mrrChange.direction;
    }

    return {
        totalMembers: memberTotals.total,
        freeMembers: memberTotals.free,
        paidMembers: memberTotals.paid,
        mrr: latestMrr,
        percentChanges: {...memberPercentChanges, mrr: mrrPercentChange},
        directions: {...memberDirections, mrr: mrrDirection}
    };
};

// Helper: Create data maps for efficient lookup
const createDataMaps = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]): {memberMap: Map<string, MemberStatusItem>; mrrMap: Map<string, MrrHistoryItem>; allDates: string[]} => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

    const allDates = [...new Set([...sortedMemberData.map(i => i.date), ...sortedMrrData.map(i => i.date)])]
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return {memberMap, mrrMap, allDates};
};

// Helper: Build chart data point
const buildChartDataPoint = (date: string, memberItem: MemberStatusItem | null, mrrItem: MrrHistoryItem | null): ChartDataPoint => {
    const free = memberItem?.free ?? 0;
    const paid = memberItem?.paid ?? 0;
    const comped = memberItem?.comped ?? 0;
    const paidTotal = paid + comped;
    const value = free + paidTotal;

    return {
        date,
        value,
        free,
        paid: paidTotal,
        comped,
        mrr: mrrItem?.mrr ?? 0,
        paid_subscribed: memberItem?.paid_subscribed ?? 0,
        paid_canceled: memberItem?.paid_canceled ?? 0,
        formattedValue: formatNumber(value),
        label: 'Total members'
    };
};

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]): ChartDataPoint[] => {
    const {memberMap, mrrMap, allDates} = createDataMaps(memberData, mrrData);

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    return allDates.map((date) => {
        const currentMemberItem = memberMap.get(date);
        if (currentMemberItem) lastMemberItem = currentMemberItem;

        const currentMrrItem = mrrMap.get(date);
        if (currentMrrItem) lastMrrItem = currentMrrItem;

        return buildChartDataPoint(date, lastMemberItem, lastMrrItem);
    });
};

// Helper: Select currency with highest MRR
const selectHighestMrrCurrency = (totals: any[]): string => {
    if (!totals?.length) return 'usd';
    return totals.reduce((max, current) => current.mrr > max.mrr ? current : max).currency;
};

// Helper: Ensure MRR data has start and end points
const ensureMrrBoundaryPoints = (data: MrrHistoryItem[], dateFromMoment: moment.Moment, range: number): MrrHistoryItem[] => {
    const result = [...data];
    const endDateToCheck = range === 1 ? moment().startOf('day') : moment().endOf('day');

    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!hasStartPoint && result.length > 0) {
        const sortedByDate = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const earliestInRange = sortedByDate[0];
        result.unshift({...earliestInRange, date: dateFromMoment.format('YYYY-MM-DD')});
    }

    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
    if (!hasEndPoint && result.length > 0) {
        const sortedByDateDesc = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const mostRecentValue = sortedByDateDesc[0];
        result.push({...mostRecentValue, date: endDateToCheck.format('YYYY-MM-DD')});
    }

    return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// Helper: Process MRR history response
const processMrrHistory = (response: any, dateFrom: string, range: number): {mrrData: MrrHistoryItem[]; selectedCurrency: string} => {
    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const selectedCurrency = selectHighestMrrCurrency(response.meta.totals);
    const dateFromMoment = moment(dateFrom);

    const currencyFilteredData = response.stats.filter((d: MrrHistoryItem) => d.currency === selectedCurrency);
    const filteredData = currencyFilteredData.filter((item: MrrHistoryItem) => moment(item.date).isSameOrAfter(dateFromMoment));

    const mrrData = ensureMrrBoundaryPoints(filteredData, dateFromMoment, range);

    return {mrrData, selectedCurrency};
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
const filterSubscriptionDataByRange = (data: SubscriptionDataPoint[], dateFrom: string, endDate: string): SubscriptionDataPoint[] => {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = moment(endDate);

    return data.filter((item) => {
        const itemDate = moment(item.date);
        return itemDate.isSameOrAfter(dateFromMoment) && itemDate.isSameOrBefore(dateToMoment