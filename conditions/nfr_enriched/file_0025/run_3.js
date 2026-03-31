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

// ============================================================================
// Date and Resolution Helpers
// ============================================================================

const getActualDateSpan = (range: number): number => {
    if (range === -1) {
        const {startDate, endDate} = getRangeDates(range);
        return moment(endDate).diff(moment(startDate), 'days');
    }
    return range;
};

const getAvailableResolutions = (range: number): ResolutionOption[] => {
    const actualSpan = getActualDateSpan(range);
    if (actualSpan < 30) return ['daily'];
    if (actualSpan >= 91) return ['weekly', 'monthly'];
    return ['daily', 'weekly'];
};

const getDefaultResolution = (range: number): ResolutionOption => {
    const actualSpan = getActualDateSpan(range);
    if (actualSpan < 30) return 'daily';
    if (actualSpan >= 91) return 'monthly';
    return 'weekly';
};

const getAggregationStrategy = (resolution: ResolutionOption) => {
    const strategyMap: Record<ResolutionOption, 'none' | 'weekly' | 'monthly'> = {
        daily: 'none',
        weekly: 'weekly',
        monthly: 'monthly'
    };
    return strategyMap[resolution];
};

const formatResolution = (resolution: ResolutionOption): string => {
    return resolution.charAt(0).toUpperCase() + resolution.slice(1);
};

