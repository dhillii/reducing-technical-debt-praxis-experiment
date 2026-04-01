```typescript
import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

const getEmptyTotals = () => ({
    totalMembers: 0,
    freeMembers: 0,
    paidMembers: 0,
    mrr: 0,
    percentChanges: {
        total: '0%',
        free: '0%',
        paid: '0%',
        mrr: '0%'
    },
    directions: {
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection,
        mrr: 'same' as DiffDirection
    }
});

const calculateDirection = (change: number): DiffDirection => {
    return change > 0 ? 'up' : change < 0 ? 'down' : 'same';
};

const calculateMemberPercentChanges = (memberData: MemberStatusItem[], latest: MemberStatusItem, percentChanges: Record<string, string>, directions: Record<string, DiffDirection>) => {
    const first = memberData[0];
    const firstTotal = first.free + first.paid + first.comped;

    if (firstTotal > 0) {
        const totalMembers = memberData[memberData.length - 1].free + memberData[memberData.length - 1].paid + memberData[memberData.length - 1].comped;
        const totalChange = ((totalMembers - firstTotal) / firstTotal) * 100;
        percentChanges.total = formatPercentage(totalChange / 100);
        directions.total = calculateDirection(totalChange);
    }

    if (first.free > 0) {
        const freeChange = ((latest.free - first.free) / first.free) * 100;
        percentChanges.free = formatPercentage(freeChange / 100);
        directions.free = calculateDirection(freeChange);
    }

    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;
    
    if (firstPaidTotal > 0) {
        const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
        percentChanges.paid = formatPercentage(paidChange / 100);
        directions.paid = calculateDirection(paidChange);
    }
};

const getFirstMrrValue = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number, isFromBeginningRange: boolean): number => {
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

const calculateMrrPercentChange = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number, percentChanges: Record<string, string>, directions: Record<string, DiffDirection>) => {
    const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') || moment(dateFrom).year() < moment().year();
    const firstMrr = getFirstMrrValue(mrrData, dateFrom, totalMrr, isFromBeginningRange);

    if (firstMrr >= 0) {
        const mrrChange = firstMrr === 0
            ? (totalMrr > 0 ? 100 : 0)
            : ((totalMrr - firstMrr) / firstMrr) * 100;

        percentChanges.mrr = formatPercentage(mrrChange / 100);
        directions.mrr = calculateDirection(mrrChange);
    }
};

const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
    if (!memberData.length) {
        return getEmptyTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const percentChanges = {
        total: '0%',
        free: '0%',
        paid: '0%',
        mrr: '0%'
    };

    const directions = {
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection,
        mrr: 'same' as DiffDirection
    };

    if (memberData.length > 1) {
        calculateMemberPercentChanges(memberData, latest, percentChanges, directions);
    }

    if (mrrData.length > 1) {
        calculateMrrPercentChange(mrrData, dateFrom, totalMrr, percentChanges, directions);
    }

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges,
        directions
    };
};

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

    const allDates = [...new Set([...sortedMemberData.map(item => item.date), ...sortedMrrData.map(item => item.date)])]
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

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

const processMemberData = (memberCountResponse: any, range: number, dateFrom: string): MemberStatusItem[] => {
    let rawData: MemberStatusItem[] = [];
    
    if (memberCountResponse?.stats) {
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

const ensureMrrDataPoints = (data: MrrHistoryItem[], dateFromMoment: moment.Moment, dateToMoment: moment.Moment, range: number): MrrHistoryItem[] => {
    const result = [...data];
    const allData = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!hasStartPoint) {
        const mostRecentBeforeRange = allData.find(item => moment(item.date).isBefore(dateFromMoment));
        if (mostRecentBeforeRange) {
            result.unshift({...mostRecentBeforeRange, date: dateFromMoment.format('YYYY-MM-DD')});
        } else if (result.length > 0) {
            const earliestInRange = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
            result.unshift({...earliestInRange, date: dateFromMoment.format('YYYY-MM-DD')});
        }
    }

    const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
    if (!hasEndPoint && result.length > 0) {
        const mostRecentValue = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        result.push({...mostRecentValue, date: endDateToCheck.format('YYYY-MM-DD')});
    }

    return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const processMrrData = (mrrHistoryResponse: any, dateFrom: string, range: number, endDate: moment.Moment) => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const totals = mrrHistoryResponse.meta.totals;
    if (!totals[0]) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const currentMax = totals.reduce((max, total) => total.mrr > max.mrr ? total : max);
    const useCurrency = currentMax.currency;

    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = mrrHistoryResponse.stats.filter(d => d.currency === useCurrency);
    const filteredData = currencyFilteredData.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));

    const mrrData = ensureMrrDataPoints(filteredData, dateFromMoment, dateToMoment, range);

    return {mrrData, selectedCurrency: useCurrency};
};

const processSubscriptionData = (subscriptionStatsResponse: any, dateFrom: string, endDate: moment.Moment) => {
    if (!subscriptionStatsResponse?.stats) {
        return [];
    }

    const mergedByDate = subscriptionStatsResponse.stats.reduce((acc, current) => {
        const dateKey = current.date;
        if (!acc[dateKey]) {
            acc[dateKey] = {date: dateKey, signups: 0, cancellations: 0};
        }
        acc[dateKey].signups += current.signups;
        acc[dateKey].cancellations += current.cancellations;
        return acc;
    }, {} as Record<string, {date: string; signups: number; cancellations: number}>);

    const subscriptionArray = Object.values(mergedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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

    const memberData = useMemo(() => processMemberData(memberCountResponse, range, dateFrom), [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => processMrrData(mrrHistoryResponse, dateFrom, range, endDate), [mrrHistoryResponse, dateFrom, range, endDate]);

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