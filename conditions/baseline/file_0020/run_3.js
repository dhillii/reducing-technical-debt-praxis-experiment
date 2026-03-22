# Refactored PaidMembersChangeChart

The main improvements focus on:
1. **Extracting helper functions** out of the component and into reusable utilities
2. **Eliminating duplicated logic** between `subscriptionData` and `memberData` paths
3. **Breaking down large `useMemo`** into smaller, focused pieces
4. **Extracting sub-components** for the tooltip and legend
5. **Simplifying conditional logic** with early returns and guard clauses

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

interface NormalizedDataPoint {
    date: string;
    signups: number;
    cancellations: number;
}

interface ChartDataPoint {
    date: string;
    rawDate: string;
    new: number;
    cancelled: number;
}

interface PaidMembersChangeChartProps {
    subscriptionData?: {date: string; signups: number; cancellations: number}[];
    memberData: {date: string; paid_subscribed?: number; paid_canceled?: number}[];
    range: number;
    isLoading: boolean;
}

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

const RESOLUTION_TO_RANGE_OVERRIDE: Partial<Record<ResolutionOption, number>> = {
    weekly: 91,
    monthly: 366
};

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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const getEffectiveRange = (range: number, resolution: ResolutionOption): number =>
    RESOLUTION_TO_RANGE_OVERRIDE[resolution] ?? range;

const formatTooltipDate = (rawDate: string, resolution: ResolutionOption): string => {
    const rangeOverride = RESOLUTION_TO_RANGE_OVERRIDE[resolution] ?? 30;
    return formatDisplayDateWithRange(rawDate, rangeOverride);
};

// ─── Data Filling ─────────────────────────────────────────────────────────────

const createEmptyPoint = (date: string): NormalizedDataPoint => ({date, signups: 0, cancellations: 0});

