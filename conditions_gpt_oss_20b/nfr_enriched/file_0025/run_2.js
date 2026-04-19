import React, {useEffect, useMemo, useState} from 'react';
import moment from 'moment';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    EmptyIndicator,
    LucideIcon,
    Recharts,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    formatDisplayDateWithRange,
    formatNumber,
    getRangeDates
} from '@tryghost/shade';
import {
    determineAggregationStrategy,
    getPeriodText,
    sanitizeChartData
} from '@src/utils/chart-helpers';

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

/**
 * Fill missing data points for a given date range and aggregation strategy.
 */
const fillMissingDataPoints = (
    data: {date: string; signups: number; cancellations: number}[],
    dateRange: number,
    overrideStrategy?: 'none' | 'weekly' | 'monthly' | 'monthly-exact'
) => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(item => item.date === today);
        return [
            {
                date: today,
                signups: todayData?.signups ?? 0,
                cancellations: todayData?.cancellations ?? 0
            }
        ];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);

    const dataMap = new Map(data.map(item => [item.date, item]));
    const filledData: {date: string; signups: number; cancellations: number}[] = [];
    const seenKeys = new Set<string>();

    const iteratePeriod = (current: moment.Moment, end: moment.Moment, step: moment.unitOfTime.DurationConstructor) => {
        while (current.isSameOrBefore(end)) {
            const dateKey = current.format('YYYY-MM-DD');
            if (!seenKeys.has(dateKey)) {
                seenKeys.add(dateKey);
                const existing = dataMap.get(dateKey);
                if (existing) {
                    filledData.push(existing);
                } else {
                    filledData.push({date: dateKey, signups: 0, cancellations: 0});
                }
            }
            current.add(1, step);
        }
    };

    if (strategy === 'monthly') {
        iteratePeriod(moment(startDate).startOf('month'), moment(endDate).startOf('month'), 'month');
    } else if (strategy === 'weekly') {
        iteratePeriod(moment(startDate).startOf('week'), moment(endDate).startOf('week'), 'week');
    } else {
        iteratePeriod(moment(startDate), moment(endDate), 'day');
    }

    return filledData;
};

/**
 * Calculate the actual date span for a range, accounting for YTD.
 */
const getActualDateSpan = (range: number): number => {
    if (range === -1) {
        const {startDate, endDate} = getRangeDates(range);
        return moment(endDate).diff(moment(startDate), 'days');
    }
    return range;
};

/**
 * Determine available resolutions based on the date span.
 */
const getAvailableResolutions = (range: number): ResolutionOption[] => {
    const span = getActualDateSpan(range);
    if (span < 30) return ['daily'];
    if (span >= 91) return ['weekly', 'monthly'];
    return ['daily', 'weekly'];
};

/**
 * Determine default resolution for a given range.
 */
const getDefaultResolution = (range: number): ResolutionOption => {
    const span = getActualDateSpan(range);
    if (span < 30) return 'daily';
    if (span >= 91) return 'monthly';
    return 'weekly';
};

/**
 * Map resolution to aggregation strategy.
 */
const getAggregationStrategyFromResolution = (resolution: ResolutionOption): 'none' | 'weekly' | 'monthly' => {
    switch (resolution) {
        case 'daily':
            return 'none';
        case 'weekly':
            return 'weekly';
        case 'monthly':
            return 'monthly';
    }
};

/**
 * Get effective range for date formatting based on resolution.
 */
const getEffectiveRange = (selectedResolution: ResolutionOption, range: number): number => {
    if (selectedResolution === 'weekly' && range < 91) return 91;
    if (selectedResolution === 'monthly' && range < 365) return 365;
    return range;
};

/**
 * Format chart data items for rendering.
 */
const formatChartData = (
    items: {date: string; signups?: number; cancellations?: number; paid_subscribed?: number; paid_canceled?: number}[],
    selectedResolution: ResolutionOption,
    range: number
) => {
    const effectiveRange = getEffectiveRange(selectedResolution, range);
    return items.map(item => ({
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item.signups ?? item.paid_subscribed ?? 0,
        cancelled: -(item.cancellations ?? item.paid_canceled ?? 0)
    }));
};

/**
 * Aggregate and combine subscription data.
 */
