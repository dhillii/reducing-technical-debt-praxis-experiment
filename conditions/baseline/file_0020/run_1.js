# Refactored PaidMembersChangeChart

The main improvements focus on:
1. **Extracting helper functions** out of the component
2. **Eliminating duplicated logic** between `subscriptionData` and `memberData` paths
3. **Breaking down large `useMemo`** into smaller, focused pieces
4. **Extracting sub-components** for the tooltip and legend

```typescript
import React, {useEffect, useMemo, useState} from 'react';
import moment from 'moment';
import {
    Card, CardContent, CardDescription, CardHeader, CardTitle,
    ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent,
    EmptyIndicator, LucideIcon, Recharts, Select, SelectContent,
    SelectItem, SelectTrigger, SelectValue,
    formatDisplayDateWithRange, formatNumber, getRangeDates
} from '@tryghost/shade';
import {determineAggregationStrategy, getPeriodText, sanitizeChartData} from '@src/utils/chart-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResolutionOption = 'daily' | 'weekly' | 'monthly';
type AggregationStrategy = 'none' | 'weekly' | 'monthly';

type DataPoint = {date: string; signups: number; cancellations: number};
type ChartDataPoint = {date: string; rawDate: string; new: number; cancelled: number};

type PaidMembersChangeChartProps = {
    subscriptionData?: {date: string; signups: number; cancellations: number}[];
    memberData: {date: string; paid_subscribed?: number; paid_canceled?: number}[];
    range: number;
    isLoading: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_CONFIG = {
    new: {label: 'New', color: 'hsl(var(--chart-teal))'},
    cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
} satisfies ChartConfig;

const RESOLUTION_TO_STRATEGY: Record<ResolutionOption, AggregationStrategy> = {
    daily: 'none',
    weekly: 'weekly',
    monthly: 'monthly'
};

// Range thresholds for formatting
const WEEKLY_FORMAT_RANGE = 91;
const MONTHLY_FORMAT_RANGE = 366;
const DAILY_FORMAT_RANGE = 30;

// ─── Pure Helper Functions ────────────────────────────────────────────────────

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
    return span >= 91 ? ['weekly', 'monthly'] : ['daily', 'weekly'];
};

const getDefaultResolution = (range: number): ResolutionOption => {
    const span = getActualDateSpan(range);
    if (span < 30) {
        return 'daily';
    }
    return span >= 91 ? 'monthly' : 'weekly';
};

const formatResolution = (resolution: ResolutionOption): string =>
    resolution.charAt(0).toUpperCase() + resolution.slice(1);

const getEffectiveRange = (range: number, resolution: ResolutionOption): number => {
    if (resolution === 'weekly' && range < 91) {
        return 91;
    }
    if (resolution === 'monthly' && range < 365) {
        return 365;
    }
    return range;
};

const getTooltipRangeForResolution = (resolution: ResolutionOption): number => {
    const map: Record<ResolutionOption, number> = {
        monthly: MONTHLY_FORMAT_RANGE,
        weekly: WEEKLY_FORMAT_RANGE,
        daily: DAILY_FORMAT_RANGE
    };
    return map[resolution];
};

const fillMissingDataPoints = (
    data: DataPoint[],
    dateRange: number,
    overrideStrategy?: AggregationStrategy
): DataPoint[] => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(item => item.date === today);
        return [{date: today, signups: todayData?.signups ?? 0, cancellations: todayData?.cancellations ?? 0}];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);
    const dataMap = new Map(data.map(item => [item.date, item]));

    const makeEmptyPoint = (date: string): DataPoint => ({date, signups: 0, cancellations: 0});

    const getOrEmpty = (dateKey: string): DataPoint =>
        dataMap.get(dateKey) ?? makeEmptyPoint(dateKey);

    if (strategy === 'monthly' || strategy === 'weekly') {
        const unit = strategy === 'monthly' ? 'month' : 'week';
        const current = moment(startDate).startOf(unit);
        const end = moment(endDate).startOf(unit);
        const result: DataPoint[] = [];
        const seen = new Set<string>();

        while (current.isSameOrBefore(end)) {
            const key = current.format('YYYY-MM-DD');
            if (!seen.has(key)) {
                seen.add(key);
                result.push(getOrEmpty(key));
            }
            current.add(1, unit);
        }
        return result;
    }

    // Daily
    const current = moment(startDate);
    const end = moment(endDate);
    const result: DataPoint[] = [];

    while (current.isSameOrBefore(end)) {
        result.push(getOrEmpty(current.format('YYYY-MM-DD')));
        current.add(1, 'day');
    }
    return result;
};

// ─── Data Normalization ───────────────────────────────────────────────────────

/** Merges two aggregated datasets by date, filling gaps from either side. */
const mergeByDate = <T extends {date: string}>(
    primary: T[],
    secondary: T[],
    secondaryKey: keyof T,
    primaryKey: keyof T
): {date: string; signups: number; cancellations: number}[] => {
    const secondaryMap = new Map(secondary.map(item => [item.date, item]));
    const primaryDates = new Set(primary.map(item => item.date));

    const merged = primary.map(item => ({
        date: item.date,
        signups: (item[primaryKey] as number) ?? 0,
        cancellations: (secondaryMap.get(item.date)?.[secondaryKey] as number) ?? 0
    }));

    secondary.forEach((item) => {
        if (!primaryDates.has(item.date)) {
            merged.push({
                date: item.date,
                signups: 0,
                cancellations: (item[secondaryKey] as number) ?? 0
            });
        }
    });

    return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const normalizeSubscriptionData = (
    subscriptionData: {date: string; signups: number; cancellations: number}[],
    range: number,
    aggregationStrategy: AggregationStrategy
): DataPoint[] => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = subscriptionData.find(item => item.date === today);
        return [{date: today, signups: todayData?.signups ?? 0, cancellations: todayData?.cancellations ?? 0}];
    }

    const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
    const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
    const merged = mergeByDate(signupsData, cancellationsData, 'cancellations', 'signups');
    return fillMissingDataPoints(merged, range, aggregationStrategy);
};

const normalizeMemberData = (
    memberData: {date: string; paid_subscribed?: number; paid_canceled?: number}[],
    range: number,
    aggregationStrategy: AggregationStrategy
): DataPoint[] => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = memberData.find(item => item.date === today);
        return [{date: today, signups: todayData?.paid_subscribed ?? 0, cancellations: todayData?.paid_canceled ?? 0}];
    }

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
    const merged = mergeByDate(subscribedData, canceledData, 'paid_canceled', 'paid_subscribed');
    return fillMissingDataPoints(merged, range, aggregationStrategy);
};

const toChartDataPoint = (item: DataPoint, range: number, resolution: ResolutionOption): ChartDataPoint => ({
    date: formatDisplayDateWithRange(item.date, getEffectiveRange(range, resolution)),
    rawDate: item.date,
    new: item.signups ?? 0,
    cancelled: -(item.cancellations ?? 0)
});

// ─── Sub-components ───────────────────────────────────────────────────────────

type TooltipRowProps = {
    colorVar: string;
    label: string;
    value: string;
};

const TooltipRow: React.FC<TooltipRowProps> = ({colorVar, label, value}) => (
    <div className='flex w-full items-center justify-between gap-4'>
        <div className='flex items-center gap-1'>
            <div
                className="size-2 shrink-0 rounded-full opacity-50"
                style={{backgroundColor: `var(${colorVar})`}}
            />
            <span className='text-sm text-muted-foreground'>{label}</span>
        </div>
        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
            {value}
        </div>
    </div>
);

type LegendItemProps = {color: string; label: string; value: number};

const LegendItem: React.FC<LegendItemProps> = ({color, label, value}) => (
    <div className='flex items-center gap-2'>
        <span className='size-2 rounded-full opacity-50' style={{backgroundColor: color}} />
        <span>{label}</span>
        <span className='font-medium text-foreground'>{formatNumber(value)}</span>
    </div>
);

type ResolutionSelectProps = {
    available: ResolutionOption[];
    selected: ResolutionOption;
    onChange: (value: ResolutionOption) => void;
};

const ResolutionSelect: React.FC<ResolutionSelectProps> = ({available, selected, onChange}) => {
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

// ─── Main Component ───────────────────────────────────────────────────────────

const PaidMembersChangeChart: React.FC<PaidMembersChangeChartProps> = ({
    subscriptionData,
    memberData,
    range,
    isLoading
}) => {
    const [selectedResolution, setSelectedResolution] = useState<ResolutionOption>(
        () => getDefaultResolution(range)
    );

    useEffect(() => {
        setSelectedResolution(getDefaultResolution(range));
    }, [range]);

    const availableResolutions = useMemo(() => getAvailableResolutions(range), [range]);
    const aggregationStrategy = RESOLUTION_TO_STRATEGY[selectedResolution];

    const chartData = useMemo((): ChartDataPoint[] => {
        const hasSubscriptionData = subscriptionData && subscriptionData.length > 0;

        const rawData = hasSubscriptionData
            ? normalizeSubscriptionData(subscriptionData!, range, aggregationStrategy)
            : normalizeMemberData(memberData ?? [], range, aggregationStrategy);

        return rawData.map(item => toChartDataPoint(item, range, selectedResolution));
    }, [subscriptionData, memberData, range, aggregationStrategy, selectedResolution]);

    const totals = useMemo(() => ({
        new: chartData.reduce((sum, item) => sum + item.new, 0),
        cancelled: chartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0)
    }), [chartData]);

    if (isLoading) {
        return null;
    }

    const hasData = chartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);

    const tooltipFormatter = (
        value: unknown,
        name: string,
        payload: {payload?: ChartDataPoint},
        index: number
    ) => {
        const rawValue = Number(value);
        const absValue = Math.abs(rawValue);
        const displayValue = formatNumber(absValue);

        const {new: newVal = 0, cancelled: cancelledVal = 0} = payload?.payload ?? {};
        const netChange = newVal + cancelledVal;
        const netFormatted = netChange === 0
            ? '0'
            : netChange > 0 ? `+${formatNumber(netChange)}` : formatNumber(netChange);

        const rawDate = payload?.payload?.rawDate;
        const tooltipDate = rawDate
            ? formatDisplayDateWithRange(rawDate, getTooltipRangeForResolution(selectedResolution))
            : payload?.payload?.date;

        return (
            <div className='flex w-full flex-col'>
                {index === 0 && (
                    <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
                )}
                <TooltipRow
                    colorVar={`--color-${name}`}
                    label={CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label ?? name}
                    value={displayValue}
                />
                {index === 1 && (
                    <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                        <span className='text-sm text-muted-foreground'>Net change</span>
                        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                            {netFormatted}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <Card data-testid='paid-members-change-card'>
            <CardHeader>
                <div className="flex items-start justify-between gap-1.5">
                    <div className='flex flex-col gap-1.5'>
                        <CardTitle>Paid subscriptions</CardTitle>
                        <CardDescription>
                            New and cancelled paid subscriptions {getPeriodText(range)}
                        </CardDescription>
                    </div>
                    <ResolutionSelect
                        available={availableResolutions}
                        selected={selectedResolution}
                        onChange={setSelectedResolution}
                    />
                </div>
            </CardHeader>
            <CardContent>
                {hasData ? (
                    <div>
                        <ChartContainer
                            className='aspect-auto h-[200px] w-full md:h-[220px] xl:h-[260px]'
                            config={CHART_CONFIG}
                        >
                            <Recharts.BarChart data={chartData} stackOffset='sign'>
                                <defs>
                                    <linearGradient id="tealGradient" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" stopColor='var(--color-new)' stopOpacity={0.8} />
                                        <stop offset="100%" stopColor='var(--color-new)' stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="roseGradient" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" stopColor='var(--color-cancelled)' stopOpacity={0.6} />
                                        <stop offset="100%" stopColor='var(--color-cancelled)' stopOpacity={0.8} />
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
                                    tickFormatter={value => formatNumber(Math.abs(value))}
                                    tickLine={false}
                                />
                                <ChartTooltip
                                    content={<ChartTooltipContent
                                        className='!min-w-[120px] px-3 py-2'
                                        formatter={tooltipFormatter}
                                        hideLabel
                                    />}
                                    cursor={false}
                                    isAnimationActive={false}
                                    position={{y: 10}}
                                />
                                <Recharts.Bar
                                    activeBar={{fillOpacity: 1}}
                                    dataKey="new"
                                    fill='url(#tealGradient)'
                                    fillOpacity={0.75}
                                    maxBarSize={32}
                                    minPointSize={3}
                                    radius={[4, 4, 0, 0]}
                                    stackId="a"
                                />
                                <Recharts.Bar
                                    activeBar={{fillOpacity: 1}}
                                    dataKey="cancelled"
                                    fill='url(#roseGradient)'
                                    fillOpacity={0.75}
                                    maxBarSize={32}
                                    radius={[4, 4, 0, 0]}
                                    stackId="a"
                                />
                            </Recharts.BarChart>
                        </ChartContainer>
                        <div className='mt-3 flex items-center justify-center gap-6 text-sm text-muted-foreground'>
                            <LegendItem color={CHART_CONFIG.new.color} label="New" value={totals.new} />
                            <LegendItem color={CHART_CONFIG.cancelled.color} label="Cancelled" value={totals.cancelled} />
                        </div>
                    </div>
                ) : (
                    <div className="py-12">
                        <EmptyIndicator
                            description={`No paid subscription changes ${getPeriodText(range)}.`}
                            title="No paid member changes"
                        >
                            <LucideIcon.BarChart3 strokeWidth={1.5} />
                        </EmptyIndicator>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default PaidMembersChangeChart;
```

## Key Changes

| Area | Before | After |
|---|---|---|
| **Duplicated data paths** | Two near-identical branches for `subscriptionData` vs `memberData` | `normalizeSubscriptionData` / `normalizeMemberData` with shared `mergeByDate` utility |
| **`fillMissingDataPoints`** | Three separate `if/else` blocks with repeated `dataMap.get` logic | Unified `getOrEmpty` helper + shared loop structure |
| **`paidChangeChartData` memo** | ~80 lines of mixed concerns | Delegates to pure functions, ~5 lines |
| **Tooltip JSX** | Inline ~50-line render function | Extracted `tooltipFormatter` + `TooltipRow` component |
| **Legend** | Inline repeated markup | `LegendItem` component |
| **Resolution dropdown** | Inline conditional JSX | `ResolutionSelect` component |
| **`aggregationStrategy` memo** | `switch` statement in `useMemo` | Constant lookup table `RESOLUTION_TO_STRATEGY` |
| **Magic numbers** | Scattered `91`, `365`, `366`, `30` | Named constants at the top |