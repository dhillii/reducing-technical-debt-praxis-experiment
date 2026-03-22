# Refactored PaidMembersChangeChart

The main improvements focus on:
1. **Extracting helper functions** out of the component and into reusable utilities
2. **Eliminating duplicated logic** between `subscriptionData` and `memberData` paths
3. **Breaking down large `useMemo`** into smaller, focused pieces
4. **Extracting sub-components** for the tooltip and legend
5. **Simplifying the resolution mapping**

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

type ChartDataPoint = {
    date: string;
    rawDate: string;
    new: number;
    cancelled: number;
};

type NormalizedDataPoint = {
    date: string;
    signups: number;
    cancellations: number;
};

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

// ─── Constants ────────────────────────────────────────────────────────────────

const RESOLUTION_TO_STRATEGY: Record<ResolutionOption, AggregationStrategy> = {
    daily: 'none',
    weekly: 'weekly',
    monthly: 'monthly'
};

const RESOLUTION_TO_RANGE_OVERRIDE: Partial<Record<ResolutionOption, number>> = {
    weekly: 91,
    monthly: 366
};

const CHART_CONFIG = {
    new: {label: 'New', color: 'hsl(var(--chart-teal))'},
    cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
} satisfies ChartConfig;

// ─── Resolution Helpers ───────────────────────────────────────────────────────

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

// ─── Data Filling ─────────────────────────────────────────────────────────────

const createEmptyPoint = (date: string): NormalizedDataPoint => ({date, signups: 0, cancellations: 0});

const fillPeriodBoundaries = (
    dataMap: Map<string, NormalizedDataPoint>,
    startDate: string,
    endDate: string,
    unit: 'month' | 'week'
): NormalizedDataPoint[] => {
    const result: NormalizedDataPoint[] = [];
    const current = moment(startDate).startOf(unit);
    const end = moment(endDate).startOf(unit);

    while (current.isSameOrBefore(end)) {
        const key = current.format('YYYY-MM-DD');
        result.push(dataMap.get(key) ?? createEmptyPoint(key));
        current.add(1, unit);
    }
    return result;
};

const fillDailyBoundaries = (
    dataMap: Map<string, NormalizedDataPoint>,
    startDate: string,
    endDate: string
): NormalizedDataPoint[] => {
    const result: NormalizedDataPoint[] = [];
    const current = moment(startDate);
    const end = moment(endDate);

    while (current.isSameOrBefore(end)) {
        const key = current.format('YYYY-MM-DD');
        result.push(dataMap.get(key) ?? createEmptyPoint(key));
        current.add(1, 'day');
    }
    return result;
};

const fillMissingDataPoints = (
    data: NormalizedDataPoint[],
    dateRange: number,
    overrideStrategy?: AggregationStrategy
): NormalizedDataPoint[] => {
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
    return fillDailyBoundaries(dataMap, startDate, endDate);
};

// ─── Data Normalization ───────────────────────────────────────────────────────

/**
 * Merges two aggregated datasets (primary + secondary) into NormalizedDataPoints,
 * ensuring dates present in only one dataset are still included.
 */
