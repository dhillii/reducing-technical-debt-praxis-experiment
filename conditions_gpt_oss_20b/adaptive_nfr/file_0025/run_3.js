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

type SubscriptionRecord = {date: string; signups: number; cancellations: number};
type MemberRecord = {date: string; paid_subscribed?: number; paid_canceled?: number};

type PaidMembersChangeChartProps = {
    subscriptionData?: SubscriptionRecord[];
    memberData: MemberRecord[];
    range: number;
    isLoading: boolean;
};

type ResolutionOption = 'daily' | 'weekly' | 'monthly';

/** Helper to fill missing data points with zeros */
const fillMissingDataPoints = (
    data: {date: string; signups: number; cancellations: number}[],
    dateRange: number,
    overrideStrategy?: 'none' | 'weekly' | 'monthly' | 'monthly-exact'
) => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(item => item.date === today);
        return [{
            date: today,
            signups: todayData?.signups ?? 0,
            cancellations: todayData?.cancellations ?? 0
        }];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);

    const dataMap = new Map(data.map(item => [item.date, item]));
    const filledData: {date: string; signups: number; cancellations: number}[] = [];
    const seenKeys = new Set<string>();

    const iteratePeriod = (start: moment.Moment, end: moment.Moment, step: 'month' | 'week' | 'day') => {
        let current = start.clone();
        while (current.isSameOrBefore(end)) {
            const key = current.format('YYYY-MM-DD');
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                const existing = dataMap.get(key);
                if (existing) {
                    filledData.push(existing);
                } else {
                    filledData.push({date: key, signups: 0, cancellations: 0});
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

/** Determine actual date span for YTD ranges */
const getActualDateSpan = (range: number) => {
    if (range === -1) {
        const {startDate, endDate} = getRangeDates(range);
        return moment(endDate).diff(moment(startDate), 'days');
    }
    return range;
};

/** Available resolutions based on range */
const getAvailableResolutions = (range: number): ResolutionOption[] => {
    const span = getActualDateSpan(range);
    if (span < 30) return ['daily'];
    if (span >= 91) return ['weekly', 'monthly'];
    return ['daily', 'weekly'];
};

/** Default resolution for a range */
const getDefaultResolution = (range: number): ResolutionOption => {
    const span = getActualDateSpan(range);
    if (span < 30) return 'daily';
    if (span >= 91) return 'monthly';
    return 'weekly';
};

/** Map resolution to aggregation strategy */
const aggregationStrategyMap = {
    daily: 'none' as const,
    weekly: 'weekly' as const,
    monthly: 'monthly' as const
};

/** Compute effective range for formatting based on resolution */
const getEffectiveRange = (resolution: ResolutionOption, range: number) => {
    if (resolution === 'weekly' && range < 91) return 91;
    if (resolution === 'monthly' && range < 365) return 365;
    return range;
};

/** Format a single data item for chart */
const formatChartItem = (
    item: {date: string; signups: number; cancellations: number},
    resolution: ResolutionOption,
    range: number
) => {
    const effectiveRange = getEffectiveRange(resolution, range);
    return {
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item.signups,
        cancelled: -item.cancellations
    };
};

/** Combine signups and cancellations into unified array */
const combineData = (
    signups: {date: string; signups: number}[],
    cancellations: {date: string; cancellations: number}[]
) => {
    const map = new Map(signups.map(s => [s.date, {date: s.date, signups: s.signups, cancellations: 0}]));
    cancellations.forEach(c => {
        const existing = map.get(c.date);
        if (existing) {
            existing.cancellations = c.cancellations;
        } else {
            map.set(c.date, {date: c.date, signups: 0, cancellations: c.cancellations});
        }
    });
    return Array.from(map.values());
};

/** Process subscription data */
const processSubscriptionData = (
    data: SubscriptionRecord[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    resolution: ResolutionOption
) => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(d => d.date === today);
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayData?.signups ?? 0,
            cancelled: -(todayData?.cancellations ?? 0)
        }];
    }

    const signups = sanitizeChartData(data, range, 'signups', 'sum', aggregationStrategy);
    const cancellations = sanitizeChartData(data, range, 'cancellations', 'sum', aggregationStrategy);

    const combined = combineData(
        signups.map(s => ({date: s.date, signups: s.signups ?? 0})),
        cancellations.map(c => ({date: c.date, cancellations: c.cancellations ?? 0}))
    );

    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const filled = fillMissingDataPoints(combined, range, aggregationStrategy);

    return filled.map(item => formatChartItem(item, resolution, range));
};

