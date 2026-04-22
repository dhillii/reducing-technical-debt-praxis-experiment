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

type ChartRow = {
    date: string;
    rawDate: string;
    new: number;
    cancelled: number;
};

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
            signups: todayData?.signups || 0,
            cancellations: todayData?.cancellations || 0
        }];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);
    const dataMap = new Map(data.map(item => [item.date, item]));
    const filled: {date: string; signups: number; cancellations: number}[] = [];

    const addPeriod = (key: string) => {
        const existing = dataMap.get(key);
        filled.push(existing ?? {date: key, signups: 0, cancellations: 0});
    };

    if (strategy === 'monthly') {
        const cur = moment(startDate).startOf('month');
        const end = moment(endDate).startOf('month');
        while (cur.isSameOrBefore(end)) {
            addPeriod(cur.format('YYYY-MM-DD'));
            cur.add(1, 'month');
        }
    } else if (strategy === 'weekly') {
        const cur = moment(startDate).startOf('week');
        const end = moment(endDate).startOf('week');
        while (cur.isSameOrBefore(end)) {
            addPeriod(cur.format('YYYY-MM-DD'));
            cur.add(1, 'week');
        }
    } else {
        const cur = moment(startDate);
        const end = moment(endDate);
        while (cur.isSameOrBefore(end)) {
            addPeriod(cur.format('YYYY-MM-DD'));
            cur.add(1, 'day');
        }
    }

    return filled;
};

const getActualDateSpan = (range: number) => range === -1
    ? moment(getRangeDates(range).endDate).diff(moment(getRangeDates(range).startDate), 'days')
    : range;

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

const getEffectiveRange = (resolution: ResolutionOption, range: number) => {
    if (resolution === 'weekly' && range < 91) return 91;
    if (resolution === 'monthly' && range < 365) return 365;
    return range;
};

const combineAggregated = (
    primary: {date: string; value: number}[],
    secondary: {date: string; value: number}[]
) => {
    const secondaryMap = new Map(secondary.map(item => [item.date, item.value]));
    const combined = primary.map(p => ({
        date: p.date,
        primary: p.value,
        secondary: secondaryMap.get(p.date) ?? 0
    }));
    const primaryDates = new Set(primary.map(p => p.date));
    secondary.forEach(s => {
        if (!primaryDates.has(s.date)) {
            combined.push({date: s.date, primary: 0, secondary: s.value});
        }
    });
    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return combined;
};

const mapToChartRows = (
    data: {date: string; primary: number; secondary: number}[],
    resolution: ResolutionOption,
    range: number
): ChartRow[] => data.map(item => {
    const effective = getEffectiveRange(resolution, range);
    return {
        date: formatDisplayDateWithRange(item.date, effective),
        rawDate: item.date,
        new: item.primary,
        cancelled: -item.secondary
    };
});

