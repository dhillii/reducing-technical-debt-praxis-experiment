import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

// Helper function to calculate percentage change
const calculatePercentageChange = (current: number, previous: number): string => {
    if (previous === 0) {
        return current > 0 ? '100%' : '0%';
    }
    const change = ((current - previous) / previous) * 100;
    return formatPercentage(change / 100);
};

// Helper function to determine direction
const determineDirection = (change: number): DiffDirection => {
    return change > 0 ? 'up' : change < 0 ? 'down' : 'same';
};

// Helper function to get first actual data point
const getFirstActualPoint = (mrrData: MrrHistoryItem[], dateFrom: string): MrrHistoryItem | undefined => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    return mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
};

// Helper function to get first MRR
const getFirstMrr = (mrrData: MrrHistoryItem[], dateFrom: string, isFromBeginningRange: boolean, totalMrr: number): number => {
    const firstActualPoint = getFirstActualPoint(mrrData, dateFrom);
    if (firstActualPoint) {
        if (moment(firstActualPoint.date).isSame(dateFrom, 'day')) {
            return firstActualPoint.mrr;
        } else {
            if (isFromBeginningRange) {
                return 0;
            } else {
                return totalMrr;
            }
        }
    } else if (isFromBeginningRange) {
        return 0;
    } else {
        return totalMrr;
    }
};

// Calculate totals from member data
const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}): {
    totalMembers: number;
    freeMembers: number;
    paidMembers: number;
    mrr: number;
    percentChanges: {
        total: string;
        free: string;
        paid: string;
        mrr: string;
    };
    directions: {
        total: DiffDirection;
        free: DiffDirection;
        paid: DiffDirection;
        mrr: DiffDirection;
    };
} => {
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
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const totalChange = ((totalMembers - firstTotal) / firstTotal) * 100;
            percentChanges.total = formatPercentage(totalChange / 100);
            directions.total = determineDirection(totalChange);
        }

        if (first.free > 0) {
            const freeChange = ((latest.free - first.free) / first.free) * 100;
            percentChanges.free = formatPercentage(freeChange / 100);
            directions.free = determineDirection(freeChange);
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latest.paid + latest.comped;

        if (firstPaidTotal > 0) {
            const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
            percentChanges.paid = formatPercentage(paidChange / 100);
            directions.paid = determineDirection(paidChange);
        }
    }

    if (mrrData.length > 1) {
        const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
                                    moment(dateFrom).year() < moment().year();

        const firstMrr = getFirstMrr(mrrData, dateFrom, isFromBeginningRange, totalMrr);

        if (firstMrr >= 0) {
            const mrrChange = firstMrr === 0
                ? (totalMrr > 0 ? 100 : 0)
                : ((totalMrr - firstMrr) / firstMrr) * 100;

            percentChanges.mrr = formatPercentage(mrrChange / 100);
            directions.mrr = determineDirection(mrrChange);
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

// Format chart data
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]): {
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
}[] => {
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

export const useGrowthStats = (range: number) => {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: {
            date_from: range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom
        }
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: {
            date_from: range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom
        }
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemo(() => {
        if (!memberCountResponse) {
            return [];
        }

        let rawData: MemberStatusItem[] = [];

        if (memberCountResponse.stats) {
            rawData = memberCountResponse.stats;
        } else if (Array.isArray(memberCountResponse)) {
            rawData = memberCountResponse;
        }

        if (range === 1 && rawData.length >= 2) {
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
        }

        return rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        if (!mrrHistoryResponse) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const dateFromMoment = moment(dateFrom);
        const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

        if (mrrHistoryResponse.stats && mrrHistoryResponse.meta?.totals) {
            const totals = mrrHistoryResponse.meta.totals;
            let currentMax = totals[0];

            if (!currentMax) {
                return {mrrData: [], selectedCurrency: 'usd'};
            }

            for (const total of totals) {
                if (total.mrr > currentMax.mrr) {
                    currentMax = total;
                }
            }

            const useCurrency = currentMax.currency;

            const currencyFilteredData = mrrHistoryResponse.stats.filter(d => d.currency === useCurrency);

            const filteredData = currencyFilteredData.filter((item) => {
                return moment(item.date).isSameOrAfter(dateFromMoment);
            });

            const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const result = [...filteredData];

            const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
            if (!hasStartPoint) {
                const mostRecentBeforeRange = allData.find((item) => {
                    return moment(item.date).isBefore(dateFromMoment);
                });

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

            const hasEndPoint = result.some(item => moment(item.date).isSame(dateToMoment, 'day'));
            if (!hasEndPoint && result.length > 0) {
                const sortedResult = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const mostRecentValue = sortedResult[0];

                result.push({
                    ...mostRecentValue,
                    date: dateToMoment.format('YYYY-MM-DD')
                });
            }

            const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            return {mrrData: finalResult, selectedCurrency: useCurrency};
        }
        return {mrrData: [], selectedCurrency: 'usd'};
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

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