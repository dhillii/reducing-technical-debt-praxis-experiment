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

type ResolutionOption = 'daily' | 'weekly' | 'monthly';

type ChartDataPoint = {
    date: string;
    rawDate: string;
    new: number;
    cancelled: number;
};

// Helper function to fill missing data points with zeros
const fillMissingDataPoints = (data: {date: string; signups: number; cancellations: number}[], dateRange: number, overrideStrategy?: 'none' | 'weekly' | 'monthly' | 'monthly-exact') => {
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
    const seenKeys = new Set<string>();

    if (strategy === 'monthly') {
        fillPeriodData(filledData, seenKeys, dataMap, startDate, endDate, 'month');
    } else if (strategy === 'weekly') {
        fillPeriodData(filledData, seenKeys, dataMap, startDate, endDate, 'week');
    } else {
        fillDailyData(filledData, dataMap, startDate, endDate);
    }

    return filledData;
};

// Helper to fill data for monthly or weekly periods
const fillPeriodData = (filledData: {date: string; signups: number; cancellations: number}[], seenKeys: Set<string>, dataMap: Map<string, {date: string; signups: number; cancellations: number}>, startDate: string, endDate: string, period: 'month' | 'week') => {
    const currentPeriod = moment(startDate).startOf(period);
    const endPeriod = moment(endDate).startOf(period);

    while (currentPeriod.isSameOrBefore(endPeriod)) {
        const dateKey = currentPeriod.format('YYYY-MM-DD');
        if (!seenKeys.has(dateKey)) {
            seenKeys.add(dateKey);
            const existingData = dataMap.get(dateKey);
            filledData.push(existingData || {
                date: dateKey,
                signups: 0,
                cancellations: 0
            });
        }
        currentPeriod.add(1, period);
    }
};

// Helper to fill daily data
const fillDailyData = (filledData: {date: string; signups: number; cancellations: number}[], dataMap: Map<string, {date: string; signups: number; cancellations: number}>, startDate: string, endDate: string) => {
    const currentDate = moment(startDate);
    const endMoment = moment(endDate);

    while (currentDate.isSameOrBefore(endMoment)) {
        const dateKey = currentDate.format('YYYY-MM-DD');
        const existingData = dataMap.get(dateKey);
        filledData.push(existingData || {
            date: dateKey,
            signups: 0,
            cancellations: 0
        });
        currentDate.add(1, 'day');
    }
};

// Helper to calculate actual date span for YTD ranges
const getActualDateSpan = (range: number): number => {
    if (range === -1) {
        const {startDate, endDate} = getRangeDates(range);
        return moment(endDate).diff(moment(startDate), 'days');
    }
    return range;
};

// Helper to determine available resolutions based on range
const getAvailableResolutions = (range: number): ResolutionOption[] => {
    const actualSpan = getActualDateSpan(range);

    if (actualSpan < 30) {
        return ['daily'];
    } else if (actualSpan >= 91) {
        return ['weekly', 'monthly'];
    } else {
        return ['daily', 'weekly'];
    }
};

// Helper to get default resolution for a range
const getDefaultResolution = (range: number): ResolutionOption => {
    const actualSpan = getActualDateSpan(range);

    if (actualSpan < 30) {
        return 'daily';
    } else if (actualSpan >= 91) {
        return 'monthly';
    } else {
        return 'weekly';
    }
};

// Helper to get effective range for date formatting
const getEffectiveRange = (range: number, selectedResolution: ResolutionOption): number => {
    if (selectedResolution === 'weekly' && range < 91) {
        return 91;
    } else if (selectedResolution === 'monthly' && range < 365) {
        return 365;
    }
    return range;
};

