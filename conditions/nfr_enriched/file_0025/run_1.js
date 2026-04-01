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

// Helper function to fill missing data points with zeros
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

    if (strategy === 'monthly') {
        fillMonthlyPeriods(startDate, endDate, dataMap, seenKeys, filledData);
    } else if (strategy === 'weekly') {
        fillWeeklyPeriods(startDate, endDate, dataMap, seenKeys, filledData);
    } else {
        fillDailyPeriods(startDate, endDate, dataMap, filledData);
    }

    return filledData;
};

// Fill monthly period data points
const fillMonthlyPeriods = (
    startDate: string,
    endDate: string,
    dataMap: Map<string, {date: string; signups: number; cancellations: number}>,
    seenKeys: Set<string>,
    filledData: {date: string; signups: number; cancellations: number}[]
) => {
    const currentPeriod = moment(startDate).startOf('month');
    const endPeriod = moment(endDate).startOf('month');

    while (currentPeriod.isSameOrBefore(endPeriod)) {
        const dateKey = currentPeriod.format('YYYY-MM-DD');
        if (!seenKeys.has(dateKey)) {
            seenKeys.add(dateKey);
            const existingData = dataMap.get(dateKey);
            filledData.push(existingData || {
                date: dateKey,
                signups: 0,
                cancellations: 0
            });
        }
        currentPeriod.add(1, 'month');
    }
};

// Fill weekly period data points
const fillWeeklyPeriods = (
    startDate: string,
    endDate: string,
    dataMap: Map<string, {date: string; signups: number; cancellations: number}>,
    seenKeys: Set<string>,
    filledData: {date: string; signups: number; cancellations: number}[]
) => {
    const currentPeriod = moment(startDate).startOf('week');
    const endPeriod = moment(endDate).startOf('week');

    while (currentPeriod.isSameOrBefore(endPeriod)) {
        const dateKey = currentPeriod.format('YYYY-MM-DD');
        if (!seenKeys.has(dateKey)) {
            seenKeys.add(dateKey);
            const existingData = dataMap.get(dateKey);
            filledData.push(existingData || {
                date: dateKey,
                signups: 0,
                cancellations: 0
            });
        }
        currentPeriod.add(1, 'week');
    }
};

// Fill daily period data points
const fillDailyPeriods = (
    startDate: string,
    endDate: string,
    dataMap: Map<string, {date: string; signups: number; cancellations: number}>,
    filledData: {date: string; signups: number; cancellations: number}[]
) => {
    const currentDate = moment(startDate);
    const endMoment = moment(endDate);

    while (currentDate.isSameOrBefore(endMoment)) {
        const dateKey = currentDate.format('YYYY-MM-DD');
        const existingData = dataMap.get(dateKey);
        filledData.push(existingData || {
            date: dateKey,
            signups: 0,
            cancellations: 0
        });
        currentDate.add(1, 'day');
    }
};

// Calculate actual date span for YTD ranges
const getActualDateSpan = (range: number): number => {
    if (range === -1) {
        const {startDate, endDate} = getRangeDates(range);
        return moment(endDate).diff(moment(startDate), 'days');
    }
    return range;
};

// Determine available resolutions based on range
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

// Get default resolution for a range
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
const getAggregationStrategy = (resolution: ResolutionOption): 'none' | 'weekly' | 'monthly' => {
    switch (resolution) {
    case 'daily':
        return 'none';
    case 'weekly':
        return 'weekly';
    case 'monthly':
        return 'monthly';
    }
};

