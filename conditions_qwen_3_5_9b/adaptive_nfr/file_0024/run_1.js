```typescript
import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

// Calculate totals from member data
const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) => {
    if (!memberData.length) {
        return createEmptyTotals();
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData.length > 0 ? memberData[memberData.length - 1] : {free: 0, paid: 0, comped: 0};
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const percentChanges = createDefaultPercentChanges();
    const directions = createDefaultDirections();

    if (memberData.length > 1) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            calculateMemberChange('total', totalMembers, firstTotal, percentChanges, directions);
        }

        if (first.free > 0) {
            calculateMemberChange('free', latest.free, first.free, percentChanges, directions);
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latest.paid + latest.comped;

        if (firstPaidTotal > 0) {
            calculateMemberChange('paid', latestPaidTotal, firstPaidTotal, percentChanges, directions);
        }
    }

    if (mrrData.length > 1) {
        const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
        const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
        const isFromBeginningRange = isFromBeginningRangeCheck(dateFrom);

        let firstMrr = 0;

        if (firstActualPoint) {
            if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
                firstMrr = firstActualPoint.mrr;
            } else {
                firstMrr = calculateFirstMrrForRange(firstActualPoint, isFromBeginningRange, totalMrr);
            }
        } else if (isFromBeginningRange) {
            firstMrr = 0;
        } else {
            firstMrr = totalMrr;
        }

        if (firstMrr >= 0) {
            calculateMrrChange(firstMrr, totalMrr, percentChanges, directions);
        }
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

const createEmptyTotals = () => ({
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

const createDefaultPercentChanges = () => ({
    total: '0%',
    free: '0%',
    paid: '0%',
    mrr: '0%'
});

const createDefaultDirections = () => ({
    total: 'same' as DiffDirection,
    free: 'same' as DiffDirection,
    paid: 'same' as DiffDirection,
    mrr: 'same' as DiffDirection
});

const calculateMemberChange = (
    type: 'total' | 'free' | 'paid',
    current: number,
    previous: number,
    percentChanges: {total: string; free: string; paid: string; mrr: string},
    directions: {total: DiffDirection; free: DiffDirection; paid: DiffDirection; mrr: DiffDirection}
) => {
    const change = ((current - previous) / previous) * 100;
    const formatted = formatPercentage(change / 100);
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'same';

    percentChanges[type] = formatted;
    directions[type] = direction;
};

const calculateMrrChange = (
    firstMrr: number,
    totalMrr: number,
    percentChanges: {total: string; free: string; paid: string; mrr: string},
    directions: {total: DiffDirection; free: DiffDirection; paid: DiffDirection; mrr: DiffDirection}
) => {
    const mrrChange = firstMrr === 0
        ? (totalMrr > 0 ? 100 : 0)
        : ((totalMrr - firstMrr) / firstMrr) * 100;

    percentChanges.mrr = formatPercentage(mrrChange / 100);
    directions.mrr = mrrChange > 0 ? 'up' : mrrChange < 0 ? 'down' : 'same';
};

const calculateFirstMrrForRange = (
    firstActualPoint: MrrHistoryItem,
    isFromBeginningRange: boolean,
    totalMrr: number
) => {
    if (isFromBeginningRange) {
        return 0;
    }
    return totalMrr;
};

const isFromBeginningRangeCheck = (dateFrom: string) => {
    const dateFromMoment = moment(dateFrom);
    const currentYear = moment().year();

    return dateFromMoment.isSame(moment().startOf('year'), 'day') ||
           dateFromMoment.year() < currentYear;
};

// Format chart data
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMemberData.map(item => item.date);
    const mrrDates = sortedMrrData.map(item => item.date);

    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

    return allDates.map((date) => {
        const currentMemberItem = memberMap.get(date);
        const currentMrrItem = mrrMap.get(date);

        const free = currentMemberItem?.free ?? 0;
        const paid = currentMemberItem?.paid ?? 0;
        const comped = currentMemberItem?.comped ?? 0;
        const paidTotal = paid + comped;
        const value = free + paidTotal;
        const mrr = currentMrrItem?.mrr ?? 0;
        const paidSubscribed = currentMemberItem?.paid_subscribed ?? 0;
        const paidCanceled = currentMemberItem?.paid_canceled ?? 0;

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

export const useGrowthStats = (range: number) => {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);

    const memberDataStartDate = range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom;

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: {
            date_from: memberDataStartDate
        }
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: {
            date_from: memberDataStartDate
        }
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemo(() => {
        let rawData: MemberStatusItem[] = [];

        if (memberCountResponse?.stats) {
            rawData = memberCountResponse.stats;
        } else if (Array.isArray(memberCountResponse)) {
            rawData = memberCountResponse;
        }

        if (range === 1 && rawData.length >= 2) {
            return createSyntheticDataPoints(rawData, dateFrom);
        }

        return rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

        if (mrrHistoryResponse?.stats && mrrHistoryResponse?.meta?.totals) {
            const totals = mrrHistoryResponse.meta.totals;
            const currentMax = totals[0];

            if (!currentMax) {
                return {mrrData: [], selectedCurrency: 'usd'};
            }

            const useCurrency = findMaxCurrency(totals);
            const currencyFilteredData = mrrHistoryResponse.stats.filter(d => d.currency === useCurrency);
            const filteredData = currencyFilteredData.filter((item) => moment(item.date).isSameOrAfter(dateFromMoment));

            const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const result = [...filteredData];

            if (!hasStartPoint(result, dateFromMoment)) {
                const mostRecentBeforeRange = allData.find((item) => moment(item.date).isBefore(dateFromMoment));

                if (mostRecentBeforeRange) {
                    result.unshift({
                        ...mostRecentBeforeRange,
                        date: dateFromMoment.format('YYYY-MM-DD')
                    });
                } else if (result.length > 0) {
                    const earliestInRange = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
                    result.unshift({
                        ...earliestInRange,
                        date: dateFromMoment.format('YYYY-MM-DD')
                    });
                }
            }

            const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;

            if (!hasEndPoint(result, endDateToCheck) && result.length > 0) {
                const sortedResult = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const mostRecentValue = sortedResult[0];

                result.push({
                    ...mostRecentValue,
                    date: endDateToCheck.format('YYYY-MM-DD')
                });
            }

            return {mrrData: result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), selectedCurrency: useCurrency};
        }
        return {mrrData: [], selectedCurrency: 'usd'};
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => {
        return getSymbol(selectedCurrency);
    }, [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        const mergedByDate = subscriptionStatsResponse.stats.reduce((acc, current) => {
            const dateKey = current.date;

            if (!acc[dateKey]) {
                acc[dateKey] = {
                    date: dateKey,
                    signups: 0,
                    cancellations: 0
                };
            }

            acc[dateKey].signups += current.signups;
            acc[dateKey].cancellations += current.cancellations;

            return acc;
        }, {} as Record<string, {date: string; signups: number; cancellations: number}>);

        const subscriptionArray = Object.values(mergedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const dateFromMoment = moment(dateFrom);
        const dateToMoment = moment(endDate);

        return subscriptionArray.filter((item) => {
            const itemDate = moment(item.date);
            return itemDate.isSameOrAfter(dateFromMoment) && itemDate.isSameOrBefore(dateToMoment);
        });
    }, [subscriptionStatsResponse, dateFrom, endDate]);

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

const createSyntheticDataPoints = (rawData: MemberStatusItem[], dateFrom: string) => {
    const yesterdayData = rawData[rawData.length - 2];
    const todayData = rawData[rawData.length - 1];

    const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
    const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

    const startPoint = {
        ...yesterdayData,
        date: startOfToday
    };

    const endPoint = {
        ...todayData,
        date: startOfTomorrow
    };

    return [startPoint, endPoint];
};

const findMaxCurrency = (totals: Array<{currency: string; mrr: number}>) => {
    let currentMax = totals[0];

    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }

    return currentMax.currency;
};

const hasStartPoint = (result: MrrHistoryItem[], dateFromMoment: moment.Moment) => {
    return result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
};

const hasEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment) => {
    return result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
};
```