const mergeAggregatedData = (
    primaryData: {date: string; [key: string]: unknown}[],
    secondaryData: {date: string; [key: string]: unknown}[],
    primaryKey: string,
    secondaryKey: string
): NormalizedDataPoint[] => {
    const secondaryMap = new Map(secondaryData.map(item => [item.date, item]));

    const merged: NormalizedDataPoint[] = primaryData.map(item => ({
        date: item.date,
        signups: Number(item[primaryKey] ?? 0),
        cancellations: Number(secondaryMap.get(item.date)?.[secondaryKey] ?? 0)
    }));

    const mergedDates = new Set(merged.map(item => item.date));
    secondaryData.forEach((item) => {
        if (!mergedDates.has(item.date)) {
            merged.push({
                date: item.date,
                signups: 0,
                cancellations: Number(item[secondaryKey] ?? 0)
            });
        }
    });

    return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const normalizeSubscriptionData = (
    data: {date: string; signups: number; cancellations: number}[],
    range: number,
    strategy: AggregationStrategy
): NormalizedDataPoint[] => {
    const signupsData = sanitizeChartData(data, range, 'signups', 'sum', strategy);
    const cancellationsData = sanitizeChartData(data, range, 'cancellations', 'sum', strategy);
    return mergeAggregatedData(signupsData, cancellationsData, 'signups', 'cancellations');
};

const normalizeMemberData = (
    data: PaidMembersChangeChartProps['memberData'],
    range: number,
    strategy: AggregationStrategy
): NormalizedDataPoint[] => {
    const subscribedData = sanitizeChartData(data, range, 'paid_subscribed', 'sum', strategy);
    const canceledData = sanitizeChartData(data, range, 'paid_canceled', 'sum', strategy);
    return mergeAggregatedData(subscribedData, canceledData, 'paid_subscribed', 'paid_canceled');
};

// ─── Chart Data Formatting ────────────────────────────────────────────────────

const getEffectiveRange = (range: number, resolution: ResolutionOption): number => {
    return RESOLUTION_TO_RANGE_OVERRIDE[resolution] ?? range;
};

const formatTodayChartPoint = (
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

const toChartDataPoint = (
    item: NormalizedDataPoint,
    effectiveRange: number
): ChartDataPoint => ({
    date: formatDisplayDateWithRange(item.date, effectiveRange),
    rawDate: item.date,
    new: item.signups,
    cancelled: -item.cancellations
});

// ─── Sub-components ───────────────────────────────────────────────────────────

type LegendItemProps = {
    color: string;
    label: string;
    value: number;
};

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
                        {resolution.charAt(0).toUpperCase() + resolution.slice(1)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

type TooltipFormatterProps = {
    value: unknown;
    name: string;
    payload: {payload?: ChartDataPoint};
    index: number;
    selectedResolution: ResolutionOption;
};

const formatTooltipDate = (rawDate: string, resolution: ResolutionOption): string => {
    const rangeOverride = RESOLUTION_TO_RANGE_OVERRIDE[resolution] ?? 30;
    return formatDisplayDateWithRange(rawDate, rangeOverride);
};

const TooltipRow: React.FC<{name: string; displayValue: string}> = ({name, displayValue}) => (
    <div className='flex w-full items-center justify-between gap-4'>
        <div className='flex items-center gap-1'>
            <div
                className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                style={{'--color-bg': `var(--color-${name})`} as React.CSSProperties}
            />
            <span className='text-sm text-muted-foreground'>
                {CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label ?? name}
            </span>
        </div>
        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
            {displayValue}
        </div>
    </div>
);

const formatAbsoluteNumber = (value: number): string => {
    if (value === 0) {
        return '0';
    }
    return value < 0 ? formatNumber(value * -1) : formatNumber(value);
};

const formatNetChange = (net: number): string => {
    if (net === 0) {
        return '0';
    }
    return net > 0 ? `+${formatNumber(net)}` : formatNumber(net);
};

const buildTooltipFormatter = (selectedResolution: ResolutionOption) =>
    (value: unknown, name: string, payload: {payload?: ChartDataPoint}, index: number) => {
        const rawValue = Number(value);
        const displayValue = formatAbsoluteNumber(rawValue);

        const chartPayload = payload?.payload;
        const newValue = Number(chartPayload?.new ?? 0);
        const cancelledValue = Number(chartPayload?.cancelled ?? 0);
        const netChange = newValue + cancelledValue;

        const tooltipDate = chartPayload?.rawDate
            ? formatTooltipDate(chartPayload.rawDate, selectedResolution)
            : (chartPayload?.date ?? '');

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
                            {formatNetChange(netChange)}
                        </div>
                    </div>
                )}
            </div>
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
    const effectiveRange = getEffectiveRange(range, selectedResolution);

    const paidChangeChartData = useMemo((): ChartDataPoint[] => {
        const today = moment().format('YYYY-MM-DD');

        // Handle "Today" range
        if (range === 1) {
            if (subscriptionData?.length) {
                const todayData = subscriptionData.find(item => item.date === today);
                return [formatTodayChartPoint(today, todayData?.signups ?? 0, todayData?.cancellations ?? 0, range)];
            }
            const todayMember = memberData?.find(item => item.date === today);
            return [formatTodayChartPoint(today, todayMember?.paid_subscribed ?? 0, todayMember?.paid_canceled ?? 0, range)];
        }

        // Normalize data from whichever source is available
        let normalized: NormalizedDataPoint[];
        if (subscriptionData?.length) {
            normalized = normalizeSubscriptionData(subscriptionData, range, aggregationStrategy);
        } else if (memberData?.length) {
            normalized = normalizeMemberData(memberData, range, aggregationStrategy);
        } else {
            return [];
        }

        const filled = fillMissingDataPoints(normalized, range, aggregationStrategy);
        return filled.map(item => toChartDataPoint(item, effectiveRange));
    }, [memberData, subscriptionData, range, aggregationStrategy, effectiveRange]);

    const totals = useMemo(() => ({
        new: paidChangeChartData.reduce((sum, item) => sum + item.new, 0),
        cancelled: paidChangeChartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0)
    }), [paidChangeChartData]);

    if (isLoading) {
        return null;
    }

    const hasData = paidChangeChartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);
    const tooltipFormatter = buildTooltipFormatter(selectedResolution);

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
                            <Recharts.BarChart data={paidChangeChartData} stackOffset='sign'>
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
                                    tickFormatter={value => formatAbsoluteNumber(value)}
                                    tickLine={false}
                                />
                                <ChartTooltip
                                    content={
                                        <ChartTooltipContent
                                            className='!min-w-[120px] px-3 py-2'
                                            formatter={tooltipFormatter}
                                            hideLabel
                                        />
                                    }
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
| **Data paths** | Duplicated `subscriptionData` / `memberData` logic (~80 lines each) | Single `mergeAggregatedData` + two thin normalizers |
| **`fillMissingDataPoints`** | One large function with 3 inline loops | Extracted `fillPeriodBoundaries` + `fillDailyBoundaries` |
| **Resolution mapping** | `switch` statement in `useMemo` | `RESOLUTION_TO_STRATEGY` lookup table |
| **Effective range** | Duplicated `if/else` inside `useMemo` | `getEffectiveRange` + `RESOLUTION_TO_RANGE_OVERRIDE` table |
| **Tooltip** | ~50-line inline closure | `buildTooltipFormatter` factory + `TooltipRow`, `formatAbsoluteNumber`, `formatNetChange` helpers |
| **Legend** | Duplicated JSX blocks | `LegendItem` component |
| **Resolution dropdown** | Inline JSX with conditional | `ResolutionSelect` component |
| **`paidChangeChartData` memo** | ~80 lines, two near-identical branches | ~20 lines, unified path |
| **Duplicate `<defs>`** | Two separate `<defs>` blocks | One merged `<defs>` block |