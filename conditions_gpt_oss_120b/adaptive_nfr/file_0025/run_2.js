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
import {determineAggregationStrategy, getPeriodText, sanitizeChartData} from '@src/utils/chart-helpers';

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

type AggregatedItem = {
    date: string;
    signups?: number;
    cancellations?: number;
    paid_subscribed?: number;
    paid_canceled?: number;
};

/**
 * Fill missing dates/periods with zero values.
 */
const fillMissingDataPoints = (
    data: AggregatedItem[],
    dateRange: number,
    overrideStrategy?: 'none' | 'weekly' | 'monthly' | 'monthly-exact'
) => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(item => item.date === today);
        return [{
            date: today,
            signups: todayData?.signups || 0,
            cancellations: todayData?.cancellations || 0
        }];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);
    const dataMap = new Map(data.map(item => [item.date, item]));
    const filled: AggregatedItem[] = [];
    const seen = new Set<string>();

    const iteratePeriod = (start: moment.Moment, unit: moment.unitOfTime.DurationConstructor) => {
        const current = start.clone();
        const end = moment(endDate).startOf(unit);
        while (current.isSameOrBefore(end)) {
            const key = current.format('YYYY-MM-DD');
            if (!seen.has(key)) {
                seen.add(key);
                const existing = dataMap.get(key);
                filled.push(existing ?? {date: key, signups: 0, cancellations: 0});
            }
            current.add(1, unit);
        }
    };

    if (strategy === 'monthly') {
        iteratePeriod(moment(startDate).startOf('month'), 'month');
    } else if (strategy === 'weekly') {
        iteratePeriod(moment(startDate).startOf('week'), 'week');
    } else {
        const current = moment(startDate);
        const end = moment(endDate);
        while (current.isSameOrBefore(end)) {
            const key = current.format('YYYY-MM-DD');
            const existing = dataMap.get(key);
            filled.push(existing ?? {date: key, signups: 0, cancellations: 0});
            current.add(1, 'day');
        }
    }

    return filled;
};

/**
 * Determine actual span for special ranges (e.g., YTD).
 */
const getActualDateSpan = (range: number): number => {
    if (range === -1) {
        const {startDate, endDate} = getRangeDates(range);
        return moment(endDate).diff(moment(startDate), 'days');
    }
    return range;
};

/**
 * Resolve available resolution options based on range.
 */
const getAvailableResolutions = (range: number): ResolutionOption[] => {
    const span = getActualDateSpan(range);
    if (span < 30) return ['daily'];
    if (span >= 91) return ['weekly', 'monthly'];
    return ['daily', 'weekly'];
};

/**
 * Resolve default resolution based on range.
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
const resolutionStrategyMap: Record<ResolutionOption, 'none' | 'weekly' | 'monthly'> = {
    daily: 'none',
    weekly: 'weekly',
    monthly: 'monthly'
};

const getAggregationStrategy = (resolution: ResolutionOption) => resolutionStrategyMap[resolution];

/**
 * Compute effective range for date formatting based on selected resolution.
 */
const computeEffectiveRange = (range: number, resolution: ResolutionOption): number => {
    if (resolution === 'weekly' && range < 91) return 91;
    if (resolution === 'monthly' && range < 365) return 365;
    return range;
};

/**
 * Transform aggregated subscription data into chart rows.
 */
const buildChartRowsFromSubscription = (
    aggregated: AggregatedItem[],
    range: number,
    resolution: ResolutionOption
) => {
    const effectiveRange = computeEffectiveRange(range, resolution);
    return aggregated.map(item => ({
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item.signups ?? 0,
        cancelled: -(item.cancellations ?? 0)
    }));
};

/**
 * Transform aggregated member data into chart rows.
 */
const buildChartRowsFromMember = (
    aggregated: AggregatedItem[],
    range: number,
    resolution: ResolutionOption
) => {
    const effectiveRange = computeEffectiveRange(range, resolution);
    return aggregated.map(item => ({
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item.paid_subscribed ?? 0,
        cancelled: -(item.paid_canceled ?? 0)
    }));
};

/**
 * Combine signups and cancellations (or subscribed/canceled) into a unified array.
 */
const combineAggregatedData = (
    primary: AggregatedItem[],
    secondaryMap: Map<string, AggregatedItem>,
    primaryKey: keyof AggregatedItem,
    secondaryKey: keyof AggregatedItem
) => {
    const combined = primary.map(item => ({
        date: item.date,
        [primaryKey]: item[primaryKey] ?? 0,
        [secondaryKey]: secondaryMap.get(item.date)?.[secondaryKey] ?? 0
    })) as AggregatedItem[];

    const primaryDates = new Set(combined.map(c => c.date));
    secondaryMap.forEach((secItem, date) => {
        if (!primaryDates.has(date)) {
            combined.push({
                date,
                [primaryKey]: 0,
                [secondaryKey]: secItem[secondaryKey] ?? 0
            } as AggregatedItem);
        }
    });

    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return combined;
};