// Helper to combine aggregated subscription data
const combineAggregatedData = (signupsData: any[], cancellationsData: any[]): {date: string; signups: number; cancellations: number}[] => {
    const cancellationsMap = new Map(cancellationsData.map(c => [c.date, c]));
    const combinedData = signupsData.map(item => ({
        date: item.date,
        signups: item.signups || 0,
        cancellations: cancellationsMap.get(item.date)?.cancellations || 0
    }));

    const combinedDatesSet = new Set(combinedData.map(item => item.date));
    cancellationsData.forEach((cancelItem) => {
        if (!combinedDatesSet.has(cancelItem.date)) {
            combinedData.push({
                date: cancelItem.date,
                signups: 0,
                cancellations: cancelItem.cancellations || 0
            });
        }
    });

    combinedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return combinedData;
};

// Helper to combine aggregated member data
const combineAggregatedMemberData = (subscribedData: any[], canceledData: any[]): {date: string; paid_subscribed: number; paid_canceled: number}[] => {
    const canceledMap = new Map(canceledData.map(c => [c.date, c]));
    const combinedData = subscribedData.map(item => ({
        date: item.date,
        paid_subscribed: item.paid_subscribed || 0,
        paid_canceled: canceledMap.get(item.date)?.paid_canceled || 0
    }));

    const combinedDatesSet = new Set(combinedData.map(item => item.date));
    canceledData.forEach((cancelItem) => {
        if (!combinedDatesSet.has(cancelItem.date)) {
            combinedData.push({
                date: cancelItem.date,
                paid_subscribed: 0,
                paid_canceled: cancelItem.paid_canceled || 0
            });
        }
    });

    combinedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return combinedData;
};

// Helper to transform combined data to chart format
const transformToChartData = (combinedData: {date: string; signups: number; cancellations: number}[], range: number, selectedResolution: ResolutionOption): ChartDataPoint[] => {
    const effectiveRange = getEffectiveRange(range, selectedResolution);
    return combinedData.map((item) => ({
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item.signups || 0,
        cancelled: -(item.cancellations || 0)
    }));
};

// Helper to transform member data to chart format
const transformMemberDataToChart = (combinedData: {date: string; paid_subscribed: number; paid_canceled: number}[], range: number, selectedResolution: ResolutionOption): ChartDataPoint[] => {
    const effectiveRange = getEffectiveRange(range, selectedResolution);
    return combinedData.map((item) => ({
        date: formatDisplayDateWithRange(item.date, effectiveRange),
        rawDate: item.date,
        new: item.paid_subscribed || 0,
        cancelled: -(item.paid_canceled || 0)
    }));
};

// Helper to process subscription data
const processSubscriptionData = (subscriptionData: {date: string; signups: number; cancellations: number}[], range: number, aggregationStrategy: 'none' | 'weekly' | 'monthly' | 'monthly-exact', selectedResolution: ResolutionOption): ChartDataPoint[] => {
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

    const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
    const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
    const combinedData = combineAggregatedData(signupsData, cancellationsData);
    const filledData = fillMissingDataPoints(combinedData, range, aggregationStrategy);
    return transformToChartData(filledData, range, selectedResolution);
};

// Helper to process member data
const processMemberData = (memberData: {date: string; paid_subscribed?: number; paid_canceled?: number}[], range: number, aggregationStrategy: 'none' | 'weekly' | 'monthly' | 'monthly-exact', selectedResolution: ResolutionOption): ChartDataPoint[] => {
    if (!memberData || memberData.length === 0) {
        return [];
    }

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

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
    const combinedData = combineAggregatedMemberData(subscribedData, canceledData);
    return transformMemberDataToChart(combinedData, range, selectedResolution);
};

// Helper to format resolution for display
const formatResolution = (resolution: ResolutionOption): string => {
    return resolution.charAt(0).toUpperCase() + resolution.slice(1);
};