const computeChartData = (
    memberData: PaidMembersChangeChartProps['memberData'],
    subscriptionData: PaidMembersChangeChartProps['subscriptionData'],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    resolution: ResolutionOption
): ChartRow[] => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        if (subscriptionData?.length) {
            const todayData = subscriptionData.find(d => d.date === today);
            return [{
                date: formatDisplayDateWithRange(today, range),
                rawDate: today,
                new: todayData?.signups || 0,
                cancelled: -(todayData?.cancellations || 0)
            }];
        }
        const todayMember = memberData.find(d => d.date === today);
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayMember?.paid_subscribed || 0,
            cancelled: -(todayMember?.paid_canceled || 0)
        }];
    }

    if (subscriptionData?.length) {
        const signups = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
        const cancellations = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
        const combined = combineAggregated(
            signups.map(s => ({date: s.date, value: s.signups})),
            cancellations.map(c => ({date: c.date, value: c.cancellations}))
        );
        const filled = fillMissingDataPoints(combined, range, aggregationStrategy);
        return mapToChartRows(filled, resolution, range);
    }

    const subscribed = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceled = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
    const combined = combineAggregated(
        subscribed.map(s => ({date: s.date, value: s.paid_subscribed ?? 0})),
        canceled.map(c => ({date: c.date, value: c.paid_canceled ?? 0}))
    );
    return mapToChartRows(combined, resolution, range);
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

    const aggregationStrategy = useMemo<'none' | 'weekly' | 'monthly'>(() => {
        switch (selectedResolution) {
            case 'daily': return 'none';
            case 'weekly': return 'weekly';
            case 'monthly': return 'monthly';
        }
    }, [selectedResolution]);

    const chartData = useMemo(() => computeChartData(
        memberData,
        subscriptionData,
        range,
        aggregationStrategy,
        selectedResolution
    ), [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const chartConfig = {
        new: {label: 'New', color: 'hsl(var(--chart-teal))'},
        cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
    } satisfies ChartConfig;

    const totals = useMemo(() => ({
        new: chartData.reduce((s, i) => s + i.new, 0),
        cancelled: chartData.reduce((s, i) => s + Math.abs(i.cancelled), 0)
    }), [chartData]);

    if (isLoading) return null;

    const hasData = chartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);
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
                    <>
                        <ChartContainer className='aspect-auto h-[200px] w-full md:h-[220px] xl:h-[260px]' config={chartConfig}>
                            <Recharts.BarChart data={chartData} stackOffset='sign'>
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
                                            const net = Number(payload?.payload?.new ?? 0) + Number(payload?.payload?.cancelled ?? 0);
                                            const netDisplay = net === 0 ? '0' : (net > 0 ? `+${formatNumber(net)}` : formatNumber(net));
                                            let tooltipDate = payload?.payload?.date;
                                            if (payload?.payload?.rawDate) {
                                                const fmt = selectedResolution === 'monthly' ? 366 : selectedResolution === 'weekly' ? 91 : 30;
                                                tooltipDate = formatDisplayDateWithRange(payload.payload.rawDate, fmt);
                                            }
                                            return (
                                                <div className='flex w-full flex-col'>
                                                    {index === 0 && <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>}
                                                    <div className='flex w-full items-center justify-between gap-4'>
                                                        <div className='flex items-center gap-1'>
                                                            <div className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                                                                style={{'--color-bg': `var(--color-${name})`} as React.CSSProperties}
                                                            />
                                                            <span className='text-sm text-muted-foreground'>
                                                                {chartConfig[name as keyof typeof chartConfig]?.label || name}
                                                            </span>
                                                        </div>
                                                        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">{display}</div>
                                                    </div>
                                                    {index === 1 && (
                                                        <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                                                            <span className='text-sm text-muted-foreground'>Net change</span>
                                                            <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">{netDisplay}</div>
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
                                <Recharts.Bar dataKey="new" fill='url(#tealGradient)' fillOpacity={0.75} maxBarSize={32} minPointSize={3} radius={[4, 4, 0, 0]} stackId="a" />
                                <Recharts.Bar dataKey="cancelled" fill='url(#roseGradient)' fillOpacity={0.75} maxBarSize={32} radius={[4, 4, 0, 0]} stackId="a" />
                            </Recharts.BarChart>
                        </ChartContainer>
                        <div className='mt-3 flex items-center justify-center gap-6 text-sm text-muted-foreground'>
                            <div className='flex items-center gap-2'>
                                <span className='size-2 rounded-full opacity-50' style={{backgroundColor: chartConfig.new.color}} />
                                <span>New</span>
                                <span className='font-medium text-foreground'>{formatNumber(totals.new)}</span>
                            </div>
                            <div className='flex items-center gap-2'>
                                <span className='size-2 rounded-full opacity-50' style={{backgroundColor: chartConfig.cancelled.color}} />
                                <span>Cancelled</span>
                                <span className='font-medium text-foreground'>{formatNumber(totals.cancelled)}</span>
                            </div>
                        </div>
                    </>
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