/**
 * Main component.
 */
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

    const aggregationStrategy = useMemo(() => getAggregationStrategy(selectedResolution), [selectedResolution]);

    const paidChangeChartData = useMemo(() => {
        const isToday = range === 1;

        if (subscriptionData && subscriptionData.length) {
            if (isToday) {
                const today = moment().format('YYYY-MM-DD');
                const todayItem = subscriptionData.find(i => i.date === today);
                return [{
                    date: formatDisplayDateWithRange(today, range),
                    rawDate: today,
                    new: todayItem?.signups || 0,
                    cancelled: -(todayItem?.cancellations || 0)
                }];
            }

            const signups = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
            const cancellations = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
            const cancelMap = new Map(cancellations.map(c => [c.date, c]));
            const combined = combineAggregatedData(signups, cancelMap, 'signups', 'cancellations');
            const filled = fillMissingDataPoints(combined, range, aggregationStrategy);
            return buildChartRowsFromSubscription(filled, range, selectedResolution);
        }

        if (!memberData || !memberData.length) {
            return [];
        }

        if (isToday) {
            const today = moment().format('YYYY-MM-DD');
            const todayItem = memberData.find(i => i.date === today);
            return [{
                date: formatDisplayDateWithRange(today, range),
                rawDate: today,
                new: todayItem?.paid_subscribed || 0,
                cancelled: -(todayItem?.paid_canceled || 0)
            }];
        }

        const subscribed = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
        const canceled = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
        const cancelMap = new Map(canceled.map(c => [c.date, c]));
        const combined = combineAggregatedData(subscribed, cancelMap, 'paid_subscribed', 'paid_canceled');
        return buildChartRowsFromMember(combined, range, selectedResolution);
    }, [subscriptionData, memberData, range, aggregationStrategy, selectedResolution]);

    const paidChangeChartConfig = {
        new: {label: 'New', color: 'hsl(var(--chart-teal))'},
        cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
    } satisfies ChartConfig;

    const totals = useMemo(() => {
        const newTotal = paidChangeChartData.reduce((s, i) => s + i.new, 0);
        const cancelledTotal = paidChangeChartData.reduce((s, i) => s + Math.abs(i.cancelled), 0);
        return {new: newTotal, cancelled: cancelledTotal};
    }, [paidChangeChartData]);

    if (isLoading) {
        return null;
    }

    const hasData = paidChangeChartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);

    const formatResolution = (r: ResolutionOption) => r.charAt(0).toUpperCase() + r.slice(1);

    return (
        <Card data-testid='paid-members-change-card'>
            <CardHeader>
                <div className="flex items-start justify-between gap-1.5">
                    <div className='flex flex-col gap-1.5'>
                        <CardTitle>Paid subscriptions</CardTitle>
                        <CardDescription>New and cancelled paid subscriptions {getPeriodText(range)}</CardDescription>
                    </div>
                    {availableResolutions.length > 1 && (
                        <Select value={selectedResolution} onValueChange={v => setSelectedResolution(v as ResolutionOption)}>
                            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                            <SelectContent align='end'>
                                {availableResolutions.map(r => (
                                    <SelectItem key={r} value={r}>{formatResolution(r)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {hasData ? (
                    <div>
                        <ChartContainer className='aspect-auto h-[200px] w-full md:h-[220px] xl:h-[260px]' config={paidChangeChartConfig}>
                            <Recharts.BarChart data={paidChangeChartData} stackOffset='sign'>
                                <defs>
                                    <linearGradient id="tealGradient" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" stopColor={'var(--color-new)'} stopOpacity={0.8} />
                                        <stop offset="100%" stopColor={'var(--color-new)'} stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="roseGradient" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" stopColor={'var(--color-cancelled)'} stopOpacity={0.6} />
                                        <stop offset="100%" stopColor={'var(--color-cancelled)'} stopOpacity={0.8} />
                                    </linearGradient>
                                </defs>
                                <Recharts.CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                                <Recharts.XAxis axisLine={false} dataKey="date" tickFormatter={() => ''} tickLine={false} tickMargin={10} />
                                <Recharts.YAxis
                                    axisLine={false}
                                    tickFormatter={v => formatNumber(v < 0 ? -v : v)}
                                    tickLine={false}
                                />
                                <ChartTooltip
                                    content={<ChartTooltipContent
                                        className='!min-w-[120px] px-3 py-2'
                                        formatter={(value, name, payload, index) => {
                                            const raw = Number(value);
                                            const display = raw === 0 ? '0' : formatNumber(raw < 0 ? -raw : raw);
                                            const net = Number(payload?.payload?.new || 0) + Number(payload?.payload?.cancelled || 0);
                                            const netDisplay = net === 0 ? '0' : (net > 0 ? `+${formatNumber(net)}` : formatNumber(net));
                                            let tooltipDate = payload?.payload?.date;
                                            if (payload?.payload?.rawDate) {
                                                const res = selectedResolution;
                                                const fmtRange = res === 'monthly' ? 366 : res === 'weekly' ? 91 : 30;
                                                tooltipDate = formatDisplayDateWithRange(payload.payload.rawDate, fmtRange);
                                            }
                                            return (
                                                <div className='flex w-full flex-col'>
                                                    {index === 0 && <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>}
                                                    <div className='flex w-full items-center justify-between gap-4'>
                                                        <div className='flex items-center gap-1'>
                                                            <div
                                                                className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                                                                style={{'--color-bg': `var(--color-${name})`} as React.CSSProperties}
                                                            />
                                                            <span className='text-sm text-muted-foreground'>
                                                                {paidChangeChartConfig[name as keyof typeof paidChangeChartConfig]?.label || name}
                                                            </span>
                                                        </div>
                                                        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                                                            {display}
                                                        </div>
                                                    </div>
                                                    {index === 1 && (
                                                        <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                                                            <span className='text-sm text-muted-foreground'>Net change</span>
                                                            <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                                                                {netDisplay}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }}
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
                            <div className='flex items-center gap-2'>
                                <span className='size-2 rounded-full opacity-50' style={{backgroundColor: paidChangeChartConfig.new.color}} />
                                <span>New</span>
                                <span className='font-medium text-foreground'>{formatNumber(totals.new)}</span>
                            </div>
                            <div className='flex items-center gap-2'>
                                <span className='size-2 rounded-full opacity-50' style={{backgroundColor: paidChangeChartConfig.cancelled.color}} />
                                <span>Cancelled</span>
                                <span className='font-medium text-foreground'>{formatNumber(totals.cancelled)}</span>
                            </div>
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