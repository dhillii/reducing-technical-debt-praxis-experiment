```typescript
import React, {useEffect, useMemo, useState} from 'react';
import moment from 'moment';
import {Card, CardContent, CardDescription, CardHeader, CardTitle, ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, EmptyIndicator, LucideIcon, Recharts, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, formatDisplayDateWithRange, formatNumber, getRangeDates} from '@tryghost/shade';
import {determineAggregationStrategy, getPeriodText, sanitizeChartData} from '@src/utils/chart-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResolutionOption = 'daily' | 'weekly' | 'monthly';
type AggregationStrategy = 'none' | 'weekly' | 'monthly';

type SubscriptionDataPoint = {date: string; signups: number; cancellations: number};
type MemberDataPoint = {date: string; paid_subscribed?: number; paid_canceled?: number};
type ChartDataPoint = {date: string; rawDate: string; new: number; cancelled: number};

type PaidMembersChangeChartProps = {
    subscriptionData?: SubscriptionDataPoint[];
    memberData: MemberDataPoint[];
    range: number;
    isLoading: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RESOLUTION_TO_STRATEGY: Record<ResolutionOption, AggregationStrategy> = {
    daily: 'none',
    weekly: 'weekly',
    monthly: 'monthly'
};

const RESOLUTION_TO_RANGE_OVERRIDE: Record<ResolutionOption, number> = {
    daily: 30,
    weekly: 91,
    monthly: 366
};

const PAID_CHANGE_CHART_CONFIG = {
    new: {label: 'New', color: 'hsl(var(--chart-teal))'},
    cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
} satisfies ChartConfig;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const getActualDateSpan = (range: number): number => {
    if (range !== -1) {
        return range;
    }
    const {startDate, endDate} = getRangeDates(range);
    return moment(endDate).diff(moment(startDate), 'days');
};

const getAvailableResolutions = (range: number): ResolutionOption[] => {
    const span = getActualDateSpan(range);
    if (span < 30) {
        return ['daily'];
    }
    if (span >= 91) {
        return ['weekly', 'monthly'];
    }
    return ['daily', 'weekly'];
};

const getDefaultResolution = (range: number): ResolutionOption => {
    const span = getActualDateSpan(range);
    if (span < 30) {
        return 'daily';
    }
    if (span >= 91) {
        return 'monthly';
    }
    return 'weekly';
};

const getEffectiveRange = (range: number, resolution: ResolutionOption): number => {
    if (resolution === 'weekly' && range < 91) {
        return 91;
    }
    if (resolution === 'monthly' && range < 365) {
        return 365;
    }
    return range;
};

const formatResolution = (resolution: ResolutionOption): string =>
    resolution.charAt(0).toUpperCase() + resolution.slice(1);

// ─── Data filling ─────────────────────────────────────────────────────────────

const createEmptyPoint = (date: string): SubscriptionDataPoint => ({date, signups: 0, cancellations: 0});

const fillPeriodBoundaries = (
    dataMap: Map<string, SubscriptionDataPoint>,
    startDate: string,
    endDate: string,
    unit: 'month' | 'week' | 'day'
): SubscriptionDataPoint[] => {
    const filled: SubscriptionDataPoint[] = [];
    const current = moment(startDate).startOf(unit);
    const end = moment(endDate).startOf(unit);
    const seen = new Set<string>();

    while (current.isSameOrBefore(end)) {
        const key = current.format('YYYY-MM-DD');
        if (!seen.has(key)) {
            seen.add(key);
            filled.push(dataMap.get(key) ?? createEmptyPoint(key));
        }
        current.add(1, unit);
    }

    return filled;
};

const fillMissingDataPoints = (
    data: SubscriptionDataPoint[],
    dateRange: number,
    overrideStrategy?: AggregationStrategy
): SubscriptionDataPoint[] => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(item => item.date === today);
        return [todayData ?? createEmptyPoint(today)];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);
    const dataMap = new Map(data.map(item => [item.date, item]));

    if (strategy === 'monthly') {
        return fillPeriodBoundaries(dataMap, startDate, endDate, 'month');
    }
    if (strategy === 'weekly') {
        return fillPeriodBoundaries(dataMap, startDate, endDate, 'week');
    }

    // Daily
    const filled: SubscriptionDataPoint[] = [];
    const current = moment(startDate);
    const end = moment(endDate);
    while (current.isSameOrBefore(end)) {
        const key = current.format('YYYY-MM-DD');
        filled.push(dataMap.get(key) ?? createEmptyPoint(key));
        current.add(1, 'day');
    }
    return filled;
};

// ─── Chart data builders ──────────────────────────────────────────────────────

const mergeDateSeries = <T extends {date: string}>(
    primary: T[],
    secondary: T[],
    mergeRow: (primaryItem: T, secondaryItem: T | undefined) => SubscriptionDataPoint
): SubscriptionDataPoint[] => {
    const secondaryMap = new Map(secondary.map(item => [item.date, item]));
    const merged = primary.map(item => mergeRow(item, secondaryMap.get(item.date)));

    const primaryDates = new Set(primary.map(item => item.date));
    secondary.forEach((item) => {
        if (!primaryDates.has(item.date)) {
            merged.push(mergeRow(item as unknown as T, undefined));
        }
    });

    merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return merged;
};

const toChartPoint = (
    item: SubscriptionDataPoint,
    range: number,
    resolution: ResolutionOption
): ChartDataPoint => ({
    date: formatDisplayDateWithRange(item.date, getEffectiveRange(range, resolution)),
    rawDate: item.date,
    new: item.signups,
    cancelled: -(item.cancellations)
});

const buildTodayChartPoint = (
    date: string,
    signups: number,
    cancellations: number,
    range: number
): ChartDataPoint => ({
    date: formatDisplayDateWithRange(date, range),
    rawDate: date,
    new: signups,
    cancelled: -cancellations
});

const buildFromSubscriptionData = (
    subscriptionData: SubscriptionDataPoint[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    resolution: ResolutionOption
): ChartDataPoint[] => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = subscriptionData.find(item => item.date === today);
        return [buildTodayChartPoint(today, todayData?.signups ?? 0, todayData?.cancellations ?? 0, range)];
    }

    const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
    const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);

    const combined = mergeDateSeries(signupsData, cancellationsData, (primary, secondary) => ({
        date: primary.date,
        signups: primary.signups ?? 0,
        cancellations: secondary?.cancellations ?? 0
    }));

    const filled = fillMissingDataPoints(combined, range, aggregationStrategy);
    return filled.map(item => toChartPoint(item, range, resolution));
};

const buildFromMemberData = (
    memberData: MemberDataPoint[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    resolution: ResolutionOption
): ChartDataPoint[] => {
    if (!memberData.length) {
        return [];
    }

    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = memberData.find(item => item.date === today);
        return [buildTodayChartPoint(today, todayData?.paid_subscribed ?? 0, todayData?.paid_canceled ?? 0, range)];
    }

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);

    const combined = mergeDateSeries(subscribedData, canceledData, (primary, secondary) => ({
        date: primary.date,
        signups: primary.paid_subscribed ?? 0,
        cancellations: secondary?.paid_canceled ?? 0
    }));

    return combined.map(item => toChartPoint(item, range, resolution));
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const ResolutionSelect: React.FC<{
    available: ResolutionOption[];
    selected: ResolutionOption;
    onChange: (value: ResolutionOption) => void;
}> = ({available, selected, onChange}) => {
    if (available.length <= 1) {
        return null;
    }
    return (
        <Select value={selected} onValueChange={value => onChange(value as ResolutionOption)}>
            <SelectTrigger className="w-[110px]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent align='end'>
                {available.map(resolution => (
                    <SelectItem key={resolution} value={resolution}>
                        {formatResolution(resolution)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

const LegendItem: React.FC<{color: string; label: string; value: number}> = ({color, label, value}) => (
    <div className='flex items-center gap-2'>
        <span className='size-2 rounded-full opacity-50' style={{backgroundColor: color}} />
        <span>{label}</span>
        <span className='font-medium text-foreground'>{formatNumber(value)}</span>
    </div>
);

const TooltipRow: React.FC<{
    colorVar: string;
    label: string;
    value: string;
}> = ({colorVar, label, value}) => (
    <div className='flex w-full items-center justify-between gap-4'>
        <div className='flex items-center gap-1'>
            <div
                className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                style={{'--color-bg': colorVar} as React.CSSProperties}
            />
            <span className='text-sm text-muted-foreground'>{label}</span>
        </div>
        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
            {value}
        </div>
    </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

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
    const aggregationStrategy = RESOLUTION_TO_STRATEGY[selectedResolution];

    const chartData = useMemo<ChartDataPoint[]>(() => {
        if (subscriptionData && subscriptionData.length > 0) {
            return buildFromSubscriptionData(subscriptionData, range, aggregationStrategy, selectedResolution);
        }
        return buildFromMemberData(memberData, range, aggregationStrategy, selectedResolution);
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const totals = useMemo(() => ({
        new: chartData.reduce((sum, item) => sum + item.new, 0),
        cancelled: chartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0)
    }), [chartData]);

    if (isLoading) {
        return null;
    }

    const hasData = chartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);

    const renderTooltipContent = (value: unknown, name: unknown, payload: unknown, index: number) => {
        const rawValue = Number(value);
        const displayValue = rawValue === 0 ? '0' : formatNumber(Math.abs(rawValue));

        const payloadData = (payload as {payload?: ChartDataPoint})?.payload;
        const newValue = Number(payloadData?.new ?? 0);
        const cancelledValue = Number(payloadData?.cancelled ?? 0);
        const netChange = newValue + cancelledValue;
        const netChangeFormatted = netChange === 0 ? '0' : (netChange > 0 ? `+${formatNumber(netChange)}` : formatNumber(netChange));

        const rawDate = payloadData?.rawDate;
        const tooltipDate = rawDate
            ? formatDisplayDateWithRange(rawDate, RESOLUTION_TO_RANGE_OVERRIDE[selectedResolution])
            : payloadData?.date;

        const nameStr = String(name);
        const configEntry = PAID_CHANGE_CHART_CONFIG[nameStr as keyof typeof PAID_CHANGE_CHART_CONFIG];

        return (
            <div className='flex w-full flex-col'>
                {index === 0 && (
                    <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
                )}
                <TooltipRow
                    colorVar={`var(--color-${nameStr})`}
                    label={configEntry?.label ?? nameStr}
                    value={displayValue}
                />
                {index === 1 && (
                    <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                        <span className='text-sm text-muted-foreground'>Net change</span>
                        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-