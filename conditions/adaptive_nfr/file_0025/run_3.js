```typescript
import React, {useEffect, useMemo, useState} from 'react';
import moment from 'moment';
import {Card, CardContent, CardDescription, CardHeader, CardTitle, ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, EmptyIndicator, LucideIcon, Recharts, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, formatDisplayDateWithRange, formatNumber, getRangeDates} from '@tryghost/shade';
import {determineAggregationStrategy, getPeriodText, sanitizeChartData} from '@src/utils/chart-helpers';

type PaidMembersChangeChartProps = {
    subscriptionData?: {date: string; signups: number; cancellations: number}[];
    memberData: {
        date: string;
        paid_subscribed?: number;
        paid_canceled?: number;
    }[];
    range: number;
    isLoading: boolean;
};

/**
 * Fills missing data points with zeros for consistent chart display
 */
const fillMissingDataPoints = (data: {date: string; signups: number; cancellations: number}[], dateRange: number, overrideStrategy?: 'none' | 'weekly' | 'monthly' | 'monthly-exact') => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(item => item.date === today);
        return [{
            date: today,
            signups: todayData?.signups || 0,
            cancellations: todayData?.cancellations || 0
        }];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);

    const dataMap = new Map(data.map(item => [item.date, item]));
    const filledData: {date: string; signups: number; cancellations: number}[] = [];
    const seenKeys = new Set<string>();

    const periodIterators: Record<string, () => void> = {
        monthly: () => {
            const currentPeriod = moment(startDate).startOf('month');
            const endPeriod = moment(endDate).startOf('month');
            while (currentPeriod.isSameOrBefore(endPeriod)) {
                addDataPoint(currentPeriod.format('YYYY-MM-DD'));
                currentPeriod.add(1, 'month');
            }
        },
        weekly: () => {
            const currentPeriod = moment(startDate).startOf('week');
            const endPeriod = moment(endDate).startOf('week');
            while (currentPeriod.isSameOrBefore(endPeriod)) {
                addDataPoint(currentPeriod.format('YYYY-MM-DD'));
                currentPeriod.add(1, 'week');
            }
        },
        daily: () => {
            const currentDate = moment(startDate);
            const endMoment = moment(endDate);
            while (currentDate.isSameOrBefore(endMoment)) {
                addDataPoint(currentDate.format('YYYY-MM-DD'));
                currentDate.add(1, 'day');
            }
        }
    };

    /**
     * Adds a data point, avoiding duplicates
     */
    const addDataPoint = (dateKey: string) => {
        if (!seenKeys.has(dateKey)) {
            seenKeys.add(dateKey);
            const existingData = dataMap.get(dateKey);
            filledData.push(existingData || {
                date: dateKey,
                signups: 0,
                cancellations: 0
            });
        }
    };

    const iterator = periodIterators[strategy] || periodIterators.daily;
    iterator();

    return filledData;
};

type ResolutionOption = 'daily' | 'weekly' | 'monthly';

/**
 * Calculates actual date span for YTD ranges
 */
const getActualDateSpan = (range: number): number => {
    if (range === -1) {
        const {startDate, endDate} = getRangeDates(range);
        return moment(endDate).diff(moment(startDate), 'days');
    }
    return range;
};

/**
 * Determines available resolutions based on date range
 */
const getAvailableResolutions = (range: number): ResolutionOption[] => {
    const actualSpan = getActualDateSpan(range);
    if (actualSpan < 30) {
        return ['daily'];
    } else if (actualSpan >= 91) {
        return ['weekly', 'monthly'];
    } else {
        return ['daily', 'weekly'];
    }
};

/**
 * Gets default resolution for a range
 */
const getDefaultResolution = (range: number): ResolutionOption => {
    const actualSpan = getActualDateSpan(range);
    if (actualSpan < 30) {
        return 'daily';
    } else if (actualSpan >= 91) {
        return 'monthly';
    } else {
        return 'weekly';
    }
};

/**
 * Maps resolution to aggregation strategy
 */
const getAggregationStrategy = (resolution: ResolutionOption): 'none' | 'weekly' | 'monthly' => {
    const strategyMap: Record<ResolutionOption, 'none' | 'weekly' | 'monthly'> = {
        daily: 'none',
        weekly: 'weekly',
        monthly: 'monthly'
    };
    return strategyMap[resolution];
};

/**
 * Calculates effective range for date formatting based on resolution
 */
const getEffectiveRange = (range: number, resolution: ResolutionOption): number => {
    if (resolution === 'weekly' && range < 91) {
        return 91;
    } else if (resolution === 'monthly' && range < 365) {
        return 365;
    }
    return range;
};

/**
 * Combines subscription data from multiple sources
 */
const combineSubscriptionData = (signupsData: any[], cancellationsData: any[]): {date: string; signups: number; cancellations: number}[] => {
    const cancellationsMap = new Map(cancellationsData.map(c => [c.date, c]));
    const combinedData = signupsData.map(item => ({
        date: item.date,
        signups: item.signups || 0,
        cancellations: cancellationsMap.get(item.date)?.cancellations || 0
    }));

    const combinedDatesSet = new Set(combinedData.map(item => item.date));
    cancellationsData.forEach((cancelItem) => {
        if (!combinedDatesSet.has(cancelItem.date)) {
            combinedData.push({
                date: cancelItem.date,
                signups: 0,
                cancellations: cancelItem.cancellations || 0
            });
        }
    });

    combinedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return combinedData;
};

/**
 * Combines member data from multiple sources
 */
const combineMemberData = (subscribedData: any[], canceledData: any[]): {date: string; paid_subscribed: number; paid_canceled: number}[] => {
    const canceledMap = new Map(canceledData.map(c => [c.date, c]));
    const combinedData = subscribedData.map(item => ({
        date: item.date,
        paid_subscribed: item.paid_subscribed || 0,
        paid_canceled: canceledMap.get(item.date)?.paid_canceled || 0
    }));

    const combinedDatesSet = new Set(combinedData.map(item => item.date));
    canceledData.forEach((cancelItem) => {
        if (!combinedDatesSet.has(cancelItem.date)) {
            combinedData.push({
                date: cancelItem.date,
                paid_subscribed: 0,
                paid_canceled: cancelItem.paid_canceled || 0
            });
        }
    });

    combinedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return combinedData;
};

/**
 * Transforms subscription data for chart display
 */
const transformSubscriptionChartData = (data: {date: string; signups: number; cancellations: number}[], range: number, effectiveRange: number) => {
    return data.map((item) => ({
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item.signups || 0,
        cancelled: -(item.cancellations || 0)
    }));
};

/**
 * Transforms member data for chart display
 */
const transformMemberChartData = (data: {date: string; paid_subscribed: number; paid_canceled: number}[], range: number, effectiveRange: number) => {
    return data.map((item) => ({
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item.paid_subscribed || 0,
        cancelled: -(item.paid_canceled || 0)
    }));
};

/**
 * Processes subscription data for chart
 */
const processSubscriptionData = (subscriptionData: {date: string; signups: number; cancellations: number}[], range: number, aggregationStrategy: 'none' | 'weekly' | 'monthly', effectiveRange: number) => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = subscriptionData.find(item => item.date === today);
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayData?.signups || 0,
            cancelled: -(todayData?.cancellations || 0)
        }];
    }

    const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
    const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
    const combinedData = combineSubscriptionData(signupsData, cancellationsData);
    const filledData = fillMissingDataPoints(combinedData, range, aggregationStrategy);
    return transformSubscriptionChartData(filledData, range, effectiveRange);
};

/**
 * Processes member data for chart
 */
const processMemberData = (memberData: {date: string; paid_subscribed?: number; paid_canceled?: number}[], range: number, aggregationStrategy: 'none' | 'weekly' | 'monthly', effectiveRange: number) => {
    if (!memberData || memberData.length === 0) {
        return [];
    }

    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = memberData.find(item => item.date === today);
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayData?.paid_subscribed || 0,
            cancelled: -(todayData?.paid_canceled || 0)
        }];
    }

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
    const combinedData = combineMemberData(subscribedData, canceledData);
    return transformMemberChartData(combinedData, range, effectiveRange);
};

/**
 * Formats resolution for display
 */
const formatResolution = (resolution: ResolutionOption): string => {
    return resolution.charAt(0).toUpperCase() + resolution.slice(1);
};

/**
 * Formats tooltip date based on selected resolution
 */
const formatTooltipDate = (rawDate: string, resolution: ResolutionOption): string => {
    const rangeMap: Record<ResolutionOption, number> = {
        monthly: 366,
        weekly: 91,
        daily: 30
    };
    return formatDisplayDateWithRange(rawDate, rangeMap[resolution]);
};

const PaidMembersChangeChart: React.FC<PaidMembersChangeChartProps> = ({
    subscriptionData,
    memberData,
    range,
    isLoading
}) => {
    const [selectedResolution, setSelectedResolution] = useState<ResolutionOption>(() => getDefaultResolution(range));

    useEffect(() => {
        setSelectedResolution(getDefaultResolution(range));
    }, [range]);

    const availableResolutions = useMemo(() => getAvailableResolutions(range), [range]);
    const aggregationStrategy = useMemo(() => getAggregationStrategy(selectedResolution), [selectedResolution]);
    const effectiveRange = useMemo(() => getEffectiveRange(range, selectedResolution), [range, selectedResolution]);

    const paidChangeChartData = useMemo(() => {
        if (subscriptionData && subscriptionData.length > 0) {
            return processSubscriptionData(subscriptionData, range, aggregationStrategy, effectiveRange);
        } else {
            return processMemberData(memberData, range, aggregationStrategy, effectiveRange);
        }
    }, [memberData, subscriptionData, range, aggregationStrategy, effectiveRange]);

    const paidChangeChartConfig = {
        new: {
            label: 'New',
            color: 'hsl(var(--chart-teal))'
        },
        cancelled: {
            label: 'Cancelled',
            color: 'hsl(var(--chart-rose))'
        }
    } satisfies ChartConfig;

    const totals = useMemo(() => {
        const totalNew = paidChangeChartData.reduce((sum, item) => sum + item.new, 0);
        const totalCancelled = paidChangeChartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0);
        return {new: totalNew, cancelled: totalCancelled};
    }, [paidChangeChartData]);

    if (isLoading) {
        return null;
    }

    const hasData = paidChangeChartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);

    return (
        <Card data-testid='paid-members-change-card'>
            <CardHeader>
                <div className="flex items-start justify-between gap-1.5">
                    <div className='flex flex-col gap-1.5'>
                        <CardTitle>Paid subscriptions</CardTitle>
                        <CardDescription>New and cancelled paid subscriptions {getPeriodText(range)}</CardDescription>
                    </div>
                    {availableResolutions.length > 1 && (
                        <div>
                            <Select value={selectedResolution} onValueChange={value => setSelectedResolution(value as ResolutionOption)}>
                                <SelectTrigger className="w-[110px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent align='end'>
                                    {availableResolutions.map(resolution => (
                                        <SelectItem key={resolution} value={resolution}>
                                            {formatResolution(resolution)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {hasData ? (
                    <div>
                        <ChartContainer className='aspect-auto h-[200px] w-full md:h-[220px] xl:h-