```typescript
import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

// Determine direction based on change value
const getDirection = (change: number): DiffDirection => {
    return change > 0 ? 'up' : change < 0 ? 'down' : 'same';
};

// Calculate percentage change and direction for a metric
const calculateMetricChange = (current: number, previous: number): {percentage: string; direction: DiffDirection} => {
    if (previous <= 0) {
        return {
            percentage: '0%',
            direction: 'same'
        };
    }

    const change = ((current - previous) / previous) * 100;
    return {
        percentage: formatPercentage(change / 100),
        direction: getDirection(change)
    };
};

// Calculate member count changes
const calculateMemberChanges = (memberData: MemberStatusItem[], currentTotals: MemberStatusItem) => {
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
    const latest = memberData[memberData.length - 1];
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const firstTotal = first.free + first.paid + first.comped;

    const totalChange = calculateMetricChange(totalMembers, firstTotal);
    percentChanges.total = totalChange.percentage;
    directions.total = totalChange.direction;

    const freeChange = calculateMetricChange(latest.free, first.free);
    percentChanges.free = freeChange.percentage;
    directions.free = freeChange.direction;

    const latestPaidTotal = latest.paid + latest.comped;
    const firstPaidTotal = first.paid + first.comped;
    const paidChange = calculateMetricChange(latestPaidTotal, firstPaidTotal);
    percentChanges.paid = paidChange.percentage;
    directions.paid = paidChange.direction;

    return {percentChanges, directions};
};

// Determine the first MRR value for change calculation
const getFirstMrrValue = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): number => {
    if (mrrData.length <= 1) {
        return 0;
    }

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

// Calculate MRR change
const calculateMrrChange = (mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number): {percentage: string; direction: DiffDirection} => {
    if (mrrData.length <= 1) {
        return {
            percentage: '0%',
            direction: 'same'
        };
    }

    const firstMrr = getFirstMrrValue(mrrData, dateFrom, totalMrr);

    if (firstMrr < 0) {
        return {
            percentage: '0%',
            direction: 'same'
        };
    }

    const mrrChange = firstMrr === 0
        ? (totalMrr > 0 ? 100 : 0)
        : ((totalMrr - firstMrr) / firstMrr) * 100;

    return {
        percentage: formatPercentage(mrrChange / 100),
        direction: getDirection(mrrChange)
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
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const memberChanges = calculateMemberChanges(memberData, currentTotals);
    const mrrChange = calculateMrrChange(mrrData, dateFrom, totalMrr);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges: {
            total: memberChanges.percentChanges.total,
            free: memberChanges.percentChanges.free,
            paid: memberChanges.percentChanges.paid,
            mrr: mrrChange.percentage
        },
        directions: {
            total: memberChanges.directions.total,
            free: memberChanges.directions.free,
            paid: memberChanges.directions.paid,
            mrr: mrrChange.direction
        }
    };
};

// Create data maps for efficient lookup
const createDataMaps = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const memberMap = new Map(memberData.map(item => [item.date, item]));
    const mrrMap = new Map(mrrData.map(item => [item.date, item]));
    return {memberMap, mrrMap};
};

// Get merged dates from both datasets
const getMergedDates = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]): string[] => {
    const memberDates = memberData.map(item => item.date);
    const mrrDates = mrrData.map(item => item.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])];
    return allDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
};

// Build single chart data point
const buildChartDataPoint = (date: string, lastMemberItem: MemberStatusItem | null, lastMrrItem: MrrHistoryItem | null) => {
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
};

// Format chart data
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const {memberMap, mrrMap} = createDataMaps(sortedMemberData, sortedMrrData);
    const allDates = getMergedDates(sortedMemberData, sortedMrrData);

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    return allDates.map((date) => {
        const currentMemberItem = memberMap.get(date);
        if (currentMemberItem) {
            lastMemberItem = currentMemberItem;
        }

        const currentMrrItem = mrrMap.get(date);
        if (currentMrrItem) {
            lastMrrItem = currentMrrItem;
        }

        return buildChartDataPoint(date, lastMemberItem, lastMrrItem);
    });
};

// Extract member data from response
const extractMemberData = (memberCountResponse: any): MemberStatusItem[] => {
    if (memberCountResponse?.stats) {
        return memberCountResponse.stats;
    }
    if (Array.isArray(memberCountResponse)) {
        return memberCountResponse;
    }
    return [];
};

// Process member data for single day range
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

// Select currency with highest MRR
const selectHighestMrrCurrency = (totals: any[]): string => {
    if (!totals || totals.length === 0) {
        return 'usd';
    }

    let currentMax = totals[0];
    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }
    return currentMax.currency;
};

// Ensure start point exists in MRR data
const ensureMrrStartPoint = (result: MrrHistoryItem[], allData: MrrHistoryItem[], dateFromMoment: moment.Moment): void => {
    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (hasStartPoint) {
        return;
    }

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
};

// Ensure end point exists in MRR data
const ensureMrrEndPoint = (result: MrrHistoryItem[], endDateToCheck: moment.Moment): void => {
    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
    if (hasEndPoint || result.length === 0) {
        return;
    }

    const sortedResult = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const mostRecentValue = sortedResult[0];

    result.push({
        ...mostRecentValue,
        date: endDateToCheck.format('YYYY-MM-DD')
    });
};

// Process MRR data
const processMrrData = (mrrHistoryResponse: any, dateFrom: string, range: number) => {
    if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    const selectedCurrency = selectHighestMrrCurrency(mrrHistoryResponse.meta.totals);
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

    const currencyFilteredData = mrrHistoryResponse.stats.filter(d => d.currency === selectedCurrency);
    const filteredData = currencyFilteredData.filter((item) => {
        return moment(item.date).isSameOrAfter(dateFromMoment);
    });

    const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const result = [...filteredData];

    ensureMrrStartPoint(result, allData, dateFromMoment);
    const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    ensureMrrEndPoint(result, endDateToCheck);

    const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: finalResult, selectedCurrency};
};

// Merge subscription stats by date
const mergeSubscriptionStatsByDate = (stats: any[]): Record<string, {date: string; signups: number; cancellations: number}> => {
    return stats.reduce((acc, current) => {
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
};

// Filter subscription data by date range
const filterSubscriptionDataByRange = (subscriptionArray: any[], dateFrom: string, endDate: string): any[] => {
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = moment(endDate);

    return subscriptionArray.filter((item) => {
        const itemDate = moment(item.date);
        return itemDate.isSameOrAfter(dateFromMoment) && itemDate.isSameOrBefore(dateToMoment);
    });
};

// Process subscription stats
const processSubscriptionStats = (subscriptionStatsResponse: any, dateFrom: string, endDate: string): any[] => {
    if (!subscriptionStatsResponse?.stats) {
        return [];
    }

    const mergedByDate = mergeSubscriptionStatsByDate(subscriptionStatsResponse.stats);
    const subscriptionArray = Object.values(mergedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return filterSubscriptionDataByRange(subscriptionArray, dateFrom, endDate);
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
        const rawData = extractMemberData(memberCountResponse);
        return range === 1 ? processSingleDayMemberData(rawData, dateFrom) : rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        return processMrrData(mrrHistoryResponse, dateFrom, range);
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => {
        return getSymbol(selectedCurrency);
    }, [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => {
        return processSubscriptionStats(subscriptionStatsResponse, dateFrom, endDate);
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
```