// ============================================================================
// Data Processing Helpers
// ============================================================================

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

    const createEmptyDataPoint = (date: string): CombinedDataPoint => ({
        date,
        signups: 0,
        cancellations: 0,
        paid_subscribed: 0,
        paid_canceled: 0
    });

    const addDataPoint = (dateKey: string) => {
        if (!seenKeys.has(dateKey)) {
            seenKeys.add(dateKey);
            filledData.push(dataMap.get(dateKey) || createEmptyDataPoint(dateKey));
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

const combineAggregatedData = (
    primaryData: Array<{date: string; [key: string]: any}>,
    secondaryData: Array<{date: string; [key: string]: any}>,
    primaryKey: string,
    secondaryKey: string
): CombinedDataPoint[] => {
    const secondaryMap = new Map(secondaryData.map(item => [item.date, item]));
    const combined = primaryData.map(item => ({
        date: item.date,
        [primaryKey]: item[primaryKey] || 0,
        [secondaryKey]: secondaryMap.get(item.date)?.[secondaryKey] || 0
    }));

    const combinedDatesSet = new Set(combined.map(item => item.date));
    secondaryData.forEach(item => {
        if (!combinedDatesSet.has(item.date)) {
            combined.push({
                date: item.date,
                [primaryKey]: 0,
                [secondaryKey]: item[secondaryKey] || 0
            });
        }
    });

    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return combined as CombinedDataPoint[];
};

const getTodayData = (data: any[], range: number, newKey: string, cancelledKey: string): ChartDataPoint[] => {
    const today = moment().format('YYYY-MM-DD');
    const todayData = data.find(item => item.date === today);
    return [{
        date: formatDisplayDateWithRange(today, range),
        rawDate: today,
        new: todayData?.[newKey] || 0,
        cancelled: -(todayData?.[cancelledKey] || 0)
    }];
};

const getEffectiveRange = (range: number, resolution: ResolutionOption): number => {
    if (resolution === 'weekly' && range < 91) return 91;
    if (resolution === 'monthly' && range < 365) return 365;
    return range;
};

const transformToChartData = (
    combinedData: CombinedDataPoint[],
    range: number,
    resolution: ResolutionOption,
    newKey: string,
    cancelledKey: string
): ChartDataPoint[] => {
    const effectiveRange = getEffectiveRange(range, resolution);
    return combinedData.map(item => ({
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item[newKey] || 0,
        cancelled: -(item[cancelledKey] || 0)
    }));
};

// ============================================================================
// Data Fetching Logic
// ============================================================================

const processSubscriptionData = (
    subscriptionData: {date: string; signups: number; cancellations: number}[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    selectedResolution: ResolutionOption
): ChartDataPoint[] => {
    if (range === 1) {
        return getTodayData(subscriptionData, range, 'signups', 'cancellations');
    }

    const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
    const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);

    const combined = combineAggregatedData(signupsData, cancellationsData, 'signups', 'cancellations');
    const filledData = fillMissingDataPoints(combined, range, aggregationStrategy);

    return transformToChartData(filledData, range, selectedResolution, 'signups', 'cancellations');
};

const processMemberData = (
    memberData: {date: string; paid_subscribed?: number; paid_canceled?: number}[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    selectedResolution: ResolutionOption
): ChartDataPoint[] => {
    if (range === 1) {
        return getTodayData(memberData, range, 'paid_subscribed', 'paid_canceled');
    }

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);

    const combined = combineAggregatedData(subscribedData, canceledData, 'paid_subscribed', 'paid_canceled');
    const filledData = fillMissingDataPoints(combined, range, aggregationStrategy);

    return transformToChartData(filledData, range, selectedResolution, 'paid_subscribed', 'paid_canceled');
};

// ============================================================================
// Chart Configuration
// ============================================================================

const CHART_CONFIG = {
    new: {
        label: 'New',
        color: 'hsl(var(--chart-teal))'
    },
    cancelled: {
        label: 'Cancelled',
        color: 'hsl(var(--chart-rose))'
    }
} satisfies ChartConfig;

// ============================================================================
// Tooltip Component
// ============================================================================

interface ChartTooltipProps {
    value: number;
    name: string;
    payload?: {payload: ChartDataPoint};
    index?: number;
    selectedResolution: ResolutionOption;
}

const ChartTooltipFormatter = ({
    value,
    name,
    payload,
    index,
    selectedResolution
}: ChartTooltipProps) => {
    const rawValue = Number(value);
    const displayValue = rawValue === 0 ? '0' : (rawValue < 0 ? formatNumber(rawValue * -1) : formatNumber(rawValue));

    const newValue = Number(payload?.payload?.new || 0);
    const cancelledValue = Number(payload?.payload?.cancelled || 0);
    const netChange = newValue + cancelledValue;
    const netChangeFormatted = netChange === 0 ? '0' : (netChange > 0 ? `+${formatNumber(netChange)}` : formatNumber(netChange));

    let tooltipDate = payload?.payload?.date;
    if (payload?.payload?.rawDate) {
        const dateRangeMap: Record<ResolutionOption, number> = {
            monthly: 366,
            weekly: 91,
            daily: 30
        };
        tooltipDate = formatDisplayDateWithRange(payload.payload.rawDate, dateRangeMap[selectedResolution]);
    }

    return (
        <div className='flex w-full flex-col'>
            {index === 0 && (
                <div className="mb-1 text-sm font-medium text-foreground">
                    {tooltipDate}
                </div>
            )}
            <div className='flex w-full items-center justify-between gap-4'>
                <div className='flex items-center gap-1'>
                    <div
                        className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                        style={{
                            '--color-bg': `var(--color-${name})`
                        } as React.CSSProperties}
                    />
                    <span className='text-sm text-muted-foreground'>
                        {CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label || name}
                    </span>
                </div>
                <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                    {displayValue}
                </div>
            </div>
            {index === 1 && (
                <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                    <span className='text-sm text-muted-foreground'>
                        Net change
                    </span>
                    <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                        {netChangeFormatted}
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

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
        if (subscriptionData && subscriptionData.length > 0) {
            return processSubscriptionData(subscriptionData, range, aggregationStrategy, selectedResolution);
        }

        if (!memberData || memberData.length === 0) {
            return [];
        }

        return processMemberData(memberData, range, aggregationStrategy, selectedResolution);
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

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
                <div className="flex items-start justify-between gap-1.5