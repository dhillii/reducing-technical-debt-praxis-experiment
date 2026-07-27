import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

/** Determines the direction of change based on numeric value */
const getChangeDirection = (change: number): DiffDirection => {
    return change > 0 ? 'up' : change < 0 ? 'down' : 'same';
};

/** Calculates percentage change and direction for a metric */
const calculateMetricChange = (current: number, previous: number): {percentage: string; direction: DiffDirection} => {
    if (previous <= 0) {
        return {percentage: '0%', direction: 'same'};
    }
    const change = ((current - previous) / previous) * 100;
    return {
        percentage: formatPercentage(change / 100),
        direction: getChangeDirection(change)
    };
};

/** Checks if there is sufficient data to calculate changes */
const hasSufficientMemberData = (memberData: MemberStatusItem[]): boolean => {
    return memberData.length > 1;
};

/** Checks if there is sufficient MRR data to calculate changes */
const hasSufficientMrrData = (mrrData: MrrHistoryItem[]): boolean => {
    return mrrData.length > 1;
};

/** Extracts the first actual MRR data point within the selected date range */
const findFirstActualMrrPoint = (mrrData: MrrHistoryItem[], dateFrom: string): MrrHistoryItem | undefined => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    return mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
};

/** Determines if the date range is from the beginning of a period (e.g., YTD) */
const isFromBeginningRange = (dateFrom: string): boolean => {
    return moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
           moment(dateFrom).year() < moment().year();
};

/** Calculates the starting MRR value for change calculation */
const calculateStartingMrr = (firstActualPoint: MrrHistoryItem | undefined, dateFrom: string, totalMrr: number): number => {
    if (!firstActualPoint) {
        return isFromBeginningRange(dateFrom) ? 0 : totalMrr;
    }

    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
        return firstActualPoint.mrr;
    }

    return isFromBeginningRange(dateFrom) ? 0 : totalMrr;
};

/** Calculates MRR percentage change */
const calculateMrrChange = (firstMrr: number, totalMrr: number): {percentage: string; direction: DiffDirection} => {
    if (firstMrr < 0) {
        return {percentage: '0%', direction: 'same'};
    }

    const mrrChange = firstMrr === 0
        ? (totalMrr > 0 ? 100 : 0)
        : ((totalMrr - firstMrr) / firstMrr) * 100;

    return {
        percentage: formatPercentage(mrrChange / 100),
        direction: getChangeDirection(mrrChange)
    };
};

/** Processes member data changes */
const processMemberChanges = (memberData: MemberStatusItem[], currentTotals: MemberStatusItem): {percentChanges: Record<string, string>; directions: Record<string, DiffDirection>} => {
    const percentChanges = {total: '0%', free: '0%', paid: '0%', mrr: '0%'};
    const directions = {total: 'same' as DiffDirection, free: 'same' as DiffDirection, paid: 'same' as DiffDirection, mrr: 'same' as DiffDirection};

    if (!hasSufficientMemberData(memberData)) {
        return {percentChanges, directions};
    }

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];
    const firstTotal = first.free + first.paid + first.comped;
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;

    if (firstTotal > 0) {
        const change = calculateMetricChange(totalMembers, firstTotal);
        percentChanges.total = change.percentage;
        directions.total = change.direction;
    }

    if (first.free > 0) {
        const change = calculateMetricChange(latest.free, first.free);
        percentChanges.free = change.percentage;
        directions.free = change.direction;
    }

    const firstPaidTotal = first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;

    if (firstPaidTotal > 0) {
        const change = calculateMetricChange(latestPaidTotal, firstPaidTotal);
        percentChanges.paid = change.percentage;
        directions.paid = change.direction;
    }

    return {percentChanges, directions};
};

/** Processes MRR data changes */
const processMrrChanges = (mrrData: MrrHistoryItem[], dateFrom: string): {percentChanges: Record<string, string>; directions: Record<string, DiffDirection>} => {
    const percentChanges = {total: '0%', free: '0%', paid: '0%', mrr: '0%'};
    const directions = {total: 'same' as DiffDirection, free: 'same' as DiffDirection, paid: 'same' as DiffDirection, mrr: 'same' as DiffDirection};

    if (!hasSufficientMrrData(mrrData)) {
        return {percentChanges, directions};
    }

    const latestMrr = mrrData[mrrData.length - 1].mrr;
    const firstActualPoint = findFirstActualMrrPoint(mrrData, dateFrom);
    const firstMrr = calculateStartingMrr(firstActualPoint, dateFrom, latestMrr);
    const change = calculateMrrChange(firstMrr, latestMrr);

    percentChanges.mrr = change.percentage;
    directions.mrr = change.direction;

    return {percentChanges, directions};
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

    const memberChanges = processMemberChanges(memberData, currentTotals);
    const mrrChanges = processMrrChanges(mrrData, dateFrom);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges: {
            total: memberChanges.percentChanges.total,
            free: memberChanges.percentChanges.free,
            paid: memberChanges.percentChanges.paid,
            mrr: mrrChanges.percentChanges.mrr
        },
        directions: {
            total: memberChanges.directions.total,
            free: memberChanges.directions.free,
            paid: memberChanges.directions.paid,
            mrr: mrrChanges.directions.mrr
        }
    };
};

