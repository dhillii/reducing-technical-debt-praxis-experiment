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

const calculateMemberPercentChanges = (memberData: MemberStatusItem[], currentTotals: MemberStatusItem, latest: MemberStatusItem) => {
    const percentChanges = {
        total: '0%',
        free: '0%',
        paid: '0%'
    };
    const directions = {
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection
    };

    if (memberData.length <= 1) {
        return {percentChanges, directions};
    }

    const first = memberData[0];
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const firstTotal = first.free + first.paid + first.comped;

    if (firstTotal > 0) {
        const totalChange = ((totalMembers - firstTotal) / firstTotal) * 100;
        percentChanges.total = formatPercentage(totalChange / 100);
        directions.total = totalChange > 0 ? 'up' : totalChange < 0 ? 'down' : 'same';
    }

    if (first.free > 0) {
        const freeChange = ((latest.free - first.free) / first.free) * 100;
        percentChanges.free = formatPercentage(freeChange / 100);
        directions.free = freeChange > 0 ? 'up' : freeChange < 0 ? 'down' : 'same';
    }

    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;

    if (firstPaidTotal > 0) {
        const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
        percentChanges.paid = formatPercentage(paidChange / 100);
        directions.paid = paidChange > 0 ? 'up' : paidChange < 0 ? 'down' : 'same';
    }

    return {percentChanges, directions};
};

const calculateMrrPercentChange = (mrrData: MrrHistoryItem[], totalMrr: number, dateFrom: string) => {
    const percentChanges = {mrr: '0%'};
    const directions = {mrr: 'same' as DiffDirection};

    if (mrrData.length <= 1) {
        return {percentChanges, directions};
    }

    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
    const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') || moment(dateFrom).year() < moment().year();

    let firstMrr = 0;

    if (firstActualPoint) {
        if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
            firstMrr = firstActualPoint.mrr;
        } else {
            firstMrr = isFromBeginningRange ? 0 : totalMrr;
        }
    } else {
        firstMrr = isFromBeginningRange ? 0 : totalMrr;
    }

    if (firstMrr >= 0) {
        const mrrChange = firstMrr === 0 ? (totalMrr > 0 ? 100 : 0) : ((totalMrr - firstMrr) / firstMrr) * 100;
        percentChanges.mrr = formatPercentage(mrrChange / 100);
        directions.mrr = mrrChange > 0 ? 'up' : mrrChange < 0 ? 'down' : 'same';
    }

    return {percentChanges, directions};
};

const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
    if (!memberData.length) {
        return getEmptyTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1] || {free: 0, paid: 0, comped: 0};
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const {percentChanges: memberPercentChanges, directions: memberDirections} = calculateMemberPercentChanges(memberData, currentTotals, latest);
    const {percentChanges: mrrPercentChanges, directions: mrrDirections} = calculateMrrPercentChange(mrrData, totalMrr, dateFrom);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges: {
            ...memberPercentChanges,
            ...mrrPercentChanges
        },
        directions: {
            ...memberDirections,
            ...mrrDirections
        }
    };
};

const sortByDate = (a: {date: string}, b: {date: string}) => new Date(a.date).getTime() - new Date(b.date).getTime();

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort(sortByDate);
    const sortedMrrData = [...mrrData].sort(sortByDate);

    const memberDates = sortedMemberData.map(item => item.date);
    const mrrDates = sortedMrrData.map(item => item.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

    return allDates.map((date) => {
        lastMemberItem = memberMap.get(date) || lastMemberItem;
        lastMrrItem = mrrMap.get(date) || lastMrrItem;

        const free = lastMemberItem?.free ?? 0;
        const paid = lastMemberItem?.paid ?? 0;
        const comped = lastMemberItem?.comped ?? 0;
        const paidTotal = paid + comped;
        const value = free + paidTotal;
        const mrr = lastMrrItem?.mrr ?? 0;
        const paidSubscribed = lastMemberItem?.paid_subscribed ?? 0;
        const paidCanceled = lastMemberItem?.paid_canceled ?? 0;

        return {
            date,
            value,
            free,
            paid: paidTotal,
            comped,
            mrr,
            paid_subscribed: paidSubscribed,
            paid_canceled: paidCanceled,
            formattedValue: formatNumber(value),
            label: 'Total members'
        };
    });
};

const extractMemberData = (memberCountResponse: any, range: number, dateFrom: string) => {
    let rawData: MemberStatusItem[] = [];

    if (memberCountResponse?.stats) {
        rawData = memberCountResponse.stats;
    } else if (Array.isArray(memberCountResponse)) {
        rawData = memberCountResponse;
    }

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

const findHighestMrrCurrency = (totals: any[]) => {
    let currentMax = totals[0];
    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }
    return currentMax.currency;
};

const ensureMrrStartPoint = (result: MrrHistoryItem[], currencyFilteredData: MrrHistoryItem[], dateFromMoment: moment.Moment) => {
    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (hasStartPoint) return;

    const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const mostRecentBeforeRange = allData.find((item) => moment(item.date).isBefore(dateFromMoment));

    if (mostRecentBeforeRange) {
        result.unshift({...mostRecentBeforeRange, date: dateFromMoment.format('YYYY-MM-DD')});
    } else if (result.length > 0) {
        const earliestInRange = [...result].sort(sortByDate)[0];
        result.unshift({...earliestInRange, date: dateFromMoment.format('YYYY-MM-DD')});
    }
};

const ensureMrrEndPoint = (result: MrrHistoryItem[], range: number, dateToMoment: moment.Moment) => {
    const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));

    if (!hasEndPoint && result.length > 0) {
        const sortedResult = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const mostRecentValue = sortedResult[0];
        result.push({...mostRecentValue, date: endDateToCheck.format('YYYY-MM-DD')});
    }
};

const extractMrrData = (mrrHistoryResponse: any, dateFrom: string, range: number, endDate: moment.Moment) => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const useCurrency = findHighestMrrCurrency(mrrHistoryResponse.meta.totals);
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = mrrHistoryResponse.stats.filter(d => d.currency === useCurrency);
    const filteredData = currencyFilteredData.filter((item) => moment(item.date).isSameOrAfter(dateFromMoment));
    const result = [...filteredData];

    ensureMrrStartPoint(result, currencyFilteredData, dateFromMoment);
    ensureMrrEndPoint(result, range, dateToMoment);

    const finalResult = result.sort(sortByDate);
    return {mrrData: finalResult, selectedCurrency: useCurrency};
};

const mergeSubscriptionStats = (stats: any[]) => {
    const mergedByDate = stats.reduce((acc, current) => {
        const dateKey = current.date;
        if (!acc[dateKey]) {
            acc[dateKey] = {date: dateKey, signups: 0, cancellations: 0};
        }
        acc[dateKey].signups += current.signups;
        acc[dateKey].cancellations += current.cancellations;
        return acc;
    }, {} as Record<string, {date: string; signups: number; cancellations: number}>);

    return Object.values(mergedByDate).sort(sortByDate);
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

    const {mrrData, selectedCurrency} = useMemo(() => extractMrrData(mrrHistoryResponse, dateFrom, range, endDate), [mrrHistoryResponse, dateFrom, range, endDate]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        const subscriptionArray = mergeSubscriptionStats(subscriptionStatsResponse.stats);
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = moment(endDate);

        return subscriptionArray.filter((item) => {
            const itemDate = moment(