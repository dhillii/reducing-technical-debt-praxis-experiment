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

type ResolutionOption = 'daily' | 'weekly' | 'monthly';

type ChartDataPoint = {
    date: string;
    rawDate: string;
    new: number;
    cancelled: number;
};

type CombinedDataPoint = {
    date: string;
    signups?: number;
    cancellations?: number;
    paid_subscribed?: number;
    paid_canceled?: number;
};

// Helper to calculate actual date span for YTD ranges
const getActualDateSpan = (range: number): number => {
    if (range === -1) {
        const {startDate, endDate} = getRangeDates(range);
        return moment(endDate).diff(moment(startDate), 'days');
    }
    return range;
};

// Helper to determine available resolutions based on range
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

// Helper to get default resolution for a range
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

// Map resolution to aggregation strategy
const getAggregationStrategy = (resolution: ResolutionOption) => {
    switch (resolution) {
    case 'daily':
        return 'none' as const;
    case 'weekly':
        return 'weekly' as const;
    case 'monthly':
        return 'monthly' as const;
    }
};

// Fill missing data points with zeros
const fillMissingDataPoints = (
    data: CombinedDataPoint[],
    dateRange: number,
    overrideStrategy?: 'none' | 'weekly' | 'monthly' | 'monthly-exact'
): CombinedDataPoint[] => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(item => item.date === today);
        return [{
            date: today,
            signups: todayData?.signups || 0,
            cancellations: todayData?.cancellations || 0,
            paid_subscribed: todayData?.paid_subscribed || 0,
            paid_canceled: todayData?.paid_canceled || 0
        }];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);

    const dataMap = new Map(data.map(item => [item.date, item]));
    const filledData: CombinedDataPoint[] = [];
    const seenKeys = new Set<string>();

    const addDataPoint = (dateKey: string) => {
        if (!seenKeys.has(dateKey)) {
            seenKeys.add(dateKey);
            const existingData = dataMap.get(dateKey);
            filledData.push(existingData || {
                date: dateKey,
                signups: 0,
                cancellations: 0,
                paid_subscribed: 0,
                paid_canceled: 0
            });
        }
    };

    if (strategy === 'monthly') {
        const currentPeriod = moment(startDate).startOf('month');
        const endPeriod = moment(endDate).startOf('month');
        while (currentPeriod.isSameOrBefore(endPeriod)) {
            addDataPoint(currentPeriod.format('YYYY-MM-DD'));
            currentPeriod.add(1, 'month');
        }
    } else if (strategy === 'weekly') {
        const currentPeriod = moment(startDate).startOf('week');
        const endPeriod = moment(endDate).startOf('week');
        while (currentPeriod.isSameOrBefore(endPeriod)) {
            addDataPoint(currentPeriod.format('YYYY-MM-DD'));
            currentPeriod.add(1, 'week');
        }
    } else {
        const currentDate = moment(startDate);
        const endMoment = moment(endDate);
        while (currentDate.isSameOrBefore(endMoment)) {
            addDataPoint(currentDate.format('YYYY-MM-DD'));
            currentDate.add(1, 'day');
        }
    }

    return filledData;
};

// Combine aggregated data from two sources
const combineAggregatedData = (
    primaryData: Array<{date: string; [key: string]: any}>,
    secondaryData: Array<{date: string; [key: string]: any}>,
    primaryKey: string,
    secondaryKey: string
): CombinedDataPoint[] => {
    const secondaryMap = new Map(secondaryData.map(item => [item.date, item]));
    const combinedData = primaryData.map(item => ({
        date: item.date,
        [primaryKey]: item[primaryKey] || 0,
        [secondaryKey]: secondaryMap.get(item.date)?.[secondaryKey] || 0
    }));

    const combinedDatesSet = new Set(combinedData.map(item => item.date));
    secondaryData.forEach(item => {
        if (!combinedDatesSet.has(item.date)) {
            combinedData.push({
                date: item.date,
                [primaryKey]: 0,
                [secondaryKey]: item[secondaryKey] || 0
            });
        }
    });

    combinedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return combinedData;
};