// Format chart data
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    // Ensure data is sorted by date
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

/** Extracts member count response data */
const extractMemberData = (memberCountResponse: any): MemberStatusItem[] => {
    if (memberCountResponse?.stats) {
        return memberCountResponse.stats;
    }
    if (Array.isArray(memberCountResponse)) {
        return memberCountResponse;
    }
    return [];
};

/** Processes single-day member data to create start and end points */
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

/** Finds the highest MRR currency from totals */
const findHighestMrrCurrency = (totals: any[]): {currency: string; found: boolean} => {
    if (!totals || totals.length === 0) {
        return {currency: 'usd', found: false};
    }

    let currentMax = totals[0];
    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }

    return {currency: currentMax.currency, found: true};
};

/** Filters MRR data by currency and date range */
const filterMrrDataByRange = (currencyFilteredData: MrrHistoryItem[], dateFromMoment: moment.Moment): MrrHistoryItem[] => {
    return currencyFilteredData.filter((item) => {
        return moment(item.date).isSameOrAfter(dateFromMoment);
    });
};

/** Ensures MRR data has a start point */
const ensureMrrStartPoint = (result: MrrHistoryItem[], currencyFilteredData: MrrHistoryItem[], dateFromMoment: moment.Moment): void => {
    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (hasStartPoint) {
        return;
    }

    const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const mostRecentBeforeRange = allData.find((item) => {
        return moment(item.date).isBefore(dateFromMoment);
    });

    if (mostRecentBeforeRange) {
        result.unshift({
            ...mostRecentBeforeRange,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
        return;
    }

    if (result.length > 0) {
        const earliestInRange = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        result.unshift({
            ...earliestInRange,
            date: dateFromMoment.format('YYYY-MM-DD')
        });
    }
};

/** Ensures MRR data has an end point */
const ensureMrrEndPoint = (result: MrrHistoryItem[], range: number, dateToMoment: moment.Moment): void => {
    if (result.length === 0) {
        return;
    }

    const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;
    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
    if (hasEndPoint) {
        return;
    }

    const sortedResult = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const mostRecentValue = sortedResult[0];

    result.push({
        ...mostRecentValue,
        date: endDateToCheck.format('YYYY-MM-DD')
    });
};

export const useGrowthStats = (range: number) => {
    // Calculate date range using Shade's timezone-aware getRangeDates
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);

    // Fetch member count history from API
    // For single day ranges, we need at least 2 days of data to show a proper delta
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

    // Fetch subscription stats for real subscription events
    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    // Process member data with stable reference
    const memberData = useMemo(() => {
        const rawData = extractMemberData(memberCountResponse);
        
        if (range === 1) {
            return processSingleDayMemberData(rawData, dateFrom);
        }
        
        return rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

        if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const currencyInfo = findHighestMrrCurrency(mrrHistoryResponse.meta.totals);
        if (!currencyInfo.found) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const useCurrency = currencyInfo.currency;
        const currencyFilteredData = mrrHistoryResponse.stats.filter(d => d.currency === useCurrency);
        const filteredData = filterMrrDataByRange(currencyFilteredData, dateFromMoment);
        const result = [...filteredData];

        ensureMrrStartPoint(result, currencyFilteredData, dateFromMoment);
        ensureMrrEndPoint(result, range, dateToMoment);

        const finalResult = result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return {mrrData: finalResult, selectedCurrency: useCurrency};
    }, [mrrHistoryResponse, dateFrom, range]);

    // Calculate totals
    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    // Format chart data
    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    // Get currency symbol
    const currencySymbol = useMemo(() => {
        return getSymbol(selectedCurrency);
    }, [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    // Process subscription data for real subscription events (like Ember dashboard)
    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        // Merge subscription stats by date (like Ember's mergeStatsByDate)
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

        // Convert to array and sort by date
        const subscriptionArray = Object.values(mergedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Filter to requested date range
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