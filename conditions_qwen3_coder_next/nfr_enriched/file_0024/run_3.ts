import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

// Helper: Get first MRR value for calculations
const getFirstMrrValue = (mrrData: MrrHistoryItem[], dateFrom: string) => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
    const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
                                moment(dateFrom).year() < moment().year();

    if (!firstActualPoint) {
        return isFromBeginningRange ? 0 : 0;
    }

    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    if (isFromBeginningRange) {
        return 0;
    }

    return mrrData.length > 0 ? mrrData[mrrData.length - 1]?.mrr ?? 0;
};

// Helper: Calculate MRR change direction and percent
const calculateMrrChange = (mrrData: MrrHistoryItem[], dateFrom: string) => {
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;
    const firstMrr = getFirstMrrValue(mrrData, dateFrom);
    const mrrChange = firstMrr === 0
        ? (latestMrr > 0 ? 100 : 0)
        : ((latestMrr - firstMrr) / firstMrr) * 100;

    return {
        percent: mrrChange > 0 ? 'up' : mrrChange < 0 ? 'down' : 'same',
        value: formatPercentage(mrrChange / 100)
    };
};

// Helper: Determine change direction and percentage for a given metric
const calculateChange = (current: number, previous: number): { percent: string; direction: DiffDirection } => {
    if (previous <= 0) {
        return {
            percent: current > 0 ? '100%' : '0%',
            direction: current !== 0 ? 'up' : 'same'
        };
    }

    const change = ((current - previous) / previous) * 100;
    return {
        percent: formatPercentage(change / 100),
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same'
    };
};

// Calculate totals from member data
const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
    if (!memberData.length) {
        return {
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
        };
    }

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData.length > 0 ? memberData[memberData.length - 1] : {free: 0, paid: 0, comped: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1].mrr : 0;

    const percentChanges = {
        total: '0%',
        free: '0%',
        paid: '0%',
        mrr: '0%'
    };

    const directions: Record<string, DiffDirection> = {
        total: 'same',
        free: 'same',
        paid: 'same',
        mrr: 'same'
    };

    if (memberData.length > 1) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const { percent, direction } = calculateChange(totalMembers, firstTotal);
            percentChanges.total = percent;
            directions.total = direction;
        }

        if (first.free > 0) {
            const { percent, direction } = calculateChange(latest.free, first.free);
            percentChanges.free = percent;
            directions.free = direction;
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latest.paid + latest.comped;

        if (firstPaidTotal > 0) {
            const { percent, direction } = calculateChange(latestPaidTotal, firstPaidTotal);
            percentChanges.paid = percent;
            directions.paid = direction;
        }
    }

    if (mrrData.length > 1) {
        const { percent, direction } = calculateMrrChange(mrrData, dateFrom);
        percentChanges.mrr = percent;
        directions.mrr = direction;
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

// Format chart data
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMemberData.map(item => item.date);
    const mrrDates = sortedMrrData.map(item => item.date);

    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

    return allDates.map((date) => {
        const currentMemberItem = memberMap.get(date);
        if (currentMemberItem) {
            lastMemberItem = currentMemberItem;
        }

        const currentMrrItem = mrrMap.get(date);
        if (currentMrrItem) {
            lastMrrItem = currentMrrItem;
        }

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

// Ensure minimum data points for Today range
const prepareMemberDataForToday = (rawData: MemberStatusItem[], dateFrom: string): MemberStatusItem[] => {
    if (rawData.length < 2) {
        return rawData;
    }

    const yesterdayData = rawData[rawData.length - 2];
    const todayData = rawData[rawData.length - 1];

    const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
    const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

    return [
        {
            ...yesterdayData,
            date: startOfToday
        },
        {
            ...todayData,
            date: startOfTomorrow
        }
    ];
};

// Prepare MRR data with boundary points
const prepareMrrData = (mrrHistoryResponse: any, dateFrom: string, range: number): { mrrData: MrrHistoryItem[], selectedCurrency: string } => {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return { mrrData: [], selectedCurrency: 'usd' };
    }

    // Select highest MRR currency
    const totals = mrrHistoryResponse.meta.totals;
    const currentMax = totals.find((total: any) => total.mrr === Math.max(...totals.map((t: any) => t.mrr))) ?? totals[0];

    if (!currentMax) {
        return { mrrData: [], selectedCurrency: 'usd' };
    }

    const useCurrency = currentMax.currency;
    const currencyFilteredData = mrrHistoryResponse.stats.filter((d: any) => d.currency === useCurrency);

    // Filter into range and sort chronologically
    const filteredData = currencyFilteredData.filter((item: any) => moment(item.date).isSameOrAfter(dateFromMoment));
    let result = [...filteredData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Add start boundary point if missing
    const hasStartPoint = result.some((item: any) => moment(item.date).isSame(dateFromMoment, 'day'));
    if (!hasStartPoint) {
        const allData = [...currencyFilteredData].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const mostRecentBeforeRange = allData.find((item: any) => moment(item.date).isBefore(dateFromMoment));

        if (mostRecentBeforeRange) {
            result.unshift({
                ...mostRecentBeforeRange,
                date: dateFromMoment.format('YYYY-MM-DD')
            });
        } else if (result.length > 0) {
            const earliestInRange = [...result].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
            result.unshift({
                ...earliestInRange,
                date: dateFromMoment.format('YYYY-MM-DD')
            });
        }
    }

    // Add end boundary point if missing
    const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    const hasEndPoint = result.some((item: any) => moment(item.date).isSame(endDateToCheck, 'day'));

    if (!hasEndPoint && result.length > 0) {
        const sortedResult = [...result].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const mostRecentValue = sortedResult[0];

        result.push({
            ...mostRecentValue,
            date: endDateToCheck.format('YYYY-MM-DD')
        });
    }

    result.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { mrrData: result, selectedCurrency: useCurrency };
};

// Process subscription data into merged and filtered array
const processSubscriptionData = (subscriptionStatsResponse: any, dateFrom: string, endDate: string) => {
    if (!subscriptionStatsResponse?.stats) {
        return [];
    }

    const mergedByDate = subscriptionStatsResponse.stats.reduce(
        (acc: Record<string, { date: string; signups: number; cancellations: number }>,
         current: { date: string; signups: number; cancellations: number }) => {
            const dateKey = current.date;
            if (!acc[dateKey]) {
                acc[dateKey] = { date: dateKey, signups: 0, cancellations: 0 };
            }
            acc[dateKey].signups += current.signups;
            acc[dateKey].cancellations += current.cancellations;
            return acc;
        }, {}
    );

    const subscriptionArray = Object.values(mergedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const dateFromMoment = moment(dateFrom);
    const dateToMoment = moment(endDate);

    return subscriptionArray.filter((item: { date: string }) => {
        const itemDate = moment(item.date);
        return itemDate.isSameOrAfter(dateFromMoment) && itemDate.isSameOrBefore(dateToMoment);
    });
};

export const useGrowthStats = (range: number) => {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);

    const memberDataStartDate = range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom;

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: { date_from: memberDataStartDate }
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: { date_from: memberDataStartDate }
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemo(() => {
        let rawData: MemberStatusItem[] = [];

        if (memberCountResponse?.stats) {
            rawData = memberCountResponse.stats;
        } else if (Array.isArray(memberCountResponse)) {
            rawData = memberCountResponse;
        }

        if (range === 1) {
            return prepareMemberDataForToday(rawData, dateFrom);
        }

        return rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        return prepareMrrData(mrrHistoryResponse, dateFrom, range);
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