// Format chart data point
const formatChartDataPoint = (
    item: CombinedDataPoint,
    range: number,
    resolution: ResolutionOption,
    isSubscriptionData: boolean
): ChartDataPoint => {
    let effectiveRange = range;
    if (resolution === 'weekly' && range < 91) {
        effectiveRange = 91;
    } else if (resolution === 'monthly' && range < 365) {
        effectiveRange = 365;
    }

    const newValue = isSubscriptionData ? (item.signups || 0) : (item.paid_subscribed || 0);
    const cancelledValue = isSubscriptionData ? (item.cancellations || 0) : (item.paid_canceled || 0);

    return {
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: newValue,
        cancelled: -cancelledValue
    };
};

// Process chart data
const processChartData = (
    data: CombinedDataPoint[],
    range: number,
    resolution: ResolutionOption,
    isSubscriptionData: boolean
): ChartDataPoint[] => {
    return data.map(item => formatChartDataPoint(item, range, resolution, isSubscriptionData));
};

// Get today's data
const getTodayData = (data: Array<{date: string; [key: string]: any}>, dateKey: string) => {
    return data.find(item => item.date === moment().format('YYYY-MM-DD'));
};

// Format resolution for display
const formatResolution = (resolution: ResolutionOption): string => {
    return resolution.charAt(0).toUpperCase() + resolution.slice(1);
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

    const paidChangeChartData = useMemo(() => {
        const isSubscriptionData = subscriptionData && subscriptionData.length > 0;
        const dataSource = isSubscriptionData ? subscriptionData : memberData;

        if (!dataSource || dataSource.length === 0) {
            return [];
        }

        if (range === 1) {
            const today = moment().format('YYYY-MM-DD');
            const todayData = getTodayData(dataSource, 'date');

            if (isSubscriptionData) {
                return [{
                    date: formatDisplayDateWithRange(today, range),
                    rawDate: today,
                    new: (todayData as any)?.signups || 0,
                    cancelled: -((todayData as any)?.cancellations || 0)
                }];
            } else {
                return [{
                    date: formatDisplayDateWithRange(today, range),
                    rawDate: today,
                    new: (todayData as any)?.paid_subscribed || 0,
                    cancelled: -((todayData as any)?.paid_canceled || 0)
                }];
            }
        }

        if (isSubscriptionData) {
            const signupsData = sanitizeChartData(subscriptionData!, range, 'signups', 'sum', aggregationStrategy);
            const cancellationsData = sanitizeChartData(subscriptionData!, range, 'cancellations', 'sum', aggregationStrategy);
            const combinedData = combineAggregatedData(signupsData, cancellationsData, 'signups', 'cancellations');
            const filledData = fillMissingDataPoints(combinedData, range, aggregationStrategy);
            return processChartData(filledData, range, selectedResolution, true);
        } else {
            const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
            const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
            const combinedData = combineAggregatedData(subscribedData, canceledData, 'paid_subscribed', 'paid_canceled');
            return processChartData(combinedData, range, selectedResolution, false);
        }
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

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
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {hasData ? (
                    <div>
                        <ChartContainer className='aspect-auto h-[200px] w-full md:h-[220px] xl:h-[260px]' config={paidChangeChartConfig}>
                            <Recharts.BarChart data={paidChangeChartData} stackOffset='sign'>
                                <defs>
                                    <linearGradient id="tealGradient" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" stopColor={'var(--color-new)'} stopOpacity={0.8} />
                                        <stop offset="100%" stopColor={'var(--color-new)'} stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="roseGradient" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" stopColor={'var(--color-cancelled)'} stopOpacity={0.6} />
                                        <stop offset="100%" stopColor={'var(--color-cancelled)'} stopOpacity={0.8} />
                                    </linearGradient>
                                </defs>
                                <Recharts.CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                                <Recharts.XAxis
                                    axisLine={false}
                                    dataKey="date"
                                    tickFormatter={() => ''}
                                    tickLine={false}
                                    tickMargin={10}
                                />
                                <Recharts.YAxis
                                    axisLine={false}
                                    tickFormatter={(value) => formatNumber(value < 0 ? value * -1 : value)}
                                    tickLine={false}
                                />
                                <ChartTooltip
                                    content={<ChartTooltipContent
                                        className='!min-w-[120px] px-3 py-2'
                                        formatter={(value, name, payload, index) => {
                                            const rawValue = Number(value);
                                            const displayValue = rawValue === 0 ? '0' : formatNumber(Math.abs(rawValue));