// Combine subscription data from multiple sources
const combineSubscriptionData = (
    signupsData: {date: string; signups?: number}[],
    cancellationsData: {date: string; cancellations?: number}[]
): {date: string; signups: number; cancellations: number}[] => {
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

// Format chart data point with proper date formatting
const formatChartDataPoint = (
    item: {date: string; signups: number; cancellations: number},
    range: number,
    selectedResolution: ResolutionOption
): ChartDataPoint => {
    let effectiveRange = range;
    if (selectedResolution === 'weekly' && range < 91) {
        effectiveRange = 91;
    } else if (selectedResolution === 'monthly' && range < 365) {
        effectiveRange = 365;
    }

    return {
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item.signups || 0,
        cancelled: -(item.cancellations || 0)
    };
};

// Process subscription data into chart format
const processSubscriptionData = (
    subscriptionData: {date: string; signups: number; cancellations: number}[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    selectedResolution: ResolutionOption
): ChartDataPoint[] => {
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

    return filledData.map(item => formatChartDataPoint(item, range, selectedResolution));
};

// Process member data into chart format
const processMemberData = (
    memberData: {date: string; paid_subscribed?: number; paid_canceled?: number}[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    selectedResolution: ResolutionOption
): ChartDataPoint[] => {
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

    const canceledMap = new Map(canceledData.map(c => [c.date, c]));
    const combinedData = subscribedData.map(item => ({
        date: item.date,
        signups: item.paid_subscribed || 0,
        cancellations: canceledMap.get(item.date)?.paid_canceled || 0
    }));

    const combinedDatesSet = new Set(combinedData.map(item => item.date));
    canceledData.forEach((cancelItem) => {
        if (!combinedDatesSet.has(cancelItem.date)) {
            combinedData.push({
                date: cancelItem.date,
                signups: 0,
                cancellations: cancelItem.paid_canceled || 0
            });
        }
    });

    combinedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return combinedData.map(item => formatChartDataPoint(item, range, selectedResolution));
};

// Format resolution for display
const formatResolution = (resolution: ResolutionOption): string => {
    return resolution.charAt(0).toUpperCase() + resolution.slice(1);
};

// Render chart tooltip content
const renderTooltipContent = (
    value: number,
    name: string,
    payload: any,
    index: number,
    selectedResolution: ResolutionOption,
    paidChangeChartConfig: ChartConfig
) => {
    const rawValue = Number(value);
    const displayValue = rawValue === 0 ? '0' : (rawValue < 0 ? formatNumber(rawValue * -1) : formatNumber(rawValue));

    const newValue = Number(payload?.payload?.new || 0);
    const cancelledValue = Number(payload?.payload?.cancelled || 0);
    const netChange = newValue + cancelledValue;
    const netChangeFormatted = netChange === 0 ? '0' : (netChange > 0 ? `+${formatNumber(netChange)}` : formatNumber(netChange));

    let tooltipDate = payload?.payload?.date;
    if (payload?.payload?.rawDate) {
        if (selectedResolution === 'monthly') {
            tooltipDate = formatDisplayDateWithRange(payload.payload.rawDate, 366);
        } else if (selectedResolution === 'weekly') {
            tooltipDate = formatDisplayDateWithRange(payload.payload.rawDate, 91);
        } else {
            tooltipDate = formatDisplayDateWithRange(payload.payload.rawDate, 30);
        }
    }

    return (
        <div className='flex w-full flex-col'>
            {index === 0 &&
                <div className="mb-1 text-sm font-medium text-foreground">
                    {tooltipDate}
                </div>
            }
            <div className='flex w-full items-center justify-between gap-4'>
                <div className='flex items-center gap-1'>
                    <div
                        className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                        style={{
                            '--color-bg': `var(--color-${name})`
                        } as React.CSSProperties}
                    />
                    <span className='text-sm text-muted-foreground'>
                        {paidChangeChartConfig[name as keyof typeof paidChangeChartConfig]?.label || name}
                    </span>
                </div>
                <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                    {displayValue}
                </div>
            </div>
            {index === 1 &&
                <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                    <span className='text-sm text-muted-foreground'>
                        Net change
                    </span>
                    <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                        {netChangeFormatted}
                    </div>
                </div>
            }
        </div>
    );
};

const PaidMembersChangeChart: React.FC<PaidMembersChangeChartProps> = ({
    subscriptionData,
    memberData,
    range,
    isLoading
}) => {
    const [selectedRes