import React, {useEffect, useMemo, useState, useCallback} from 'react';
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
type ChartRow = {date: string; rawDate: string; new: number; cancelled: number};

/* Helper: fill missing data points */
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

    if (strategy === 'monthly') {
        const cur = moment(startDate).startOf('month');
        const end = moment(endDate).startOf('month');
        while (cur.isSameOrBefore(end)) {
            const key = cur.format('YYYY-MM-DD');
            const existing = dataMap.get(key);
            filled.push(existing ?? {date: key, signups: 0, cancellations: 0});
            cur.add(1, 'month');
        }
    } else if (strategy === 'weekly') {
        const cur = moment(startDate).startOf('week');
        const end = moment(endDate).startOf('week');
        while (cur.isSameOrBefore(end)) {
            const key = cur.format('YYYY-MM-DD');
            const existing = dataMap.get(key);
            filled.push(existing ?? {date: key, signups: 0, cancellations: 0});
            cur.add(1, 'week');
        }
    } else {
        const cur = moment(startDate);
        const end = moment(endDate);
        while (cur.isSameOrBefore(end)) {
            const key = cur.format('YYYY-MM-DD');
            const existing = dataMap.get(key);
            filled.push(existing ?? {date: key, signups: 0, cancellations: 0});
            cur.add(1, 'day');
        }
    }

    return filled;
};

/* Helper: calculate actual span for YTD */
const getActualDateSpan = (range: number): number => {
    if (range === -1) {
        const {startDate, endDate} = getRangeDates(range);
        return moment(endDate).diff(moment(startDate), 'days');
    }
    return range;
};

/* Helper: available resolutions */
const getAvailableResolutions = (range: number): ResolutionOption[] => {
    const span = getActualDateSpan(range);
    if (span < 30) return ['daily'];
    if (span >= 91) return ['weekly', 'monthly'];
    return ['daily', 'weekly'];
};

/* Helper: default resolution */
const getDefaultResolution = (range: number): ResolutionOption => {
    const span = getActualDateSpan(range);
    if (span < 30) return 'daily';
    if (span >= 91) return 'monthly';
    return 'weekly';
};

/* Helper: format resolution label */
const formatResolution = (resolution: ResolutionOption): string =>
    resolution.charAt(0).toUpperCase() + resolution.slice(1);

/* Helper: format numeric tooltip value */
const formatTooltipValue = (raw: number): string => {
    if (raw === 0) return '0';
    return raw < 0 ? formatNumber(-raw) : formatNumber(raw);
};

/* Helper: compute net change string */
const computeNetChange = (newVal: number, cancelledVal: number): string => {
    const net = newVal + cancelledVal;
    if (net === 0) return '0';
    return net > 0 ? `+${formatNumber(net)}` : formatNumber(net);
};

/* Helper: derive tooltip date based on resolution */
const getTooltipDate = (rawDate: string, resolution: ResolutionOption): string => {
    if (resolution === 'monthly') return formatDisplayDateWithRange(rawDate, 366);
    if (resolution === 'weekly') return formatDisplayDateWithRange(rawDate, 91);
    return formatDisplayDateWithRange(rawDate, 30);
};

/* Core: build chart rows from raw data */
const buildChartRows = (
    rawData: {date: string; signups?: number; cancellations?: number; paid_subscribed?: number; paid_canceled?: number}[],
    range: number,
    selectedResolution: ResolutionOption
): ChartRow[] => {
    return rawData.map(item => {
        let effectiveRange = range;
        if (selectedResolution === 'weekly' && range < 91) effectiveRange = 91;
        else if (selectedResolution === 'monthly' && range < 365) effectiveRange = 365;

        const displayDate = formatDisplayDateWithRange(item.date, effectiveRange);
        const newCount = item.signups ?? item.paid_subscribed ?? 0;
        const cancelledCount = -(item.cancellations ?? item.paid_canceled ?? 0);

        return {
            date: displayDate,
            rawDate: item.date,
            new: newCount,
            cancelled: cancelledCount
        };
    });
};

