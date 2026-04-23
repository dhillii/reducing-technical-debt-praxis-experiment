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
    const filledData: {date: string; signups: number; cancellations: number}[] = [];

    const addPeriod = (key: string) => {
        const existing = dataMap.get(key);
        filledData.push(existing ?? {date: key, signups: 0, cancellations: 0});
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

type ChartRow = {
    date: string;
    rawDate: string;
    new: number;
    cancelled: number;
};

const buildChartRows = (
    data: {date: string; signups: number; cancellations: number}[],
    range: number,
    selectedResolution: ResolutionOption
): ChartRow[] => {
    const filled = fillMissingDataPoints(data, range, selectedResolution);
    return filled.map(item => {
        let effectiveRange = range;
        if (selectedResolution === 'weekly' && range < 91) effectiveRange = 91;
        if (selectedResolution === 'monthly' && range < 365) effectiveRange = 365;
        return {
            date: formatDisplayDateWithRange(item.date, effectiveRange),
            rawDate: item.date,
            new: item.signups,
            cancelled: -(item.cancellations)
        };
    });
};

const computePaidChangeChartData = (
    subscriptionData: PaidMembersChangeChartProps['subscriptionData'],
    memberData: PaidMembersChangeChartProps['memberData'],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    selectedResolution: ResolutionOption
): ChartRow[] => {
    const today = moment().format('YYYY-MM-DD');

    const handleToday = (newVal: number, cancelVal: number) => [{
        date: formatDisplayDateWithRange(today, range),
        rawDate: today,
        new: newVal,
        cancelled: -(cancelVal)
    }];

    if (subscriptionData?.length) {
        if (range === 1) {
            const todayData = subscriptionData.find(i => i.date === today);
            return handleToday(todayData?.signups || 0, todayData?.cancellations || 0);
        }

        const signups = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
        const cancellations = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
        const cancelMap = new Map(cancellations.map(c => [c.date, c.cancellations]));

        const combined = signups.map(s => ({
            date: s.date,
            signups: s.signups,
            cancellations: cancelMap.get(s.date) ?? 0
        }));

        cancellations.forEach(c => {
            if (!combined.some(d => d.date === c.date)) {
                combined.push({date: c.date, signups: 0, cancellations: c.cancellations});
            }
        });

        combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return buildChartRows(combined, range, selectedResolution);
    }

    if (!memberData?.length) return [];

    if (range === 1) {
        const todayData = memberData.find(i => i.date === today);
        return handleToday(todayData?.paid_subscribed || 0, todayData?.paid_canceled || 0);
    }

    const subscribed = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceled = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
    const cancelMap = new Map(canceled.map(c => [c.date, c.paid_canceled]));

    const combined = subscribed.map(s => ({
        date: s.date,
        signups: s.paid_subscribed ?? 0,
        cancellations: cancelMap.get(s.date) ?? 0
    }));

    canceled.forEach(c => {
        if (!combined.some(d => d.date === c.date)) {
            combined.push({date: c.date, signups: 0, cancellations: c.paid_canceled ?? 0});
        }
    });

    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return buildChartRows(combined, range, selectedResolution);
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
        if (selectedResolution === 'daily') return 'none';
        return selectedResolution;
    }, [selectedResolution]);

    const paidChangeChartData = useMemo(() => computePaidChangeChartData(
        subscriptionData,
        memberData,
        range,
        aggregationStrategy,
        selectedResolution
    ), [subscriptionData, memberData, range, aggregationStrategy, selectedResolution]);

    const paidChangeChartConfig = {
        new: {label: 'New', color: 'hsl(var(--chart-teal))'},
        cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
    } satisfies ChartConfig;

    const totals = useMemo(() => {
        const newTotal = paidChangeChartData.reduce((a, b) => a + b.new, 0);
        const cancelledTotal = paidChangeChartData.reduce((a, b) => a + Math.abs(b.cancelled), 0);
        return {new: newTotal, cancelled: cancelledTotal};
    }, [paidChangeChartData]);

    if (isLoading) return null;

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
                                            const display = raw === 0 ? '0' : formatNumber(Math.abs(raw));
                                            const net = Number(payload?.payload?.new ?? 0) + Number(payload?.payload?.cancelled ?? 0);
                                            const netDisplay = net === 0 ? '0' : (net > 0 ? `+${formatNumber(net)}` : formatNumber(net));
                                            let tooltipDate = payload?.payload?.date;
                                            if (payload?.payload?.rawDate) {
                                                const fmtRange = selectedResolution === 'monthly' ? 366 : selectedResolution === 'weekly' ? 91 : 30;
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