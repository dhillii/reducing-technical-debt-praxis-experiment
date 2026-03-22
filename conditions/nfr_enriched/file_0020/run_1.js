# Refactored PaidMembersChangeChart

The main improvements focus on:
1. **Extracting helper functions** to reduce component complexity
2. **Eliminating duplicated logic** between `subscriptionData` and `memberData` paths
3. **Splitting large `useMemo`** into smaller, focused pieces
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
    return span >= 91 ? ['weekly', 'monthly'] : ['daily', 'weekly'];
};

const getDefaultResolution = (range: number): ResolutionOption => {
    const span = getActualDateSpan(range);
    if (span < 30) {
        return 'daily';
    }
    return span >= 91 ? 'monthly' : 'weekly';
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const getEffectiveRange = (range: number, resolution: ResolutionOption): number => {
    if (resolution === 'weekly' && range < WEEKLY_FORMAT_RANGE) {
        return WEEKLY_FORMAT_RANGE;
    }
    if (resolution === 'monthly' && range < MONTHLY_FORMAT_RANGE) {
        return MONTHLY_FORMAT_RANGE;
    }
    return range;
};

const getTooltipRange = (resolution: ResolutionOption): number => {
    const map: Record<ResolutionOption, number> = {
        monthly: MONTHLY_FORMAT_RANGE,
        weekly: WEEKLY_FORMAT_RANGE,
        daily: DAILY_FORMAT_RANGE
    };
    return map[resolution];
};

// ─── Data filling ─────────────────────────────────────────────────────────────

const createEmptyPoint = (date: string): DataPoint => ({date, signups: 0, cancellations: 0});

const fillMissingDataPoints = (
    data: DataPoint[],
    dateRange: number,
    overrideStrategy?: AggregationStrategy
): DataPoint[] => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(item => item.date === today);
        return [{...createEmptyPoint(today), ...todayData}];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);
    const dataMap = new Map(data.map(item => [item.date, item]));

    const getOrEmpty = (dateKey: string): DataPoint =>
        dataMap.get(dateKey) ?? createEmptyPoint(dateKey);

    if (strategy === 'monthly') {
        return buildPeriodData(startDate, endDate, 'month', getOrEmpty);
    }
    if (strategy === 'weekly') {
        return buildPeriodData(startDate, endDate, 'week', getOrEmpty);
    }
    return buildDailyData(startDate, endDate, getOrEmpty);
};

const buildPeriodData = (
    startDate: string,
    endDate: string,
    unit: 'month' | 'week',
    getOrEmpty: (key: string) => DataPoint
): DataPoint[] => {
    const result: DataPoint[] = [];
    const seen = new Set<string>();
    const current = moment(startDate).startOf(unit);
    const end = moment(endDate).startOf(unit);

    while (current.isSameOrBefore(end)) {
        const key = current.format('YYYY-MM-DD');
        if (!seen.has(key)) {
            seen.add(key);
            result.push(getOrEmpty(key));
        }
        current.add(1, unit);
    }
    return result;
};

const buildDailyData = (
    startDate: string,
    endDate: string,
    getOrEmpty: (key: string) => DataPoint
): DataPoint[] => {
    const result: DataPoint[] = [];
    const current = moment(startDate);
    const end = moment(endDate);

    while (current.isSameOrBefore(end)) {
        result.push(getOrEmpty(current.format('YYYY-MM-DD')));
        current.add(1, 'day');
    }
    return result;
};

// ─── Data normalization ───────────────────────────────────────────────────────

/**
 * Merges two aggregated datasets (primary + secondary) into unified DataPoints,
 * filling gaps from either side and sorting by date.
 */
