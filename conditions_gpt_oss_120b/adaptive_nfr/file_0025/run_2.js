import React, {useEffect, useMemo, useState} from 'react';
import moment from 'moment';
import {Card, CardContent, CardDescription, CardHeader, CardTitle, ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, EmptyIndicator, LucideIcon, Recharts, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, formatDisplayDateWithRange, formatNumber, getRangeDates} from '@tryghost/shade';
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

type DataPoint = {date: string; signups: number; cancellations: number};
type MemberPoint = {date: string; paid_subscribed?: number; paid_canceled?: number};
type ChartItem = {date: string; rawDate: string; new: number; cancelled: number};

type ResolutionOption = 'daily' | 'weekly' | 'monthly';

const fillMissingDataPoints = (data: DataPoint[], dateRange: number, overrideStrategy?: 'none' | 'weekly' | 'monthly' | 'monthly-exact') => {
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
    const filledData: DataPoint[] = [];
    const seenKeys = new Set<string>();

    if (strategy === 'monthly') {
        const currentPeriod = moment(startDate).startOf('month');
        const endPeriod = moment(endDate).startOf('month');
        while (currentPeriod.isSameOrBefore(endPeriod)) {
            const dateKey = currentPeriod.format('YYYY-MM-DD');
            if (!seenKeys.has(dateKey)) {
                seenKeys.add(dateKey);
                const existing = dataMap.get(dateKey);
                filledData.push(existing ?? {date: dateKey, signups: 0, cancellations: 0});
            }
            currentPeriod.add(1, 'month');
        }
    } else if (strategy === 'weekly') {
        const currentPeriod = moment(startDate).startOf('week');
        const endPeriod = moment(endDate).startOf('week');
        while (currentPeriod.isSameOrBefore(endPeriod)) {
            const dateKey = currentPeriod.format('YYYY-MM-DD');
            if (!seenKeys.has(dateKey)) {
                seenKeys.add(dateKey);
                const existing = dataMap.get(dateKey);
                filledData.push(existing ?? {date: dateKey, signups: 0, cancellations: 0});
            }
            currentPeriod.add(1, 'week');
        }
    } else {
        const currentDate = moment(startDate);
        const endMoment = moment(endDate);
        while (currentDate.isSameOrBefore(endMoment)) {
            const dateKey = currentDate.format('YYYY-MM-DD');
            const existing = dataMap.get(dateKey);
            filledData.push(existing ?? {date: dateKey, signups: 0, cancellations: 0});
            currentDate.add(1, 'day');
        }
    }

    return filledData;
};

const getActualDateSpan = (range: number): number => {
    if (range === -1) {
        const {startDate, endDate} = getRangeDates(range);
        return moment(endDate).diff(moment(startDate), 'days');
    }
    return range;
};

const getAvailableResolutions = (range: number): ResolutionOption[] => {
    const span = getActualDateSpan(range);
    if (span < 30) return ['daily'];
    return span >= 91 ? ['weekly', 'monthly'] : ['daily', 'weekly'];
};

const getDefaultResolution = (range: number): ResolutionOption => {
    const span = getActualDateSpan(range);
    if (span < 30) return 'daily';
    return span >= 91 ? 'monthly' : 'weekly';
};

const aggregationStrategyMap: Record<ResolutionOption, 'none' | 'weekly' | 'monthly'> = {
    daily: 'none',
    weekly: 'weekly',
    monthly: 'monthly'
};

const getEffectiveRange = (range: number, resolution: ResolutionOption): number => {
    if (resolution === 'weekly' && range < 91) return 91;
    if (resolution === 'monthly' && range < 365) return 365;
    return range;
};

/** Transform aggregated subscription data into chart items */
function buildChartFromSubscription(combined: DataPoint[], range: number, resolution: ResolutionOption): ChartItem[] {
    return combined.map(item => {
        const effective = getEffectiveRange(range, resolution);
        return {
            date: formatDisplayDateWithRange(item.date, effective),
            rawDate: item.date,
            new: item.signups || 0,
            cancelled: -(item.cancellations || 0)
        };
    });
}

/** Transform aggregated member data into chart items */
function buildChartFromMember(combined: MemberPoint[], range: number, resolution: ResolutionOption): ChartItem[] {
    return combined.map(item => {
        const effective = getEffectiveRange(range, resolution);
        return {
            date: formatDisplayDateWithRange(item.date, effective),
            rawDate: item.date,
            new: item.paid_subscribed || 0,
            cancelled: -(item.paid_canceled || 0)
        };
    });
}