/** Process member data */
const processMemberData = (
    data: MemberRecord[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    resolution: ResolutionOption
) => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(d => d.date === today);
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayData?.paid_subscribed ?? 0,
            cancelled: -(todayData?.paid_canceled ?? 0)
        }];
    }

    const subscribed = sanitizeChartData(data, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceled = sanitizeChartData(data, range, 'paid_canceled', 'sum', aggregationStrategy);

    const combined = combineData(
        subscribed.map(s => ({date: s.date, signups: s.paid_subscribed ?? 0})),
        canceled.map(c => ({date: c.date, cancellations: c.paid_canceled ?? 0}))
    );

    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const filled = fillMissingDataPoints(
        combined.map(item => ({
            date: item.date,
            signups: item.signups,
            cancellations: item.cancellations
        })),
        range,
        aggregationStrategy
    );

    return filled.map(item => formatChartItem(item, resolution, range));
};

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

    const aggregationStrategy = useMemo(() => aggregationStrategyMap[selectedResolution], [selectedResolution]);

    const paidChangeChartData = useMemo(() => {
        if (subscriptionData && subscriptionData.length > 0) {
            return processSubscriptionData(subscriptionData, range, aggregationStrategy, selectedResolution);
        }
        return processMemberData(memberData, range, aggregationStrategy, selectedResolution);
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const paidChangeChartConfig: ChartConfig = {
        new: {label: 'New', color: 'hsl(var(--chart-teal))'},
        cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
    };

    const totals = useMemo(() => {
        const totalNew = paidChangeChartData.reduce((sum, item) => sum + item.new, 0);
        const totalCancelled = paidChangeChartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0);
        return {new: totalNew, cancelled: totalCancelled};
    }, [paidChangeChartData]);

    if (isLoading) return null;

    const hasData = paidChangeChartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);

    const formatResolution = (resolution: ResolutionOption) => resolution.charAt(0).toUpperCase() + resolution.slice(1);

    return (
        <Card data-testid='paid-members-change-card'>
            <CardHeader>
                <div className="flex items-start justify-between gap-1.5">
                    <div className='flex flex-col gap-1.5'>
                        <CardTitle>Paid subscriptions</CardTitle>
                        <CardDescription>New and cancelled paid subscriptions {getPeriodText(range)}</CardDescription>
                    </div>
                    {availableResolutions.length > 1 && (
                        <div>
                            <Select value={selectedResolution} onValueChange={v => setSelectedResolution(v as ResolutionOption)}>
                                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                                <SelectContent align='end'>
                                    {availableResolutions.map(r => (
                                        <SelectItem key={r} value={r}>{formatResolution(r)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
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
                                </defs>
                                <defs>
                                    <linearGradient id="roseGradient" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" stopColor={'var(--color-cancelled)'} stopOpacity={0.6} />
                                        <stop offset="100%" stopColor={'var(--color-cancelled)'} stopOpacity={0.8} />
                                    </linearGradient>
                                </defs>
                                <Recharts.CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                                <Recharts.XAxis axisLine={false} dataKey="date" tickFormatter={() => ''} tickLine={false} tickMargin={10} />
                                <Recharts.YAxis axisLine={false} tickFormatter={v => v < 0 ? formatNumber(v * -1) : formatNumber(v)} tickLine={false} />
                                <ChartTooltip
                                    content={
                                        <ChartTooltipContent
                                            className='!min-w-[120px] px-3 py-2'
                                            formatter={(value, name, payload, index) => {
                                                const rawValue = Number(value);
                                                const displayValue = rawValue === 0 ? '0' : (rawValue < 0 ? formatNumber(rawValue * -1) : formatNumber(rawValue));
                                                const newVal = Number(payload?.payload?.new ?? 0);
                                                const cancelledVal = Number(payload?.payload?.cancelled ?? 0);
                                                const net = newVal + cancelledVal;
                                                const netFormatted = net === 0 ? '0' : (net > 0 ? `+${formatNumber(net)}` : formatNumber(net));
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
                                                    <div className='flex w-full flex-col'>
                                                        {index === 0 && <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>}
                                                        <div className='flex w-full items-center justify-between gap-4'>
                                                            <div className='flex items-center gap-1'>
                                                                <div className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50" style={{'--color-bg': `var(--color-${name})` as React.CSSProperties}} />
                                                                <span className='text-sm text-muted-foreground'>{paidChangeChartConfig[name as keyof typeof paidChangeChartConfig]?.label ?? name}</span>
                                                            </div>
                                                            <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">{displayValue}</div>
                                                        </div>
                                                        {index === 1 && (
                                                            <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                                                                <span className='text-sm text-muted-foreground'>Net change</span>
                                                                <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">{netFormatted}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }}
                                            hideLabel
                                        />
                                    }
                                    cursor={false}
                                    isAnimationActive={false}
                                    position={{y: 10}}
                                />
                                <Recharts.Bar dataKey="new" fill='url(#tealGradient)' fillOpacity={0.75} maxBarSize={32} minPointSize={3} radius={[4, 4, 0, 0]} stackId="a" />
                                <Recharts.Bar dataKey="cancelled" fill='url(#roseGradient)' fillOpacity={0.75} maxBarSize={32} radius={[4, 4, 0, 0]} stackId="a" />
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
                        <EmptyIndicator description={`No paid subscription changes ${getPeriodText(range)}.`} title="No paid member changes">
                            <LucideIcon.BarChart3 strokeWidth={1.5} />
                        </EmptyIndicator>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default PaidMembersChangeChart;