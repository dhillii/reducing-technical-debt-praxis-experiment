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
    const getOrEmpty = (dateKey: string): DataPoint => dataMap.get(dateKey) ?? makeEmptyPoint(dateKey);

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

/** Merges two aggregated datasets by date, filling gaps with zeros */
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
        signups: Number(item[primaryKey] ?? 0),
        cancellations: Number(secondaryMap.get(item.date)?.[secondaryKey] ?? 0)
    }));

    secondary.forEach((item) => {
        if (!primaryDates.has(item.date)) {
            merged.push({
                date: item.date,
                signups: 0,
                cancellations: Number(item[secondaryKey] ?? 0)
            });
        }
    });

    return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const buildChartDataFromSubscriptions = (
    subscriptionData: {date: string; signups: number; cancellations: number}[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    selectedResolution: ResolutionOption
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
    const combined = mergeByDate(signupsData, cancellationsData, 'cancellations', 'signups');
    const filled = fillMissingDataPoints(combined, range, aggregationStrategy);

    return toChartDataPoints(filled, range, selectedResolution);
};

const buildChartDataFromMemberData = (
    memberData: {date: string; paid_subscribed?: number; paid_canceled?: number}[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    selectedResolution: ResolutionOption
): ChartDataPoint[] => {
    if (!memberData.length) {
        return [];
    }

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
    const combined = mergeByDate(subscribedData, canceledData, 'paid_canceled', 'paid_subscribed');

    return toChartDataPoints(combined, range, selectedResolution);
};

const toChartDataPoints = (
    data: DataPoint[],
    range: number,
    selectedResolution: ResolutionOption
): ChartDataPoint[] => {
    const effectiveRange = getEffectiveRange(range, selectedResolution);
    return data.map(item => ({
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item.signups ?? 0,
        cancelled: -(item.cancellations ?? 0)
    }));
};

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
                style={{backgroundColor: colorVar}}
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

    const chartData = useMemo<ChartDataPoint[]>(() => {
        if (subscriptionData?.length) {
            return buildChartDataFromSubscriptions(subscriptionData, range, aggregationStrategy, selectedResolution);
        }
        return buildChartDataFromMemberData(memberData, range, aggregationStrategy, selectedResolution);
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const totals = useMemo(() => ({
        new: chartData.reduce((sum, item) => sum + item.new, 0),
        cancelled: chartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0)
    }), [chartData]);

    if (isLoading) {
        return null;
    }

    const hasData = chartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);

    const tooltipFormatter = (value: unknown, name: unknown, payload: unknown, index: number) => {
        const rawValue = Number(value);
        const displayValue = rawValue === 0 ? '0' : formatNumber(Math.abs(rawValue));

        const payloadData = (payload as {payload?: ChartDataPoint})?.payload;
        const newValue = Number(payloadData?.new ?? 0);
        const cancelledValue = Number(payloadData?.cancelled ?? 0);
        const netChange = newValue + cancelledValue;
        const netChangeFormatted = netChange === 0
            ? '0'
            : netChange > 0 ? `+${formatNumber(netChange)}` : formatNumber(netChange);

        const tooltipRange = getTooltipRangeForResolution(selectedResolution);
        const tooltipDate = payloadData?.rawDate
            ? formatDisplayDateWithRange(payloadData.rawDate, tooltipRange)
            : payloadData?.date;

        const nameStr = String(name);
        const configLabel = CHART_CONFIG[nameStr as keyof typeof CHART_CONFIG]?.label ?? nameStr;
        const colorVar = `var(--color-${nameStr})`;

        return (
            <div className='flex w-full flex-col'>
                {index === 0 && (
                    <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
                )}
                <TooltipRow colorVar={colorVar} label={configLabel} value={displayValue} />
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
                        availableResolutions={availableResolutions}
                        selectedResolution={selectedResolution}
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
| **Data building** | One giant `useMemo` with duplicated `subscriptionData`/`memberData` branches (~100 lines) | Two focused functions `buildChartDataFromSubscriptions` / `buildChartDataFromMemberData` sharing `mergeByDate` and `toChartDataPoints` |
| **`fillMissingDataPoints`** | Duplicated `push` logic in each strategy branch | Shared `getOrEmpty` helper; `monthly`/`weekly` unified into one branch |
| **`aggregationStrategy`** | `useMemo` with a `switch` statement | Constant lookup table `RESOLUTION_TO_STRATEGY` |
| **Tooltip** | Inline 60-line anonymous function | Extracted `tooltipFormatter` + reusable `TooltipRow` component |
| **Legend** | Duplicated markup for each item | Reusable `LegendItem` component |
| **Resolution dropdown** | Inline conditional JSX | Reusable `ResolutionSelect` component (returns `null` when not needed) |
| **Chart config** | Inline object recreated on every render | Module-level `CHART_CONFIG` constant |
| **`defs` duplication** | Two separate `<defs>` blocks | Merged into one |