const fillPeriod = (
    startDate: string,
    endDate: string,
    unit: 'day' | 'week' | 'month',
    dataMap: Map<string, NormalizedDataPoint>
): NormalizedDataPoint[] => {
    const result: NormalizedDataPoint[] = [];
    const current = moment(startDate).startOf(unit === 'day' ? 'day' : unit);
    const end = moment(endDate).startOf(unit === 'day' ? 'day' : unit);

    while (current.isSameOrBefore(end)) {
        const key = current.format('YYYY-MM-DD');
        result.push(dataMap.get(key) ?? createEmptyPoint(key));
        current.add(1, unit);
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
        return [data.find(item => item.date === today) ?? createEmptyPoint(today)];
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

    return fillPeriod(startDate, endDate, unitMap[strategy] ?? 'day', dataMap);
};

// ─── Data Normalization ───────────────────────────────────────────────────────

const mergeByDate = <T extends {date: string}>(
    primary: T[],
    secondary: T[],
    primaryKey: keyof T,
    secondaryKey: keyof T
): NormalizedDataPoint[] => {
    const secondaryMap = new Map(secondary.map(item => [item.date, item]));

    const combined: NormalizedDataPoint[] = primary.map(item => ({
        date: item.date,
        signups: Number(item[primaryKey]) || 0,
        cancellations: Number(secondaryMap.get(item.date)?.[secondaryKey]) || 0
    }));

    const combinedDates = new Set(combined.map(item => item.date));
    secondary.forEach((item) => {
        if (!combinedDates.has(item.date)) {
            combined.push({
                date: item.date,
                signups: 0,
                cancellations: Number(item[secondaryKey]) || 0
            });
        }
    });

    return combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const toChartPoint = (item: NormalizedDataPoint, range: number, resolution: ResolutionOption): ChartDataPoint => ({
    date: formatDisplayDateWithRange(item.date, getEffectiveRange(range, resolution)),
    rawDate: item.date,
    new: item.signups,
    cancelled: -item.cancellations
});

const buildTodayChartPoint = (
    data: NormalizedDataPoint[],
    range: number
): ChartDataPoint[] => {
    const today = moment().format('YYYY-MM-DD');
    const todayData = data.find(item => item.date === today) ?? createEmptyPoint(today);
    return [{
        date: formatDisplayDateWithRange(today, range),
        rawDate: today,
        new: todayData.signups,
        cancelled: -todayData.cancellations
    }];
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface TooltipRowProps {
    colorVar: string;
    label: string;
    value: string;
}

const TooltipRow: React.FC<TooltipRowProps> = ({colorVar, label, value}) => (
    <div className='flex w-full items-center justify-between gap-4'>
        <div className='flex items-center gap-1'>
            <div
                className="size-2 shrink-0 rounded-full opacity-50"
                style={{backgroundColor: `var(--color-${colorVar})`}}
            />
            <span className='text-sm text-muted-foreground'>{label}</span>
        </div>
        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
            {value}
        </div>
    </div>
);

interface LegendItemProps {
    color: string;
    label: string;
    value: number;
}

const LegendItem: React.FC<LegendItemProps> = ({color, label, value}) => (
    <div className='flex items-center gap-2'>
        <span className='size-2 rounded-full opacity-50' style={{backgroundColor: color}} />
        <span>{label}</span>
        <span className='font-medium text-foreground'>{formatNumber(value)}</span>
    </div>
);

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

    const normalizedData = useMemo((): NormalizedDataPoint[] => {
        if (subscriptionData?.length) {
            const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
            const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
            return mergeByDate(signupsData, cancellationsData, 'signups', 'cancellations');
        }

        if (!memberData?.length) {
            return [];
        }

        const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
        const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
        return mergeByDate(subscribedData, canceledData, 'paid_subscribed', 'paid_canceled');
    }, [subscriptionData, memberData, range, aggregationStrategy]);

    const paidChangeChartData = useMemo((): ChartDataPoint[] => {
        if (!normalizedData.length) {
            return [];
        }

        if (range === 1) {
            return buildTodayChartPoint(normalizedData, range);
        }

        const filled = fillMissingDataPoints(normalizedData, range, aggregationStrategy);
        return filled.map(item => toChartPoint(item, range, selectedResolution));
    }, [normalizedData, range, aggregationStrategy, selectedResolution]);

    const totals = useMemo(() => ({
        new: paidChangeChartData.reduce((sum, item) => sum + item.new, 0),
        cancelled: paidChangeChartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0)
    }), [paidChangeChartData]);

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
                        <CardDescription>
                            New and cancelled paid subscriptions {getPeriodText(range)}
                        </CardDescription>
                    </div>
                    {availableResolutions.length > 1 && (
                        <Select
                            value={selectedResolution}
                            onValueChange={value => setSelectedResolution(value as ResolutionOption)}
                        >
                            <SelectTrigger className="w-[110px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent align='end'>
                                {availableResolutions.map(resolution => (
                                    <SelectItem key={resolution} value={resolution}>
                                        {capitalize(resolution)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {hasData ? (
                    <ChartContent
                        chartData={paidChangeChartData}
                        selectedResolution={selectedResolution}
                        totals={totals}
                    />
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

// ─── Chart Content Sub-component ─────────────────────────────────────────────

interface ChartContentProps {
    chartData: ChartDataPoint[];
    selectedResolution: ResolutionOption;
    totals: {new: number; cancelled: number};
}

const ChartContent: React.FC<ChartContentProps> = ({chartData, selectedResolution, totals}) => {
    const tooltipFormatter = (
        value: unknown,
        name: string,
        payload: {payload?: ChartDataPoint},
        index: number
    ) => {
        const rawValue = Number(value);
        const displayValue = rawValue === 0
            ? '0'
            : formatNumber(Math.abs(rawValue));

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

        const label = CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label ?? name;

        return (
            <div className='flex w-full flex-col'>
                {index === 0 && (
                    <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
                )}
                <TooltipRow colorVar={name} label={label} value={displayValue} />
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
    );
};

export default PaidMembersChangeChart;
```

## Key Changes

| Area | Before | After |
|---|---|---|
| **Data paths** | Duplicated `subscriptionData` / `memberData` logic (~80 lines each) | Single `mergeByDate` generic function + `normalizedData` memo |
| **`fillMissingDataPoints`** | Three near-identical `if/else` branches | `fillPeriod` with a `unitMap` lookup |
| **`useMemo` size** | One 120-line memo | Split into `normalizedData` + `paidChangeChartData` |
| **Tooltip** | 60-line inline function | Extracted `tooltipFormatter` + `TooltipRow` component |
| **Legend** | Repeated markup | `LegendItem` component |
| **Chart JSX** | Inline in main component | `ChartContent` sub-component |
| **Strategy mapping** | `switch` statement | `RESOLUTION_TO_STRATEGY` lookup table |
| **`defs` duplication** | Two separate `<defs>` blocks | Merged into one |
| **`formatResolution`** | Inline function | `capitalize` utility |