/* Core: compute chart data */
const computeChartData = (
    subscriptionData: {date: string; signups: number; cancellations: number}[] | undefined,
    memberData: {date: string; paid_subscribed?: number; paid_canceled?: number}[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    selectedResolution: ResolutionOption
): ChartRow[] => {
    // Today shortcut
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        if (subscriptionData?.length) {
            const todayItem = subscriptionData.find(i => i.date === today);
            return [{
                date: formatDisplayDateWithRange(today, range),
                rawDate: today,
                new: todayItem?.signups || 0,
                cancelled: -(todayItem?.cancellations || 0)
            }];
        }
        const todayMember = memberData.find(i => i.date === today);
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayMember?.paid_subscribed || 0,
            cancelled: -(todayMember?.paid_canceled || 0)
        }];
    }

    // Use subscription data when present
    if (subscriptionData?.length) {
        const signups = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
        const cancellations = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
        const cancelMap = new Map(cancellations.map(c => [c.date, c]));
        const combined = signups.map(s => ({
            date: s.date,
            signups: s.signups ?? 0,
            cancellations: cancelMap.get(s.date)?.cancellations ?? 0
        }));
        const existingDates = new Set(combined.map(c => c.date));
        cancellations.forEach(c => {
            if (!existingDates.has(c.date)) {
                combined.push({date: c.date, signups: 0, cancellations: c.cancellations ?? 0});
            }
        });
        combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const filled = fillMissingDataPoints(combined, range, aggregationStrategy);
        return buildChartRows(filled, range, selectedResolution);
    }

    // Fallback to member data
    if (!memberData?.length) return [];

    const subscribed = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceled = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
    const cancelMap = new Map(canceled.map(c => [c.date, c]));
    const combined = subscribed.map(s => ({
        date: s.date,
        paid_subscribed: s.paid_subscribed ?? 0,
        paid_canceled: cancelMap.get(s.date)?.paid_canceled ?? 0
    }));
    const existingDates = new Set(combined.map(c => c.date));
    canceled.forEach(c => {
        if (!existingDates.has(c.date)) {
            combined.push({date: c.date, paid_subscribed: 0, paid_canceled: c.paid_canceled ?? 0});
        }
    });
    combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return buildChartRows(combined, range, selectedResolution);
};

/* Core: calculate totals */
const calculateTotals = (data: ChartRow[]) => {
    const totalNew = data.reduce((sum, r) => sum + r.new, 0);
    const totalCancelled = data.reduce((sum, r) => sum + Math.abs(r.cancelled), 0);
    return {new: totalNew, cancelled: totalCancelled};
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
        if (selectedResolution === 'weekly') return 'weekly';
        return 'monthly';
    }, [selectedResolution]);

    const chartData = useMemo(() => computeChartData(
        subscriptionData,
        memberData,
        range,
        aggregationStrategy,
        selectedResolution
    ), [subscriptionData, memberData, range, aggregationStrategy, selectedResolution]);

    const totals = useMemo(() => calculateTotals(chartData), [chartData]);

    const paidChangeChartConfig = {
        new: {label: 'New', color: 'hsl(var(--chart-teal))'},
        cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
    } satisfies ChartConfig;

    const tooltipFormatter = useCallback((
        value: unknown,
        name: string,
        payload: any,
        index: number
    ) => {
        const raw = Number(value);
        const displayValue = formatTooltipValue(raw);
        const newVal = Number(payload?.payload?.new ?? 0);
        const cancelledVal = Number(payload?.payload?.cancelled ?? 0);
        const netChange = computeNetChange(newVal, cancelledVal);
        const tooltipDate = payload?.payload?.rawDate
            ? getTooltipDate(payload.payload.rawDate, selectedResolution)
            : payload?.payload?.date;

        return (
            <div className='flex w-full flex-col'>
                {index === 0 && (
                    <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
                )}
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
                        {displayValue}
                    </div>
                </div>
                {index === 1 && (
                    <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                        <span className='text-sm text-muted-foreground'>Net change</span>
                        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                            {netChange}
                        </div>
                    </div>
                )}
            </div>
        );
    }, [selectedResolution, paidChangeChartConfig]);

    if (isLoading) {
        return null;
    }

    const hasData = chartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);

    return (
        <Card data-testid='paid-members-change-card'>
            <CardHeader>
                <div className="flex items-start justify-between gap-1.5">
                    <div className='flex flex-col gap-1.5'>
                        <CardTitle>Paid subscriptions</CardTitle>
                        <CardDescription>New and cancelled paid subscriptions {getPeriodText(range)}</CardDescription>
                    </div>
                    {availableResolutions.length > 1 && (
                        <Select value={selectedResolution} onValueChange={value => setSelectedResolution(value as ResolutionOption)}>
                            <SelectTrigger className="w-[110px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent align='end'>
                                {availableResolutions.map(res => (
                                    <SelectItem key={res} value={res}>{formatResolution(res)}</SelectItem>
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
                                    tickFormatter={value => formatNumber(Math.abs(value as number))}
                                    tickLine={false}
                                />
                                <ChartTooltip
                                    content={<ChartTooltipContent formatter={tooltipFormatter} hideLabel cursor={false} isAnimationActive={false} position={{y: 10}} />}
                                />
                                <Recharts.Bar dataKey="new" fill='url(#tealGradient)' fillOpacity={0.75} maxBarSize={32} minPointSize={3} radius={[4, 4, 0, 0]} stackId="a" activeBar={{fillOpacity: 1}} />
                                <Recharts.Bar dataKey="cancelled" fill='url(#roseGradient)' fillOpacity={0.75} maxBarSize={32} radius={[4, 4, 0, 0]} stackId="a" activeBar={{fillOpacity: 1}} />
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