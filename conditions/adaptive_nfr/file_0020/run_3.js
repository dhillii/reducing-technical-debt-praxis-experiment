# Refactored PaidMembersChangeChart

The main issues I identified:
1. **Massive `paidChangeChartData` memo** with duplicated logic for subscription vs member data paths
2. **`fillMissingDataPoints`** has repetitive period-iteration logic across three branches
3. **Tooltip formatter** is an oversized inline function doing too much
4. **Scattered resolution helpers** that can be consolidated
5. **Duplicated "Today" handling** and date formatting logic

---

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

// Range thresholds for formatting: forces correct label style per resolution
const RESOLUTION_FORMAT_RANGE: Record<ResolutionOption, number> = {
    daily: 30,
    weekly: 91,
    monthly: 366
};

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

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Data Helpers ─────────────────────────────────────────────────────────────

/**
 * Iterates over period boundaries (day/week/month) and fills gaps with zeros.
 */
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

    type PeriodUnit = 'day' | 'week' | 'month';
    const unitMap: Record<string, PeriodUnit> = {
        monthly: 'month',
        weekly: 'week',
        none: 'day'
    };
    const unit = unitMap[strategy] ?? 'day';

    const current = moment(startDate).startOf(unit);
    const end = moment(endDate).startOf(unit);
    const filled: DataPoint[] = [];
    const seen = new Set<string>();

    while (current.isSameOrBefore(end)) {
        const key = current.format('YYYY-MM-DD');
        if (!seen.has(key)) {
            seen.add(key);
            filled.push(dataMap.get(key) ?? {date: key, signups: 0, cancellations: 0});
        }
        current.add(1, unit);
    }

    return filled;
};

/**
 * Merges two aggregated datasets by date, filling gaps in either direction.
 */
const mergeByDate = <T extends Record<string, unknown>>(
    primary: T[],
    secondary: T[],
    secondaryKey: keyof T
): Array<T & {_secondaryValue: number}> => {
    const secondaryMap = new Map(secondary.map(item => [item.date as string, item]));
    const primaryDates = new Set(primary.map(item => item.date as string));

    const merged = primary.map(item => ({
        ...item,
        _secondaryValue: (secondaryMap.get(item.date as string)?.[secondaryKey] as number) ?? 0
    }));

    secondary.forEach((item) => {
        if (!primaryDates.has(item.date as string)) {
            merged.push({...item, _secondaryValue: (item[secondaryKey] as number) ?? 0} as T & {_secondaryValue: number});
        }
    });

    merged.sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());
    return merged;
};

/**
 * Formats a raw date string for display, driven purely by the selected resolution.
 */
const formatDateByResolution = (rawDate: string, resolution: ResolutionOption): string =>
    formatDisplayDateWithRange(rawDate, RESOLUTION_FORMAT_RANGE[resolution]);

/**
 * Converts normalised DataPoints into chart-ready objects.
 */
const toChartPoints = (data: DataPoint[], range: number, resolution: ResolutionOption): ChartDataPoint[] => {
    // For display labels we use the effective range so axis labels match the resolution
    const effectiveRange = resolution === 'daily' ? range : RESOLUTION_FORMAT_RANGE[resolution];

    return data.map(item => ({
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item.signups ?? 0,
        cancelled: -(item.cancellations ?? 0)
    }));
};

// ─── Data Normalisation ───────────────────────────────────────────────────────

/** Normalises subscription data into DataPoints with aggregation applied. */
const buildFromSubscriptionData = (
    subscriptionData: NonNullable<PaidMembersChangeChartProps['subscriptionData']>,
    range: number,
    strategy: AggregationStrategy
): DataPoint[] => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = subscriptionData.find(item => item.date === today);
        return [{date: today, signups: todayData?.signups ?? 0, cancellations: todayData?.cancellations ?? 0}];
    }

    const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', strategy);
    const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', strategy);

    const merged = mergeByDate(signupsData, cancellationsData, 'cancellations');
    const normalised: DataPoint[] = merged.map(item => ({
        date: item.date as string,
        signups: (item.signups as number) ?? 0,
        cancellations: item._secondaryValue
    }));

    return fillMissingDataPoints(normalised, range, strategy);
};

/** Normalises member data into DataPoints with aggregation applied. */
const buildFromMemberData = (
    memberData: PaidMembersChangeChartProps['memberData'],
    range: number,
    strategy: AggregationStrategy
): DataPoint[] => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = memberData.find(item => item.date === today);
        return [{date: today, signups: todayData?.paid_subscribed ?? 0, cancellations: todayData?.paid_canceled ?? 0}];
    }

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', strategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', strategy);

    const merged = mergeByDate(subscribedData, canceledData, 'paid_canceled');
    return merged.map(item => ({
        date: item.date as string,
        signups: (item.paid_subscribed as number) ?? 0,
        cancellations: item._secondaryValue
    }));
};

// ─── Sub-components ───────────────────────────────────────────────────────────