// Helper to render chart tooltip content
const renderTooltipContent = (value: number, name: string, payload: any, index: number, selectedResolution: ResolutionOption, paidChangeChartConfig: ChartConfig) => {
    const rawValue = Number(value);
    let displayValue = '0';
    if (rawValue === 0) {
        displayValue = '0';
    } else {
        displayValue = rawValue < 0 ? formatNumber(rawValue * -1) : formatNumber(rawValue);
    }

    const newValue = Number(payload?.payload?.new || 0);
    const cancelledValue = Number(payload?.payload?.cancelled || 0);
    const netChange = newValue + cancelledValue;
    const netChangeFormatted = netChange === 0 ? '0' : (netChange > 0 ? `+${formatNumber(netChange)}` : formatNumber(netChange));

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
            {index === 0 &&
            <div className="mb-1 text-sm font-medium text-foreground">
                {tooltipDate}
            </div>
            }
            <div className='flex w-full items-center justify-between gap-4'>
                <div className='flex items-center gap-1'>
                    <div
                        className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                        style={{
                            '--color-bg': `var(--color-${name})`
                        } as React.CSSProperties}
                    />
                    <span className='text-sm text-muted-foreground'>
                        {paidChangeChartConfig[name as keyof typeof paidChangeChartConfig]?.label || name}
                    </span>
                </div>
                <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                    {displayValue}
                </div>
            </div>
            {index === 1 &&
            <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                <span className='text-sm text-muted-foreground'>
                    Net change
                </span>
                <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                    {netChangeFormatted}
                </div>
            </div>
            }
        </div>
    );
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

    const aggregationStrategy = useMemo(() => {
        switch (selectedResolution) {
        case 'daily':
            return 'none' as const;
        case 'weekly':
            return 'weekly' as const;
        case 'monthly':
            return 'monthly' as const;
        }
    }, [selectedResolution]);

    const paidChangeChartData = useMemo(() => {
        if (subscriptionData && subscriptionData.length > 0) {
            return processSubscriptionData(subscriptionData, range, aggregationStrategy, selectedResolution);
        } else {
            return processMemberData(memberData, range, aggregationStrategy, selectedResolution);
        }
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const paidChangeChartConfig = {
        new: {
            label: 'New',
            color: 'hsl(var(--chart-teal))'
        },
        cancelled: {
            label: 'Cancelled',
            color: 'hsl(var(--chart-rose))'
        }
    } satisfies ChartConfig;

    const totals = useMemo(() => {
        const totalNew = paidChangeChartData.reduce((sum, item) => sum + item.new, 0);
        const totalCancelled = paidChangeChartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0);
        return {new: totalNew, cancelled: totalCancelled};
    }, [paidChangeChartData]);

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
                        <CardDescription>New and cancelled paid subscriptions {getPeriodText(range)}</CardDescription>
                    </div>
                    {availableResolutions.length > 1 && (
                        <div>
                            <Select value={selectedResolution} onValueChange={value => setSelectedResolution(value as ResolutionOption)}>
                                <SelectTrigger className="w-[110px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent align='end'>
                                    {availableResolutions.map(resolution => (
                                        <SelectItem key={resolution} value={resolution}>
                                            {formatResolution(resolution)}
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
                            <Recharts.BarChart
                                data={paidChangeChartData}
                                stackOffset='sign'
                            >
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
                                    tickFormatter={(value) => {
                                        return value < 0 ? formatNumber(value * -1) : formatNumber(value);
                                    }}
                                    tickLine={false}
                                />
                                <ChartTooltip
                                    content={<ChartTooltipContent
                                        className='!min-w-[120px] px-3 py-2'
                                        formatter={(value, name, payload, index) => renderTooltipContent(value, name, payload, index, selectedResolution, paidChangeChartConfig)}
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
                                <span className='size-2 rounded-full opacity-50'
                                    style={{
                                        backgroundColor: paidChangeChartConfig.new.color
                                    }}
                                ></span>
                                <span>New</span>
                                <span className='font-medium text-foreground'>
                                    {formatNumber(totals.new)}
                                </span>
                            </div>
                            <div className='flex items-center gap-2'>
                                <span className='size-2 rounded-full opacity-50'
                                    style={{
                                        backgroundColor: paidChangeChartConfig.cancelled.color
                                    }}
                                ></span>
                                <span>Cancelled</span>
                                <span className='font-medium text-foreground'>
                                    {formatNumber(totals.cancelled)}
                                </span>
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