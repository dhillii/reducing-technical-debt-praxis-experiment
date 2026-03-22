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

const formatAbsoluteNumber = (value: number): string =>
    value === 0 ? '0' : formatNumber(Math.abs(value));

const formatNetChange = (net: number): string => {
    if (net === 0) {
        return '0';
    }
    return net > 0 ? `+${formatNumber(net)}` : formatNumber(net);
};

const getTooltipDateRange = (resolution: ResolutionOption): number => {
    const map: Record<ResolutionOption, number> = {
        monthly: MONTHLY_FORMAT_RANGE,
        weekly: WEEKLY_FORMAT_RANGE,
        daily: DAILY_FORMAT_RANGE
    };
    return map[resolution];
};

// ─── Data Filling ─────────────────────────────────────────────────────────────

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

    const makeEmptyPoint = (dateKey: string): DataPoint => ({date: dateKey, signups: 0, cancellations: 0});

    const buildPeriodFilledData = (
        unit: 'month' | 'week' | 'day',
        momentUnit: moment.unitOfTime.DurationConstructor
    ): DataPoint[] => {
        const current = moment(startDate).startOf(unit);
        const end = moment(endDate).startOf(unit);
        const result: DataPoint[] = [];
        const seen = new Set<string>();

        while (current.isSameOrBefore(end)) {
            const key = current.format('YYYY-MM-DD');
            if (!seen.has(key)) {
                seen.add(key);
                result.push(dataMap.get(key) ?? makeEmptyPoint(key));
            }
            current.add(1, momentUnit);
        }
        return result;
    };

    if (strategy === 'monthly') {
        return buildPeriodFilledData('month', 'month');
    }
    if (strategy === 'weekly') {
        return buildPeriodFilledData('week', 'week');
    }

    // Daily
    return buildPeriodFilledData('day', 'day');
};

// ─── Data Merging ─────────────────────────────────────────────────────────────

