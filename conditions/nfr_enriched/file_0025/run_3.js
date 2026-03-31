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

const RESOLUTION_TO_RANGE_THRESHOLD: Record<ResolutionOption, number> = {
    daily: 30,
    weekly: 91,
    monthly: 366
};

const PAID_CHANGE_CHART_CONFIG = {
    new: {label: 'New', color: 'hsl(var(--chart-teal))'},
    cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
} satisfies ChartConfig;

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

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

const capitalise = (str: string): string => str.charAt(0).toUpperCase() + str.slice(1);

// ─── Data Filling ─────────────────────────────────────────────────────────────

const buildEmptyPoint = (date: string): SubscriptionDataPoint => ({date, signups: 0, cancellations: 0});

const iteratePeriods = (
    startDate: string,
    endDate: string,
    unit: 'day' | 'week' | 'month',
    dataMap: Map<string, SubscriptionDataPoint>
): SubscriptionDataPoint[] => {
    const result: SubscriptionDataPoint[] = [];
    const seen = new Set<string>();
    const current = unit === 'day' ? moment(startDate) : moment(startDate).startOf(unit);
    const end = unit === 'day' ? moment(endDate) : moment(endDate).startOf(unit);

    while (current.isSameOrBefore(end)) {
        const key = current.format('YYYY-MM-DD');
        if (!seen.has(key)) {
            seen.add(key);
            result.push(dataMap.get(key) ?? buildEmptyPoint(key));
        }
        current.add(1, unit);
    }
    return result;
};

const fillMissingDataPoints = (
    data: SubscriptionDataPoint[],
    dateRange: number,
    overrideStrategy?: AggregationStrategy
): SubscriptionDataPoint[] => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        return [data.find(item => item.date === today) ?? buildEmptyPoint(today)];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);
    const dataMap = new Map(data.map(item => [item.date, item]));

    const unitMap: Record<string, 'day' | 'week' | 'month'> = {
        monthly: 'month',
        weekly: 'week',
        none: 'day'
    };

    return iteratePeriods(startDate, endDate, unitMap[strategy] ?? 'day', dataMap);
};

// ─── Chart Data Builders ──────────────────────────────────────────────────────

const mergeByDate = <T extends {date: string}>(
    primary: T[],
    secondary: T[],
    buildMerged: (primary: T, secondary: T | undefined) => SubscriptionDataPoint
): SubscriptionDataPoint[] => {
    const secondaryMap = new Map(secondary.map(item => [item.date, item]));
    const merged = primary.map(item => buildMerged(item, secondaryMap.get(item.date)));

    const primaryDates = new Set(primary.map(item => item.date));
    secondary.forEach((item) => {
        if (!primaryDates.has(item.date)) {
            merged.push(buildMerged(item as unknown as T, item));
        }
    });

    return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const toChartPoint = (
    item: SubscriptionDataPoint,
    range: number,
    resolution: ResolutionOption
): ChartDataPoint => ({
    date: formatDisplayDateWithRange(item.date, getEffectiveRange(range, resolution)),
    rawDate: item.date,
    new: item.signups,
    cancelled: -item.cancellations
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
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayData?.signups ?? 0,
            cancelled: -(todayData?.cancellations ?? 0)
        }];
    }

    const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
    const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);

    const combined = mergeByDate(signupsData, cancellationsData, (primary, secondary) => ({
        date: primary.date,
        signups: primary.signups ?? 0,
        cancellations: (secondary as SubscriptionDataPoint | undefined)?.cancellations ?? 0
    }));

    return fillMissingDataPoints(combined, range, aggregationStrategy)
        .map(item => toChartPoint(item, range, resolution));
};

const buildFromMemberData = (
    memberData: MemberDataPoint[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    resolution: ResolutionOption
): ChartDataPoint[] => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = memberData.find(item => item.date === today);
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayData?.paid_subscribed ?? 0,
            cancelled: -(todayData?.paid_canceled ?? 0)
        }];
    }

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);

    const combined = mergeByDate(subscribedData, canceledData, (primary, secondary) => ({
        date: primary.date,
        signups: primary.paid_subscribed ?? 0,
        cancellations: (secondary as MemberDataPoint | undefined)?.paid_canceled ?? 0
    }));

    return combined.map(item => toChartPoint(item, range, resolution));
};

