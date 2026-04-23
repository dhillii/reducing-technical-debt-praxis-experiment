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
    const seenKeys = new Set<string>();

    if (strategy === 'monthly') {
        const currentPeriod = moment(startDate).startOf('month');
        const endPeriod = moment(endDate).startOf('month');
        while (currentPeriod.isSameOrBefore(endPeriod)) {
            const dateKey = currentPeriod.format('YYYY-MM-DD');
            if (!seenKeys.has(dateKey)) {
                seenKeys.add(dateKey);
                const existingData = dataMap.get(dateKey);
                if (existingData) {
                    filledData.push(existingData);
                } else {
                    filledData.push({date: dateKey, signups: 0, cancellations: 0});
                }
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
                const existingData = dataMap.get(dateKey);
                if (existingData) {
                    filledData.push(existingData);
                } else {
                    filledData.push({date: dateKey, signups: 0, cancellations: 0});
                }
            }
            currentPeriod.add(1, 'week');
        }
    } else {
        const currentDate = moment(startDate);
        const endMoment = moment(endDate);
        while (currentDate.isSameOrBefore(endMoment)) {
            const dateKey = currentDate.format('YYYY-MM-DD');
            const existingData = dataMap.get(dateKey);
            if (existingData) {
                filledData.push(existingData);
            } else {
                filledData.push({date: dateKey, signups: 0, cancellations: 0});
            }
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
    const actualSpan = getActualDateSpan(range);
    if (actualSpan < 30) return ['daily'];
    if (actualSpan >= 91) return ['weekly', 'monthly'];
    return ['daily', 'weekly'];
};

const getDefaultResolution = (range: number): ResolutionOption => {
    const actualSpan = getActualDateSpan(range);
    if (actualSpan < 30) return 'daily';
    if (actualSpan >= 91) return 'monthly';
    return 'weekly';
};

const getEffectiveRange = (range: number, resolution: ResolutionOption): number => {
    if (resolution === 'weekly' && range < 91) return 91;
    if (resolution === 'monthly' && range < 365) return 365;
    return range;
};

const formatChartDataItem = (
    item: {date: string; signups?: number; cancellations?: number; paid_subscribed?: number; paid_canceled?: number},
    effectiveRange: number,
    resolution: ResolutionOption
) => {
    const date = formatDisplayDateWithRange(item.date, effectiveRange);
    const rawDate = item.date;
    const newVal = item.signups ?? item.paid_subscribed ?? 0;
    const cancelledVal = -(item.cancellations ?? item.paid_canceled ?? 0);
    return {date, rawDate, new: newVal, cancelled: cancelledVal};
};

const processSubscriptionData = (
    subscriptionData: {date: string; signups: number; cancellations: number}[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    selectedResolution: ResolutionOption
) => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = subscriptionData.find(item => item.date === today);
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayData?.signups ?? 0,
            cancelled: -(todayData?.cancellations ?? 0)
        }];
    }

    const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
    const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);

    const cancellationsMap = new Map(cancellationsData.map(c => [c.date, c]));
    const combinedData = signupsData.map(item => ({
        date: item.date,
        signups: item.signups ?? 0,
        cancellations: cancellationsMap.get(item.date)?.cancellations ?? 0
    }));

    const combinedDates = new Set(combinedData.map(item => item.date));
    cancellationsData.forEach(c => {
        if (!combinedDates.has(c.date)) {
            combinedData.push({date: c.date, signups: 0, cancellations: c.cancellations ?? 0});
        }
    });

    combinedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const filled = fillMissingDataPoints(combinedData, range, aggregationStrategy);

    const effectiveRange = getEffectiveRange(range, selectedResolution);
    return filled.map(item => formatChartDataItem(item, effectiveRange, selectedResolution));
};

const processMemberData = (
    memberData: {date: string; paid_subscribed?: number; paid_canceled?: number}[],
    range: number,
    aggregationStrategy: 'none' | 'weekly' | 'monthly',
    selectedResolution: ResolutionOption
) => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = memberData.find(item => item.date === today);
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayData?.paid_subscribed ?? 0,
            cancelled: -(todayData?.paid_canceled ?? 0)
        }];
    }

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);

    const canceledMap = new Map(canceledData.map(c => [c.date, c]));
    const combinedData = subscribedData.map(item => ({
        date: item.date,
        paid_subscribed: item.paid_subscribed ?? 0,
        paid_canceled: canceledMap.get(item.date)?.paid_canceled ?? 0
    }));

    const combinedDates = new Set(combinedData.map(item => item.date));
    canceledData.forEach(c => {
        if (!combinedDates.has(c.date)) {
            combinedData.push({date: c.date, paid_subscribed: 0, paid_canceled: c.paid_canceled ?? 0});
        }
    });

    combinedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const effectiveRange = getEffectiveRange(range, selectedResolution);
    return combinedData.map(item => formatChartDataItem(item, effectiveRange, selectedResolution));
};