const mergeByDate = <T extends {date: string}>(
    primary: T[],
    secondary: T[],
    merge: (primary: T | undefined, secondary: T | undefined, date: string) => DataPoint
): DataPoint[] => {
    const secondaryMap = new Map(secondary.map(item => [item.date, item]));
    const allDates = new Set([...primary.map(i => i.date), ...secondary.map(i => i.date)]);
    const primaryMap = new Map(primary.map(item => [item.date, item]));

    return Array.from(allDates)
        .map(date => merge(primaryMap.get(date), secondaryMap.get(date), date))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const buildDataPointsFromSubscriptions = (
    data: {date: string; signups: number; cancellations: number}[],
    range: number,
    strategy: AggregationStrategy
): DataPoint[] => {
    const signupsData = sanitizeChartData(data, range, 'signups', 'sum', strategy);
    const cancellationsData = sanitizeChartData(data, range, 'cancellations', 'sum', strategy);

    return mergeByDate(signupsData, cancellationsData, (primary, secondary, date) => ({
        date,
        signups: primary?.signups ?? 0,
        cancellations: secondary?.cancellations ?? 0
    }));
};

const buildDataPointsFromMemberData = (
    data: {date: string; paid_subscribed?: number; paid_canceled?: number}[],
    range: number,
    strategy: AggregationStrategy
): DataPoint[] => {
    const subscribedData = sanitizeChartData(data, range, 'paid_subscribed', 'sum', strategy);
    const canceledData = sanitizeChartData(data, range, 'paid_canceled', 'sum', strategy);

    return mergeByDate(subscribedData, canceledData, (primary, secondary, date) => ({
        date,
        signups: primary?.paid_subscribed ?? 0,
        cancellations: secondary?.paid_canceled ?? 0
    }));
};

const toChartDataPoint = (item: DataPoint, range: number, resolution: ResolutionOption): ChartDataPoint => ({
    date: formatDisplayDateWithRange(item.date, getEffectiveRange(range, resolution)),
    rawDate: item.date,
    new: item.signups ?? 0,
    cancelled: -(item.cancellations ?? 0)
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

    const paidChangeChartData = useMemo((): ChartDataPoint[] => {
        const today = moment().format('YYYY-MM-DD');

        // Today range: single data point
        if (range === 1) {
            if (subscriptionData?.length) {
                const todayData = subscriptionData.find(item => item.date === today);
                return [buildTodayChartPoint(today, todayData?.signups ?? 0, todayData?.cancellations ?? 0, range)];
            }
            const todayData = memberData.find(item => item.date === today);
            return [buildTodayChartPoint(today, todayData?.paid_subscribed ?? 0, todayData?.paid_canceled ?? 0, range)];
        }

        // Build raw data points
        let rawPoints: DataPoint[];
        if (subscriptionData?.length) {
            rawPoints = buildDataPointsFromSubscriptions(subscriptionData, range, aggregationStrategy);
        } else {
            if (!memberData?.length) {
                return [];
            }
            rawPoints = buildDataPointsFromMemberData(memberData, range, aggregationStrategy);
        }

        const filled = fillMissingDataPoints(rawPoints, range, aggregationStrategy);
        return filled.map(item => toChartDataPoint(item, range, selectedResolution));
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

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
                    <ResolutionSelect
                        available={availableResolutions}
                        selected={selectedResolution}
                        onChange={setSelectedResolution}
                    />
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

type ChartContentProps = {
    chartData: ChartDataPoint[];
    selectedResolution: ResolutionOption;
    totals: {new: number; cancelled: number};
};

const ChartContent: React.FC<ChartContentProps> = ({chartData, selectedResolution, totals}) => (
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
                    tickFormatter={value => formatAbsoluteNumber(value)}
                    tickLine={false}
                />
                <ChartTooltip
                    content={
                        <ChartTooltipContent
                            className='!min-w-[120px] px-3 py-2'
                            formatter={(value, name, payload, index) => (
                                <TooltipContent
                                    index={index}
                                    name={name as keyof typeof CHART_CONFIG}
                                    payload={payload}
                                    selectedResolution={selectedResolution}
                                    value={Number(value)}
                                />
                            )}
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

// ─── Tooltip Content Sub-component ───────────────────────────────────────────

type TooltipContentProps = {
    value: number;
    name: keyof typeof CHART_CONFIG;
    payload: any;
    index: number;
    selectedResolution: ResolutionOption;
};

const TooltipContent: React.FC<TooltipContentProps> = ({value, name, payload, index, selectedResolution}) => {
    const displayValue = formatAbsoluteNumber(value);
    const newValue = Number(payload?.payload?.new ?? 0);
    const cancelledValue = Number(payload?.payload?.cancelled ?? 0);
    const netChange = newValue + cancelledValue;

    const tooltipDate = payload?.payload?.rawDate
        ? formatDisplayDateWithRange(payload.payload.rawDate, getTooltipDateRange(selectedResolution))
        : payload?.payload?.date;

    return (
        <div className='flex w-full flex-col'>
            {index === 0 && (
                <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
            )}
            <TooltipRow
                colorVar={`--color-${name}`}
                label={CHART_CONFIG[name]?.label ?? name}
                value={displayValue}
            />
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

export default PaidMembersChangeChart;
```

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| Duplicated `subscriptionData` / `memberData` processing logic | Extracted `buildDataPointsFromSubscriptions` and `buildDataPointsFromMemberData`, unified via `mergeByDate` |
| Monolithic `paidChangeChartData` useMemo (~80 lines) | Split into focused pure functions: `buildDataPointsFrom*`, `toChartDataPoint`, `buildTodayChartPoint` |
| Inline tooltip JSX (~60 lines) inside formatter | Extracted `TooltipContent` and `TooltipRow` components |
| Repeated legend markup | Extracted `LegendItem` component |
| Repeated Select markup | Extracted `ResolutionSelect` component |
| Large chart JSX block in main component | Extracted `ChartContent` component |
| `switch` for strategy mapping | Replaced with `RESOLUTION_TO_STRATEGY` lookup table |
| Duplicated `Math.abs` / sign formatting | Centralized in `formatAbsoluteNumber` and `formatNetChange` |
| Duplicated tooltip date range logic | Centralized in `getTooltipDateRange` |
| Two separate `<defs>` blocks | Merged into one |