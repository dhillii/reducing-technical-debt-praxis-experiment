```tsx
import React, {useEffect, useMemo, useState} from 'react';
import moment from 'moment';
import {Card, CardContent, CardDescription, CardHeader, CardTitle, ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, EmptyIndicator, LucideIcon, Recharts, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, formatDisplayDateWithRange, formatNumber, getRangeDates} from '@tryghost/shade';
import {determineAggregationStrategy, getPeriodText, sanitizeChartData} from '@src/utils/chart-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResolutionOption = 'daily' | 'weekly' | 'monthly';
type AggregationStrategy = 'none' | 'weekly' | 'monthly';

type SubscriptionDataItem = {date: string; signups: number; cancellations: number};
type MemberDataItem = {date: string; paid_subscribed?: number; paid_canceled?: number};
type ChartDataItem = {date: string; rawDate: string; new: number; cancelled: number};

type PaidMembersChangeChartProps = {
    subscriptionData?: SubscriptionDataItem[];
    memberData: MemberDataItem[];
    range: number;
    isLoading: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RESOLUTION_TO_STRATEGY: Record<ResolutionOption, AggregationStrategy> = {
    daily: 'none',
    weekly: 'weekly',
    monthly: 'monthly'
};

const RESOLUTION_TO_RANGE_THRESHOLD: Record<ResolutionOption, number> = {
    daily: 30,
    weekly: 91,
    monthly: 366
};

const CHART_CONFIG = {
    new: {label: 'New', color: 'hsl(var(--chart-teal))'},
    cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
} satisfies ChartConfig;

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

const getActualDateSpan = (range: number): number => {
    if (range !== -1) {
        return range;
    }
    const {startDate, endDate} = getRangeDates(range);
    return moment(endDate).diff(moment(startDate), 'days');
};

const getAvailableResolutions = (range: number): ResolutionOption[] => {
    const span = getActualDateSpan(range);
    if (span < 30) {
        return ['daily'];
    }
    if (span >= 91) {
        return ['weekly', 'monthly'];
    }
    return ['daily', 'weekly'];
};

const getDefaultResolution = (range: number): ResolutionOption => {
    const span = getActualDateSpan(range);
    if (span < 30) {
        return 'daily';
    }
    if (span >= 91) {
        return 'monthly';
    }
    return 'weekly';
};

const getEffectiveRange = (range: number, resolution: ResolutionOption): number => {
    if (resolution === 'weekly' && range < 91) {
        return 91;
    }
    if (resolution === 'monthly' && range < 365) {
        return 365;
    }
    return range;
};

const formatResolution = (resolution: ResolutionOption): string =>
    resolution.charAt(0).toUpperCase() + resolution.slice(1);

const toChartItem = (
    item: {date: string; signups: number; cancellations: number},
    range: number,
    resolution: ResolutionOption
): ChartDataItem => ({
    date: formatDisplayDateWithRange(item.date, getEffectiveRange(range, resolution)),
    rawDate: item.date,
    new: item.signups,
    cancelled: -item.cancellations
});

// ─── Data Filling ─────────────────────────────────────────────────────────────

const fillMissingDataPoints = (
    data: SubscriptionDataItem[],
    dateRange: number,
    overrideStrategy?: AggregationStrategy
): SubscriptionDataItem[] => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(item => item.date === today);
        return [{date: today, signups: todayData?.signups ?? 0, cancellations: todayData?.cancellations ?? 0}];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);
    const dataMap = new Map(data.map(item => [item.date, item]));

    const emptyPoint = (date: string): SubscriptionDataItem => ({date, signups: 0, cancellations: 0});

    const iteratePeriods = (
        start: moment.Moment,
        end: moment.Moment,
        unit: 'day' | 'week' | 'month',
        startOf: 'day' | 'week' | 'month'
    ): SubscriptionDataItem[] => {
        const result: SubscriptionDataItem[] = [];
        const seen = new Set<string>();
        const current = moment(start).startOf(startOf);
        const endPeriod = moment(end).startOf(startOf);

        while (current.isSameOrBefore(endPeriod)) {
            const key = current.format('YYYY-MM-DD');
            if (!seen.has(key)) {
                seen.add(key);
                result.push(dataMap.get(key) ?? emptyPoint(key));
            }
            current.add(1, unit);
        }
        return result;
    };

    if (strategy === 'monthly') {
        return iteratePeriods(moment(startDate), moment(endDate), 'month', 'month');
    }
    if (strategy === 'weekly') {
        return iteratePeriods(moment(startDate), moment(endDate), 'week', 'week');
    }
    return iteratePeriods(moment(startDate), moment(endDate), 'day', 'day');
};

// ─── Data Combination ─────────────────────────────────────────────────────────

const mergeDateSeries = <T extends {date: string}>(
    primary: T[],
    secondary: T[],
    mergeItem: (primaryItem: T | undefined, secondaryItem: T | undefined, date: string) => SubscriptionDataItem
): SubscriptionDataItem[] => {
    const primaryMap = new Map(primary.map(item => [item.date, item]));
    const secondaryMap = new Map(secondary.map(item => [item.date, item]));
    const allDates = new Set([...primary.map(i => i.date), ...secondary.map(i => i.date)]);

    return Array.from(allDates)
        .sort()
        .map(date => mergeItem(primaryMap.get(date), secondaryMap.get(date), date));
};

const buildChartDataFromSubscriptions = (
    subscriptionData: SubscriptionDataItem[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    resolution: ResolutionOption
): ChartDataItem[] => {
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

    const combined = mergeDateSeries(signupsData, cancellationsData, (s, c, date) => ({
        date,
        signups: s?.signups ?? 0,
        cancellations: c?.cancellations ?? 0
    }));

    return fillMissingDataPoints(combined, range, aggregationStrategy)
        .map(item => toChartItem(item, range, resolution));
};

const buildChartDataFromMembers = (
    memberData: MemberDataItem[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    resolution: ResolutionOption
): ChartDataItem[] => {
    if (!memberData.length) {
        return [];
    }

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

    const combined = mergeDateSeries(subscribedData, canceledData, (s, c, date) => ({
        date,
        signups: s?.paid_subscribed ?? 0,
        cancellations: c?.paid_canceled ?? 0
    }));

    return combined.map(item => toChartItem(item, range, resolution));
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const ResolutionSelect: React.FC<{
    available: ResolutionOption[];
    selected: ResolutionOption;
    onChange: (value: ResolutionOption) => void;
}> = ({available, selected, onChange}) => {
    if (available.length <= 1) {
        return null;
    }
    return (
        <Select value={selected} onValueChange={value => onChange(value as ResolutionOption)}>
            <SelectTrigger className="w-[110px]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent align='end'>
                {available.map(resolution => (
                    <SelectItem key={resolution} value={resolution}>
                        {formatResolution(resolution)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

const LegendItem: React.FC<{label: string; color: string; value: number}> = ({label, color, value}) => (
    <div className='flex items-center gap-2'>
        <span className='size-2 rounded-full opacity-50' style={{backgroundColor: color}} />
        <span>{label}</span>
        <span className='font-medium text-foreground'>{formatNumber(value)}</span>
    </div>
);

const TooltipRow: React.FC<{
    name: string;
    displayValue: string;
}> = ({name, displayValue}) => (
    <div className='flex w-full items-center justify-between gap-4'>
        <div className='flex items-center gap-1'>
            <div
                className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                style={{'--color-bg': `var(--color-${name})`} as React.CSSProperties}
            />
            <span className='text-sm text-muted-foreground'>
                {CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label ?? name}
            </span>
        </div>
        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
            {displayValue}
        </div>
    </div>
);

const formatTooltipDate = (rawDate: string, resolution: ResolutionOption): string =>
    formatDisplayDateWithRange(rawDate, RESOLUTION_TO_RANGE_THRESHOLD[resolution]);

const formatDisplayValue = (value: number): string => {
    if (value === 0) {
        return '0';
    }
    return value < 0 ? formatNumber(value * -1) : formatNumber(value);
};

const formatNetChange = (net: number): string => {
    if (net === 0) {
        return '0';
    }
    return net > 0 ? `+${formatNumber(net)}` : formatNumber(net);
};

// ─── Main Component ───────────────────────────────────────────────────────────

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
    const aggregationStrategy = useMemo(() => RESOLUTION_TO_STRATEGY[selectedResolution], [selectedResolution]);

    const chartData = useMemo<ChartDataItem[]>(() => {
        if (subscriptionData?.length) {
            return buildChartDataFromSubscriptions(subscriptionData, range, aggregationStrategy, selectedResolution);
        }
        return buildChartDataFromMembers(memberData, range, aggregationStrategy, selectedResolution);
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const totals = useMemo(() => ({
        new: chartData.reduce((sum, item) => sum + item.new, 0),
        cancelled: chartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0)
    }), [chartData]);

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
                    <ResolutionSelect
                        available={availableResolutions}
                        selected={selectedResolution}
                        onChange={setSelectedResolution}
                    />
                </div>
            </CardHeader>
            <CardContent>
                {hasData ? (
                    <div>
                        <ChartContainer className='aspect-auto h-[200px] w-full md:h-[220px] xl:h-[260px]' config={CHART_CONFIG}>
                            <Recharts.BarChart data={chartData} stackOffset='sign'>
                                <defs>
                                    <linearGradient id="tealGradient" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" stopColor='var(--color-new)' stopOpacity={0.8} />
                                        <stop offset="100%" stopColor='var(--color-new)' stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="roseGradient" x1="0" x2="0" y1="0" y2="