const mergeAggregatedData = (
    primaryData: {date: string; [key: string]: unknown}[],
    secondaryData: {date: string; [key: string]: unknown}[],
    primaryKey: string,
    secondaryKey: string
): DataPoint[] => {
    const secondaryMap = new Map(secondaryData.map(item => [item.date, item]));

    const combined: DataPoint[] = primaryData.map(item => ({
        date: item.date,
        signups: Number(item[primaryKey] ?? 0),
        cancellations: Number(secondaryMap.get(item.date)?.[secondaryKey] ?? 0)
    }));

    const combinedDates = new Set(combined.map(item => item.date));
    secondaryData.forEach((item) => {
        if (!combinedDates.has(item.date)) {
            combined.push({
                date: item.date,
                signups: 0,
                cancellations: Number(item[secondaryKey] ?? 0)
            });
        }
    });

    return combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const toChartPoint = (item: DataPoint, range: number, resolution: ResolutionOption): ChartDataPoint => ({
    date: formatDisplayDateWithRange(item.date, getEffectiveRange(range, resolution)),
    rawDate: item.date,
    new: item.signups,
    cancelled: -item.cancellations
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

// ─── Sub-components ───────────────────────────────────────────────────────────

type LegendItemProps = {label: string; color: string; value: number};

const LegendItem: React.FC<LegendItemProps> = ({label, color, value}) => (
    <div className='flex items-center gap-2'>
        <span className='size-2 rounded-full opacity-50' style={{backgroundColor: color}} />
        <span>{label}</span>
        <span className='font-medium text-foreground'>{formatNumber(value)}</span>
    </div>
);

type TooltipRowProps = {
    colorVar: string;
    label: string;
    value: string;
};

const TooltipRow: React.FC<TooltipRowProps> = ({colorVar, label, value}) => (
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

type ResolutionSelectProps = {
    resolutions: ResolutionOption[];
    value: ResolutionOption;
    onChange: (value: ResolutionOption) => void;
};

const ResolutionSelect: React.FC<ResolutionSelectProps> = ({resolutions, value, onChange}) => (
    <Select value={value} onValueChange={v => onChange(v as ResolutionOption)}>
        <SelectTrigger className="w-[110px]">
            <SelectValue />
        </SelectTrigger>
        <SelectContent align='end'>
            {resolutions.map(r => (
                <SelectItem key={r} value={r}>{capitalize(r)}</SelectItem>
            ))}
        </SelectContent>
    </Select>
);

// ─── Main component ───────────────────────────────────────────────────────────

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

    const paidChangeChartData = useMemo<ChartDataPoint[]>(() => {
        const today = moment().format('YYYY-MM-DD');

        // ── Subscription data path ──
        if (subscriptionData?.length) {
            if (range === 1) {
                const todayData = subscriptionData.find(item => item.date === today);
                return [buildTodayChartPoint(today, todayData?.signups ?? 0, todayData?.cancellations ?? 0, range)];
            }

            const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
            const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
            const combined = mergeAggregatedData(signupsData, cancellationsData, 'signups', 'cancellations');
            const filled = fillMissingDataPoints(combined, range, aggregationStrategy);

            return filled.map(item => toChartPoint(item, range, selectedResolution));
        }

        // ── Member data fallback path ──
        if (!memberData?.length) {
            return [];
        }

        if (range === 1) {
            const todayData = memberData.find(item => item.date === today);
            return [buildTodayChartPoint(today, todayData?.paid_subscribed ?? 0, todayData?.paid_canceled ?? 0, range)];
        }

        const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
        const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
        const combined = mergeAggregatedData(subscribedData, canceledData, 'paid_subscribed', 'paid_canceled');

        return combined.map(item => toChartPoint(item, range, selectedResolution));
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const totals = useMemo(() => ({
        new: paidChangeChartData.reduce((sum, item) => sum + item.new, 0),
        cancelled: paidChangeChartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0)
    }), [paidChangeChartData]);

    if (isLoading) {
        return null;
    }

    const hasData = paidChangeChartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);

    const tooltipFormatter: React.ComponentProps<typeof ChartTooltipContent>['formatter'] = (
        value, name, payload, index
    ) => {
        const rawValue = Number(value);
        const displayValue = rawValue === 0 ? '0'
            : rawValue < 0 ? formatNumber(rawValue * -1)
                : formatNumber(rawValue);

        const newVal = Number(payload?.payload?.new ?? 0);
        const cancelledVal = Number(payload?.payload?.cancelled ?? 0);
        const net = newVal + cancelledVal;
        const netFormatted = net === 0 ? '0' : net > 0 ? `+${formatNumber(net)}` : formatNumber(net);

        const rawDate = payload?.payload?.rawDate;
        const tooltipDate = rawDate
            ? formatDisplayDateWithRange(rawDate, getTooltipRange(selectedResolution))
            : payload?.payload?.date;

        return (
            <div className='flex w-full flex-col'>
                {index === 0 && (
                    <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
                )}
                <TooltipRow
                    colorVar={`var(--color-${name})`}
                    label={CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label ?? String(name)}
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
                    {availableResolutions.length > 1 && (
                        <ResolutionSelect
                            resolutions={availableResolutions}
                            value={selectedResolution}
                            onChange={setSelectedResolution}
                        />
                    )}
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
                                    tickFormatter={v => formatNumber(Math.abs(v))}
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
| **Duplicated data paths** | Two near-identical blocks for `subscriptionData` vs `memberData` | `mergeAggregatedData` handles both; paths differ only in field names |
| **`fillMissingDataPoints`** | Three large `if/else` blocks with repeated `seenKeys` logic | Extracted `buildPeriodData` + `buildDailyData` helpers |
| **`useMemo` size** | One 80-line memo with nested branches | Slim memo delegating to pure functions |
| **Tooltip JSX** | Inline 60-line formatter closure | Extracted `tooltipFormatter` + `TooltipRow` component |
| **Legend** | Repeated `div` markup twice | `LegendItem` component |
| **Resolution select** | Inline JSX with map | `ResolutionSelect` component |
| **Magic numbers** | Scattered `91`, `365`, `366`, `30` | Named constants (`WEEKLY_FORMAT_RANGE`, etc.) |
| **Strategy mapping** | `switch` in `useMemo` | Lookup table `RESOLUTION_TO_STRATEGY` |
| **Duplicate `<defs>`** | Two separate `<defs>` blocks | Merged into one |