const getChartConfig = (): ChartConfig => ({
    new: {label: 'New', color: 'hsl(var(--chart-teal))'},
    cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
});

const getTotals = (data: {new: number; cancelled: number}[]) => ({
    new: data.reduce((sum, item) => sum + item.new, 0),
    cancelled: data.reduce((sum, item) => sum + Math.abs(item.cancelled), 0)
});

const hasData = (data: {new: number; cancelled: number}[], totals: {new: number; cancelled: number}) =>
    data.length > 0 && (totals.new > 0 || totals.cancelled > 0);

const formatResolutionLabel = (resolution: ResolutionOption) => resolution.charAt(0).toUpperCase() + resolution.slice(1);

const getTooltipContent = (
    selectedResolution: ResolutionOption,
    chartConfig: ChartConfig
) => {
    return (
        <ChartTooltipContent
            className="!min-w-[120px] px-3 py-2"
            formatter={(value, name, payload, index) => {
                const rawValue = Number(value);
                const displayValue = rawValue === 0 ? '0' : rawValue < 0 ? formatNumber(rawValue * -1) : formatNumber(rawValue);

                const newValue = Number(payload?.payload?.new ?? 0);
                const cancelledValue = Number(payload?.payload?.cancelled ?? 0);
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
                    <div className="flex w-full flex-col">
                        {index === 0 && (
                            <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
                        )}
                        <div className="flex w-full items-center justify-between gap-4">
                            <div className="flex items-center gap-1">
                                <div
                                    className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                                    style={{'--color-bg': `var(--color-${name})`} as React.CSSProperties}
                                />
                                <span className="text-sm text-muted-foreground">
                                    {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
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
            }}
            hideLabel
        />
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
        }
        if (memberData && memberData.length > 0) {
            return processMemberData(memberData, range, aggregationStrategy, selectedResolution);
        }
        return [];
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const paidChangeChartConfig = useMemo(() => getChartConfig(), []);

    const totals = useMemo(() => getTotals(paidChangeChartData), [paidChangeChartData]);

    if (isLoading) return null;

    const hasChartData = hasData(paidChangeChartData, totals);

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
                                    {availableResolutions.map(resolution => (
                                        <SelectItem key={resolution} value={resolution}>
                                            {formatResolutionLabel(resolution)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {hasChartData ? (
                    <div>
                        <ChartContainer
                            className="aspect-auto h-[200px] w-full md:h-[220px] xl:h-[260px]"
                            config={paidChangeChartConfig}
                        >
                            <Recharts.BarChart data={paidChangeChartData} stackOffset="sign">
                                <defs>
                                    <linearGradient id="tealGradient" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" stopColor="var(--color-new)" stopOpacity={0.8} />
                                        <stop offset="100%" stopColor="var(--color-new)" stopOpacity={0.6} />
                                    </linearGradient>
                                </defs>
                                <defs>
                                    <linearGradient id="roseGradient" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" stopColor="var(--color-cancelled)" stopOpacity={0.6} />
                                        <stop offset="100%" stopColor="var(--color-cancelled)" stopOpacity={0.8} />
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
                                    tickFormatter={value => (value < 0 ? formatNumber(value * -1) : formatNumber(value))}
                                    tickLine={false}
                                />
                                <ChartTooltip
                                    content={getTooltipContent(selectedResolution, paidChangeChartConfig)}
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
                                <span
                                    className="size-2 rounded-full opacity-50"
                                    style={{backgroundColor: paidChangeChartConfig.new.color}}
                                />
                                <span>New</span>
                                <span className="font-medium text-foreground">{formatNumber(totals.new)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span
                                    className="size-2 rounded-full opacity-50"
                                    style={{backgroundColor: paidChangeChartConfig.cancelled.color}}
                                />
                                <span>Cancelled</span>
                                <span className="font-medium text-foreground">{formatNumber(totals.cancelled)}</span>
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