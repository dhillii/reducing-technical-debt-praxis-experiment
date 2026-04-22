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

/** Fill missing dates with zero values based on aggregation strategy */
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
    const seen = new Set<string>();

    const pushIfMissing = (key: string) => {
        if (seen.has(key)) return;
        seen.add(key);
        const existing = dataMap.get(key);
        filled.push(existing ?? {date: key, signups: 0, cancellations: 0});
    };

    if (strategy === 'monthly') {
        const cur = moment(startDate).startOf('month');
        const end = moment(endDate).startOf('month');
        while (cur.isSameOrBefore(end)) {
            pushIfMissing(cur.format('YYYY-MM-DD'));
            cur.add(1, 'month');
        }
    } else if (strategy === 'weekly') {
        const cur = moment(startDate).startOf('week');
        const end = moment(endDate).startOf('week');
        while (cur.isSameOrBefore(end)) {
            pushIfMissing(cur.format('YYYY-MM-DD'));
            cur.add(1, 'week');
        }
    } else {
        const cur = moment(startDate);
        const end = moment(endDate);
        while (cur.isSameOrBefore(end)) {
            pushIfMissing(cur.format('YYYY-MM-DD'));
            cur.add(1, 'day');
        }
    }

    return filled;
};

/** Resolve actual day span for special ranges (e.g., YTD) */
const getActualDateSpan = (range: number): number => {
    if (range === -1) {
        const {startDate, endDate} = getRangeDates(range);
        return moment(endDate).diff(moment(startDate), 'days');
    }
    return range;
};

/** Determine which resolution options are available for a given range */
const getAvailableResolutions = (range: number): ResolutionOption[] => {
    const span = getActualDateSpan(range);
    if (span < 30) return ['daily'];
    if (span >= 91) return ['weekly', 'monthly'];
    return ['daily', 'weekly'];
};

/** Default resolution based on range */
const getDefaultResolution = (range: number): ResolutionOption => {
    const span = getActualDateSpan(range);
    if (span < 30) return 'daily';
    if (span >= 91) return 'monthly';
    return 'weekly';
};

/** Map resolution to aggregation strategy */
const resolutionStrategyMap: Record<ResolutionOption, 'none' | 'weekly' | 'monthly'> = {
    daily: 'none',
    weekly: 'weekly',
    monthly: 'monthly'
};

/** Compute effective range for date formatting based on selected resolution */
const getEffectiveRange = (selectedResolution: ResolutionOption, range: number): number => {
    if (selectedResolution === 'weekly' && range < 91) return 91;
    if (selectedResolution === 'monthly' && range < 365) return 365;
    return range;
};

/** Build chart data from generic source */
const buildChartData = (
    source: any[],
    range: number,
    selectedResolution: ResolutionOption,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    valueKey: string,
    cancelKey: string
) => {
    const aggregated = sanitizeChartData(source, range, valueKey, 'sum', aggregationStrategy);
    const cancelAggregated = sanitizeChartData(source, range, cancelKey, 'sum', aggregationStrategy);
    const cancelMap = new Map(cancelAggregated.map(c => [c.date, c]));

    const combined = aggregated.map(item => ({
        date: item.date,
        value: item[valueKey] ?? 0,
        cancel: cancelMap.get(item.date)?.[cancelKey] ?? 0
    }));

    const existingDates = new Set(combined.map(c => c.date));
    cancelAggregated.forEach(c => {
        if (!existingDates.has(c.date)) {
            combined.push({
                date: c.date,
                value: 0,
                cancel: c[cancelKey] ?? 0
            });
        }
    });

    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const filled = fillMissingDataPoints(
        combined.map(c => ({
            date: c.date,
            signups: c.value,
            cancellations: c.cancel
        })),
        range,
        aggregationStrategy
    );

    return filled.map(item => ({
        date: formatDisplayDateWithRange(item.date, getEffectiveRange(selectedResolution, range)),
        rawDate: item.date,
        new: item.signups,
        cancelled: -(item.cancellations)
    }));
};

/** Extract today's single‑day data */
const getTodayData = (data: any[], range: number, valueKey: string, cancelKey: string) => {
    const today = moment().format('YYYY-MM-DD');
    const todayItem = data.find(item => item.date === today);
    return [{
        date: formatDisplayDateWithRange(today, range),
        rawDate: today,
        new: todayItem?.[valueKey] ?? 0,
        cancelled: -(todayItem?.[cancelKey] ?? 0)
    }];
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

    const aggregationStrategy = useMemo(() => resolutionStrategyMap[selectedResolution], [selectedResolution]);

    const paidChangeChartData = useMemo(() => {
        if (subscriptionData && subscriptionData.length) {
            if (range === 1) {
                return getTodayData(subscriptionData, range, 'signups', 'cancellations');
            }
            return buildChartData(
                subscriptionData,
                range,
                selectedResolution,
                aggregationStrategy,
                'signups',
                'cancellations'
            );
        }

        if (!memberData || memberData.length === 0) {
            return [];
        }

        if (range === 1) {
            return getTodayData(memberData, range, 'paid_subscribed', 'paid_canceled');
        }

        return buildChartData(
            memberData,
            range,
            selectedResolution,
            aggregationStrategy,
            'paid_subscribed',
            'paid_canceled'
        );
    }, [
        subscriptionData,
        memberData,
        range,
        selectedResolution,
        aggregationStrategy
    ]);

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