/** Compute chart data when subscription data is available */
function computeSubscriptionChartData(
    subscriptionData: DataPoint[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    resolution: ResolutionOption
): ChartItem[] {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = subscriptionData.find(item => item.date === today);
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayData?.signups || 0,
            cancelled: -(todayData?.cancellations || 0)
        }];
    }

    const signups = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
    const cancellations = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
    const cancelMap = new Map(cancellations.map(c => [c.date, c]));

    const combined: DataPoint[] = signups.map(s => ({
        date: s.date,
        signups: s.signups || 0,
        cancellations: cancelMap.get(s.date)?.cancellations || 0
    }));

    const cancelDates = new Set(combined.map(c => c.date));
    cancellations.forEach(c => {
        if (!cancelDates.has(c.date)) {
            combined.push({date: c.date, signups: 0, cancellations: c.cancellations || 0});
        }
    });

    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const filled = fillMissingDataPoints(combined, range, aggregationStrategy);
    return buildChartFromSubscription(filled, range, resolution);
}

/** Compute chart data when only member data is available */
function computeMemberChartData(
    memberData: MemberPoint[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    resolution: ResolutionOption
): ChartItem[] {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = memberData.find(item => item.date === today);
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayData?.paid_subscribed || 0,
            cancelled: -(todayData?.paid_canceled || 0)
        }];
    }

    const subscribed = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceled = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
    const cancelMap = new Map(canceled.map(c => [c.date, c]));

    const combined: MemberPoint[] = subscribed.map(s => ({
        date: s.date,
        paid_subscribed: s.paid_subscribed || 0,
        paid_canceled: cancelMap.get(s.date)?.paid_canceled || 0
    }));

    const subDates = new Set(combined.map(c => c.date));
    canceled.forEach(c => {
        if (!subDates.has(c.date)) {
            combined.push({date: c.date, paid_subscribed: 0, paid_canceled: c.paid_canceled || 0});
        }
    });

    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return buildChartFromMember(combined, range, resolution);
}

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
            return computeSubscriptionChartData(subscriptionData, range, aggregationStrategy, selectedResolution);
        }
        if (!memberData || memberData.length === 0) {
            return [];
        }
        return computeMemberChartData(memberData, range, aggregationStrategy, selectedResolution);
    }, [subscriptionData, memberData, range, aggregationStrategy, selectedResolution]);

    const paidChangeChartConfig = {
        new: {label: 'New', color: 'hsl(var(--chart-teal))'},
        cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
    } satisfies ChartConfig;

    const totals = useMemo(() => {
        const newTotal = paidChangeChartData.reduce((sum, item) => sum + item.new, 0);
        const cancelledTotal = paidChangeChartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0);
        return {new: newTotal, cancelled: cancelledTotal};
    }, [paidChangeChartData]);

    if (isLoading) {
        return null;
    }

    const hasData = paidChangeChartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);

    const formatResolution = (resolution: ResolutionOption): string =>
        resolution.charAt(0).toUpperCase() + resolution.slice(1);

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
                            <Select value={selectedResolution} onValueChange={value => setSelectedResolution(value as ResolutionOption)}>
                                <SelectTrigger className="w-[110px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent align='end'>
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
                                <Recharts.XAxis axisLine={false} dataKey="date" tickFormatter={() => ('')} tickLine={false} tickMargin={10} />
                                <Recharts.YAxis
                                    axisLine={false}
                                    tickFormatter={value => value < 0 ? formatNumber(value * -1) : formatNumber(value)}
                                    tickLine={false}
                                />
                                <ChartTooltip
                                    content={<ChartTooltipContent
                                        className='!min-w-[120px] px-3 py-2'
                                        formatter={(value, name, payload, index) => {
                                            const raw = Number(value);
                                            const display = raw === 0 ? '0' : raw < 0 ? formatNumber(raw * -1) : formatNumber(raw);
                                            const net = Number(payload?.payload?.new || 0) + Number(payload?.payload?.cancelled || 0);
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
                                                                {netFormatted}
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
                                <Recharts.Bar activeBar={{fillOpacity: 1}} dataKey="new" fill='url(#tealGradient)' fillOpacity={0.75} maxBarSize={32} minPointSize={3} radius={[4, 4, 0, 0]} stackId="a" />
                                <Recharts.Bar activeBar={{fillOpacity: 1}} dataKey="cancelled" fill='url(#roseGradient)' fillOpacity={0.75} maxBarSize={32} radius={[4, 4, 0, 0]} stackId="a" />
                            </Recharts.BarChart>
                        </ChartContainer>
                        <div className='mt-3 flex items-center justify-center gap-6 text-sm text-muted-foreground'>
                            <div className='flex items-center gap-2'>
                                <span className='size-2 rounded-full opacity-50' style={{backgroundColor: paidChangeChartConfig.new.color}}></span>
                                <span>New</span>
                                <span className='font-medium text-foreground'>{formatNumber(totals.new)}</span>
                            </div>
                            <div className='flex items-center gap-2'>
                                <span className='size-2 rounded-full opacity-50' style={{backgroundColor: paidChangeChartConfig.cancelled.color}}></span>
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