const processSubscriptionData = (
    data: {date: string; signups: number; cancellations: number}[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly'
) => {
    const signups = sanitizeChartData(data, range, 'signups', 'sum', aggregationStrategy);
    const cancellations = sanitizeChartData(data, range, 'cancellations', 'sum', aggregationStrategy);

    const cancelMap = new Map(cancellations.map(c => [c.date, c]));
    const combined = signups.map(item => ({
        date: item.date,
        signups: item.signups ?? 0,
        cancellations: cancelMap.get(item.date)?.cancellations ?? 0
    }));

    const combinedSet = new Set(combined.map(i => i.date));
    cancellations.forEach(c => {
        if (!combinedSet.has(c.date)) {
            combined.push({date: c.date, signups: 0, cancellations: c.cancellations ?? 0});
        }
    });

    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return combined;
};

/**
 * Aggregate and combine member data.
 */
const processMemberData = (
    data: {date: string; paid_subscribed?: number; paid_canceled?: number}[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly'
) => {
    const subscribed = sanitizeChartData(data, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceled = sanitizeChartData(data, range, 'paid_canceled', 'sum', aggregationStrategy);

    const cancelMap = new Map(canceled.map(c => [c.date, c]));
    const combined = subscribed.map(item => ({
        date: item.date,
        paid_subscribed: item.paid_subscribed ?? 0,
        paid_canceled: cancelMap.get(item.date)?.paid_canceled ?? 0
    }));

    const combinedSet = new Set(combined.map(i => i.date));
    canceled.forEach(c => {
        if (!combinedSet.has(c.date)) {
            combined.push({date: c.date, paid_subscribed: 0, paid_canceled: c.paid_canceled ?? 0});
        }
    });

    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return combined;
};

/**
 * Compute totals for the chart footer.
 */
const computeTotals = (data: {new: number; cancelled: number}[]) => {
    const totalNew = data.reduce((sum, item) => sum + item.new, 0);
    const totalCancelled = data.reduce((sum, item) => sum + Math.abs(item.cancelled), 0);
    return {new: totalNew, cancelled: totalCancelled};
};

/**
 * Capitalize first letter of resolution string.
 */
const formatResolution = (resolution: ResolutionOption) => {
    return resolution.charAt(0).toUpperCase() + resolution.slice(1);
};

/**
 * Tooltip formatter for chart.
 */
const tooltipFormatter = (
    value: number,
    name: string,
    payload: any,
    index: number,
    selectedResolution: ResolutionOption
) => {
    const rawValue = Number(value);
    const displayValue = rawValue === 0 ? '0' : rawValue < 0 ? formatNumber(rawValue * -1) : formatNumber(rawValue);

    const newVal = Number(payload?.payload?.new ?? 0);
    const cancelledVal = Number(payload?.payload?.cancelled ?? 0);
    const netChange = newVal + cancelledVal;
    const netChangeFormatted =
        netChange === 0
            ? '0'
            : netChange > 0
            ? `+${formatNumber(netChange)}`
            : formatNumber(netChange);

    let tooltipDate = payload?.payload?.date;
    if (payload?.payload?.rawDate) {
        if (selectedResolution === 'monthly') {
            tooltipDate = formatDisplayDateWithRange(payload.payload.rawDate, 366);
        } else if (selectedResolution === 'weekly') {
            tooltipDate = formatDisplayDateWithRange(payload.payload.rawDate, 91);
        } else {
            tooltipDate = formatDisplayDateWithRange(payload.payload.rawDate, 30);
        }
    }

    return (
        <div className="flex w-full flex-col">
            {index === 0 && (
                <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
            )}
            <div className="flex w-full items-center justify-between gap-4">
                <div className="flex items-center gap-1">
                    <div
                        className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                        style={{
                            '--color-bg': `var(--color-${name})`
                        } as React.CSSProperties}
                    />
                    <span className="text-sm text-muted-foreground">
                        {paidChangeChartConfig[name as keyof typeof paidChangeChartConfig]?.label ?? name}
                    </span>
                </div>
                <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                    {displayValue}
                </div>
            </div>
            {index === 1 && (
                <div className="mt-1 flex w-full items-center justify-between gap-4 border-t pt-1">
                    <span className="text-sm text-muted-foreground">Net change</span>
                    <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                        {netChangeFormatted}
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Render the chart component.
 */
const renderChart = (
    data: {date: string; rawDate: string; new: number; cancelled: number}[],
    config: ChartConfig,
    selectedResolution: ResolutionOption,
    range: number
) => (
    <div>
        <ChartContainer className="aspect-auto h-[200px] w-full md:h-[220px] xl:h-[260px]" config={config}>
            <Recharts.BarChart data={data} stackOffset="sign">
                <defs>
                    <linearGradient id="tealGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={'var(--color-new)'} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={'var(--color-new)'} stopOpacity={0.6} />
                    </linearGradient>
                </defs>
                <defs>
                    <linearGradient id="roseGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={'var(--color-cancelled)'} stopOpacity={0.6} />
                        <stop offset="100%" stopColor={'var(--color-cancelled)'} stopOpacity={0.8} />
                    </linearGradient>
                </defs>
                <Recharts.CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <Recharts.XAxis
                    axisLine={false}
                    dataKey="date"
                    tickFormatter={() => ('')}
                    tickLine={false}
                    tickMargin={10}
                />
                <Recharts.YAxis
                    axisLine={false}
                    tickFormatter={value => (value < 0 ? formatNumber(value * -1) : formatNumber(value))}
                    tickLine={false}
                />
                <ChartTooltip
                    content={
                        <ChartTooltipContent
                            className="!min-w-[120px] px-3 py-2"
                            formatter={(value, name, payload, index) =>
                                tooltipFormatter(value, name, payload, index, selectedResolution)
                            }
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
                    fill="url(#tealGradient)"
                    fillOpacity={0.75}
                    maxBarSize={32}
                    minPointSize={3}
                    radius={[4, 4, 0, 0]}
                    stackId="a"
                />
                <Recharts.Bar
                    activeBar={{fillOpacity: 1}}
                    dataKey="cancelled"
                    fill="url(#roseGradient)"
                    fillOpacity={0.75}
                    maxBarSize={32}
                    radius={[4, 4, 0, 0]}
                    stackId="a"
                />
            </Recharts.BarChart>
        </ChartContainer>
        <div className="mt-3 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
                <span className="size-2 rounded-full opacity-50" style={{backgroundColor: config.new.color}} />
                <span>New</span>
                <span className="font-medium text-foreground">{formatNumber(totals.new)}</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="size-2 rounded-full opacity-50" style={{backgroundColor: config.cancelled.color}} />
                <span>Cancelled</span>
                <span className="font-medium text-foreground">{formatNumber(totals.cancelled)}</span>
            </div>
        </div>
    </div>
);

/**
 * Render empty state when no data is available.
 */
const renderEmptyState = (range: number) => (
    <div className="py-12">
        <EmptyIndicator
            description={`No paid subscription changes ${getPeriodText(range)}.`}
            title="No paid member changes"
        >
            <LucideIcon.BarChart3 strokeWidth={1.5} />
        </EmptyIndicator>
    </div>
);

const PaidMembersChangeChart: React.FC<PaidMembersChangeChartProps> = ({
    subscriptionData,
    memberData,
    range,
    isLoading
}) => {
    const [selectedResolution, setSelectedResolution] = useState<ResolutionOption>(() =>
        getDefaultResolution(range)
    );

    useEffect(() => {
        setSelectedResolution(getDefaultResolution(range));
    }, [range]);

    const availableResolutions = useMemo(() => getAvailableResolutions(range), [range]);

    const aggregationStrategy = useMemo(
        () => getAggregationStrategyFromResolution(selectedResolution),
        [selectedResolution]
    );

    const paidChangeChartData = useMemo(() => {
        if (subscriptionData && subscriptionData.length > 0) {
            if (range === 1) {
                const today = moment().format('YYYY-MM-DD');
                const todayData = subscriptionData.find(item => item.date === today);
                return [
                    {
                        date: formatDisplayDateWithRange(today, range),
                        rawDate: today,
                        new: todayData?.signups ?? 0,
                        cancelled: -(todayData?.cancellations ?? 0)
                    }
                ];
            }

            const combined = processSubscriptionData(subscriptionData, range, aggregationStrategy);
            const filled = fillMissingDataPoints(combined, range, aggregationStrategy);
            return formatChartData(filled, selectedResolution, range);
        }

        if (!memberData || memberData.length === 0) return [];

        if (range === 1) {
            const today = moment().format('YYYY-MM-DD');
            const todayData = memberData.find(item => item.date === today);
            return [
                {
                    date: formatDisplayDateWithRange(today, range),
                    rawDate: today,
                    new: todayData?.paid_subscribed ?? 0,
                    cancelled: -(todayData?.paid_canceled ?? 0)
                }
            ];
        }

        const combined = processMemberData(memberData, range, aggregationStrategy);
        return formatChartData(combined, selectedResolution, range);
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const paidChangeChartConfig = {
        new: {label: 'New', color: 'hsl(var(--chart-teal))'},
        cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
    } satisfies ChartConfig;

    const totals = useMemo(() => computeTotals(paidChangeChartData), [paidChangeChartData]);

    if (isLoading) return null;

    const hasData = paidChangeChartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);

    return (
        <Card data-testid="paid-members-change-card">
            <CardHeader>
                <div className="flex items-start justify-between gap-1.5">
                    <div className="flex flex-col gap-1.5">
                        <CardTitle>Paid subscriptions</CardTitle>
                        <CardDescription>
                            New and cancelled paid subscriptions {getPeriodText(range)}
                        </CardDescription>
                    </div>
                    {availableResolutions.length > 1 && (
                        <div>
                            <Select
                                value={selectedResolution}
                                onValueChange={value => setSelectedResolution(value as ResolutionOption)}
                            >
                                <SelectTrigger className="w-[110px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent align="end">
                                    {availableResolutions.map(res => (
                                        <SelectItem key={res} value={res}>
                                            {formatResolution(res)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {hasData ? renderChart(paidChangeChartData, paidChangeChartConfig, selectedResolution, range) : renderEmptyState(range)}
            </CardContent>
        </Card>
    );
};

export default PaidMembersChangeChart;