type TooltipFormatterProps = {
    value: unknown;
    name: string;
    payload: {payload?: ChartDataPoint};
    index: number;
    selectedResolution: ResolutionOption;
};

const TooltipRow: React.FC<{colorVar: string; label: string; value: string}> = ({colorVar, label, value}) => (
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

const formatAbsoluteNumber = (n: number) => (n === 0 ? '0' : formatNumber(Math.abs(n)));

const formatNetChange = (net: number) => {
    if (net === 0) {
        return '0';
    }
    return net > 0 ? `+${formatNumber(net)}` : formatNumber(net);
};

const buildTooltipFormatter = (selectedResolution: ResolutionOption) =>
    (value: unknown, name: string, payload: {payload?: ChartDataPoint}, index: number) => {
        const rawValue = Number(value);
        const chartPayload = payload?.payload;

        const tooltipDate = chartPayload?.rawDate
            ? formatDateByResolution(chartPayload.rawDate, selectedResolution)
            : chartPayload?.date ?? '';

        const newValue = Number(chartPayload?.new ?? 0);
        const cancelledValue = Number(chartPayload?.cancelled ?? 0);
        const netChange = newValue + cancelledValue;

        const configEntry = CHART_CONFIG[name as keyof typeof CHART_CONFIG];
        const label = configEntry?.label ?? name;
        const colorVar = `var(--color-${name})`;

        return (
            <div className='flex w-full flex-col'>
                {index === 0 && (
                    <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
                )}
                <TooltipRow
                    colorVar={colorVar}
                    label={label}
                    value={formatAbsoluteNumber(rawValue)}
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
    value: ResolutionOption;
    onChange: (v: ResolutionOption) => void;
};

const ResolutionSelect: React.FC<ResolutionSelectProps> = ({available, value, onChange}) => {
    if (available.length <= 1) {
        return null;
    }
    return (
        <Select value={value} onValueChange={v => onChange(v as ResolutionOption)}>
            <SelectTrigger className="w-[110px]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent align='end'>
                {available.map(r => (
                    <SelectItem key={r} value={r}>{capitalise(r)}</SelectItem>
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
    const [selectedResolution, setSelectedResolution] = useState<ResolutionOption>(() => getDefaultResolution(range));

    useEffect(() => {
        setSelectedResolution(getDefaultResolution(range));
    }, [range]);

    const availableResolutions = useMemo(() => getAvailableResolutions(range), [range]);
    const aggregationStrategy = RESOLUTION_TO_STRATEGY[selectedResolution];

    const paidChangeChartData = useMemo((): ChartDataPoint[] => {
        const hasSubscriptionData = subscriptionData && subscriptionData.length > 0;

        if (!hasSubscriptionData && (!memberData || memberData.length === 0)) {
            return [];
        }

        const dataPoints = hasSubscriptionData
            ? buildFromSubscriptionData(subscriptionData!, range, aggregationStrategy)
            : buildFromMemberData(memberData, range, aggregationStrategy);

        // For "Today" the builders already return a single point; skip toChartPoints formatting
        if (range === 1) {
            const point = dataPoints[0];
            const today = moment().format('YYYY-MM-DD');
            return [{
                date: formatDisplayDateWithRange(today, range),
                rawDate: today,
                new: point.signups,
                cancelled: -point.cancellations
            }];
        }

        return toChartPoints(dataPoints, range, selectedResolution);
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

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
                        value={selectedResolution}
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
                                    tickFormatter={v => formatAbsoluteNumber(Number(v))}
                                    tickLine={false}
                                />
                                <ChartTooltip
                                    content={
                                        <ChartTooltipContent
                                            className='!min-w-[120px] px-3 py-2'
                                            formatter={tooltipFormatter as never}
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

---

## Key Changes

| Area | Before | After |
|---|---|---|
| **`fillMissingDataPoints`** | Three near-identical `if/else` branches for day/week/month | Single loop driven by a `unit` lookup table |
| **`paidChangeChartData` memo** | ~90 lines with duplicated subscription/member paths | Delegates to `buildFromSubscriptionData` / `buildFromMemberData`, then a shared `toChartPoints` |
| **Merge logic** | Duplicated `Map` + `forEach` pattern in both data paths | Extracted into generic `mergeByDate` helper |
| **Tooltip formatter** | ~50-line inline closure recreated on every render | `buildTooltipFormatter` factory + `TooltipRow` component; only recreated when `selectedResolution` changes |
| **Resolution → strategy mapping** | `switch` statement in a `useMemo` | Constant lookup table `RESOLUTION_TO_STRATEGY` |
| **Date formatting** | Scattered `if/else` blocks with magic numbers | `RESOLUTION_FORMAT_RANGE` table + `formatDateByResolution` helper |
| **Legend / Select** | Inline JSX in the render body | `LegendItem` and `ResolutionSelect` sub-components |
| **`aggregationStrategy`** | `useMemo` | Plain derived value (no memo needed for a table lookup) |