// ─── Sub-components ───────────────────────────────────────────────────────────

type ResolutionSelectProps = {
    availableResolutions: ResolutionOption[];
    selectedResolution: ResolutionOption;
    onChange: (value: ResolutionOption) => void;
};

const ResolutionSelect: React.FC<ResolutionSelectProps> = ({availableResolutions, selectedResolution, onChange}) => {
    if (availableResolutions.length <= 1) {
        return null;
    }
    return (
        <Select value={selectedResolution} onValueChange={value => onChange(value as ResolutionOption)}>
            <SelectTrigger className="w-[110px]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent align='end'>
                {availableResolutions.map(resolution => (
                    <SelectItem key={resolution} value={resolution}>
                        {capitalise(resolution)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

type ChartLegendProps = {
    totals: {new: number; cancelled: number};
};

const ChartLegend: React.FC<ChartLegendProps> = ({totals}) => (
    <div className='mt-3 flex items-center justify-center gap-6 text-sm text-muted-foreground'>
        {(['new', 'cancelled'] as const).map(key => (
            <div key={key} className='flex items-center gap-2'>
                <span
                    className='size-2 rounded-full opacity-50'
                    style={{backgroundColor: PAID_CHANGE_CHART_CONFIG[key].color}}
                />
                <span>{PAID_CHANGE_CHART_CONFIG[key].label}</span>
                <span className='font-medium text-foreground'>{formatNumber(totals[key])}</span>
            </div>
        ))}
    </div>
);

type TooltipFormatterProps = {
    value: unknown;
    name: string;
    payload: {payload?: ChartDataPoint};
    index: number;
    selectedResolution: ResolutionOption;
};

const formatTooltipDate = (rawDate: string, resolution: ResolutionOption): string =>
    formatDisplayDateWithRange(rawDate, RESOLUTION_TO_RANGE_THRESHOLD[resolution]);

const TooltipRow: React.FC<{name: string; displayValue: string}> = ({name, displayValue}) => (
    <div className='flex w-full items-center justify-between gap-4'>
        <div className='flex items-center gap-1'>
            <div
                className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                style={{'--color-bg': `var(--color-${name})`} as React.CSSProperties}
            />
            <span className='text-sm text-muted-foreground'>
                {PAID_CHANGE_CHART_CONFIG[name as keyof typeof PAID_CHANGE_CHART_CONFIG]?.label ?? name}
            </span>
        </div>
        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
            {displayValue}
        </div>
    </div>
);

const renderTooltipContent = (selectedResolution: ResolutionOption) =>
    (value: unknown, name: string, payload: {payload?: ChartDataPoint}, index: number) => {
        const rawValue = Number(value);
        const displayValue = rawValue === 0 ? '0' : formatNumber(Math.abs(rawValue));

        const pointData = payload?.payload;
        const newValue = Number(pointData?.new ?? 0);
        const cancelledValue = Number(pointData?.cancelled ?? 0);
        const netChange = newValue + cancelledValue;
        const netChangeFormatted = netChange === 0
            ? '0'
            : netChange > 0
                ? `+${formatNumber(netChange)}`
                : formatNumber(netChange);

        const tooltipDate = pointData?.rawDate
            ? formatTooltipDate(pointData.rawDate, selectedResolution)
            : pointData?.date;

        return (
            <div className='flex w-full flex-col'>
                {index === 0 && (
                    <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
                )}
                <TooltipRow displayValue={displayValue} name={name} />
                {index === 1 && (
                    <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                        <span className='text-sm text-muted-foreground'>Net change</span>
                        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                            {netChangeFormatted}
                        </div>
                    </div>
                )}
            </div>
        );
    };

type BarChartProps = {
    data: ChartDataPoint[];
    selectedResolution: ResolutionOption;
};

const PaidMembersBarChart: React.FC<BarChartProps> = ({data, selectedResolution}) => (
    <ChartContainer className='aspect-auto h-[200px] w-full md:h-[220px] xl:h-[260px]' config={PAID_CHANGE_CHART_CONFIG}>
        <Recharts.BarChart data={data} stackOffset='sign'>
            <defs>
                <linearGradient id="tealGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor='var(--color-new)' stopOpacity={0.8} />
                    <stop offset="100%" stopColor='var(--color-new)' stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="roseGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor='var(--color-cancelled)' stopOpacity={0.6} />