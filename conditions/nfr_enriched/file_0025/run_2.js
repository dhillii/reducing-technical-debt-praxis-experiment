```typescript
import React, {useEffect, useMemo, useState} from 'react';
import moment from 'moment';
import {Card, CardContent, CardDescription, CardHeader, CardTitle, ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, EmptyIndicator, LucideIcon, Recharts, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, formatDisplayDateWithRange, formatNumber, getRangeDates} from '@tryghost/shade';
import {determineAggregationStrategy, getPeriodText, sanitizeChartData} from '@src/utils/chart-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResolutionOption = 'daily' | 'weekly' | 'monthly';
type AggregationStrategy = 'none' | 'weekly' | 'monthly';

type SubscriptionDataPoint = {date: string; signups: number; cancellations: number};
type MemberDataPoint = {date: string; paid_subscribed?: number; paid_canceled?: number};

type PaidMembersChangeChartProps = {
    subscriptionData?: SubscriptionDataPoint[];
    memberData: MemberDataPoint[];
    range: number;
    isLoading: boolean;
};

type ChartDataPoint = {
    date: string;
    rawDate: string;
    new: number;
    cancelled: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RESOLUTION_TO_STRATEGY: Record<ResolutionOption, AggregationStrategy> = {
    daily: 'none',
    weekly: 'weekly',
    monthly: 'monthly'
};

const RESOLUTION_TO_RANGE_FORMAT: Record<ResolutionOption, number> = {
    daily: 30,
    weekly: 91,
    monthly: 366
};

const PAID_CHANGE_CHART_CONFIG = {
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

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const getEffectiveRange = (range: number, resolution: ResolutionOption): number => {
    if (resolution === 'weekly' && range < 91) {
        return 91;
    }
    if (resolution === 'monthly' && range < 365) {
        return 365;
    }
    return range;
};

// ─── fillMissingDataPoints ────────────────────────────────────────────────────

const PERIOD_CONFIG: Record<'monthly' | 'weekly', {unit: moment.unitOfTime.StartOf; increment: moment.unitOfTime.DurationConstructor}> = {
    monthly: {unit: 'month', increment: 'month'},
    weekly: {unit: 'week', increment: 'week'}
};

const fillMissingDataPoints = (
    data: SubscriptionDataPoint[],
    dateRange: number,
    overrideStrategy?: AggregationStrategy
): SubscriptionDataPoint[] => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(item => item.date === today);
        return [{date: today, signups: todayData?.signups ?? 0, cancellations: todayData?.cancellations ?? 0}];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);
    const dataMap = new Map(data.map(item => [item.date, item]));
    const filledData: SubscriptionDataPoint[] = [];

    const emptyPoint = (date: string): SubscriptionDataPoint => ({date, signups: 0, cancellations: 0});

    if (strategy === 'monthly' || strategy === 'weekly') {
        const {unit, increment} = PERIOD_CONFIG[strategy];
        const current = moment(startDate).startOf(unit);
        const end = moment(endDate).startOf(unit);
        const seen = new Set<string>();

        while (current.isSameOrBefore(end)) {
            const key = current.format('YYYY-MM-DD');
            if (!seen.has(key)) {
                seen.add(key);
                filledData.push(dataMap.get(key) ?? emptyPoint(key));
            }
            current.add(1, increment);
        }
    } else {
        const current = moment(startDate);
        const end = moment(endDate);
        while (current.isSameOrBefore(end)) {
            const key = current.format('YYYY-MM-DD');
            filledData.push(dataMap.get(key) ?? emptyPoint(key));
            current.add(1, 'day');
        }
    }

    return filledData;
};

// ─── Chart Data Builders ──────────────────────────────────────────────────────

const mergeDateMaps = <T extends {date: string}>(
    primary: T[],
    secondary: T[],
    secondaryKey: keyof T
): Array<{date: string; primaryValue: number; secondaryValue: number}> => {
    const secondaryMap = new Map(secondary.map(item => [item.date, item]));
    const primaryDates = new Set(primary.map(item => item.date));

    const merged = primary.map(item => ({
        date: item.date,
        primaryValue: Number(item[Object.keys(item).find(k => k !== 'date') as keyof T] ?? 0),
        secondaryValue: Number(secondaryMap.get(item.date)?.[secondaryKey] ?? 0)
    }));

    secondary.forEach(item => {
        if (!primaryDates.has(item.date)) {
            merged.push({date: item.date, primaryValue: 0, secondaryValue: Number(item[secondaryKey] ?? 0)});
        }
    });

    return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const toChartPoint = (
    date: string,
    signups: number,
    cancellations: number,
    range: number,
    resolution: ResolutionOption
): ChartDataPoint => ({
    date: formatDisplayDateWithRange(date, getEffectiveRange(range, resolution)),
    rawDate: date,
    new: signups,
    cancelled: -cancellations
});

const buildChartDataFromSubscriptions = (
    subscriptionData: SubscriptionDataPoint[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    resolution: ResolutionOption
): ChartDataPoint[] => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = subscriptionData.find(item => item.date === today);
        return [toChartPoint(today, todayData?.signups ?? 0, todayData?.cancellations ?? 0, range, resolution)];
    }

    const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
    const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
    const merged = mergeDateMaps(signupsData, cancellationsData, 'cancellations');
    const asSubscriptionPoints: SubscriptionDataPoint[] = merged.map(item => ({
        date: item.date,
        signups: item.primaryValue,
        cancellations: item.secondaryValue
    }));

    const filled = fillMissingDataPoints(asSubscriptionPoints, range, aggregationStrategy);
    return filled.map(item => toChartPoint(item.date, item.signups, item.cancellations, range, resolution));
};

const buildChartDataFromMembers = (
    memberData: MemberDataPoint[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    resolution: ResolutionOption
): ChartDataPoint[] => {
    if (!memberData.length) {
        return [];
    }

    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = memberData.find(item => item.date === today);
        return [toChartPoint(today, todayData?.paid_subscribed ?? 0, todayData?.paid_canceled ?? 0, range, resolution)];
    }

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
    const merged = mergeDateMaps(subscribedData, canceledData, 'paid_canceled');

    return merged.map(item => toChartPoint(item.date, item.primaryValue, item.secondaryValue, range, resolution));
};

// ─── Sub-components ───────────────────────────────────────────────────────────

type ResolutionSelectProps = {
    availableResolutions: ResolutionOption[];
    selectedResolution: ResolutionOption;
    onChange: (value: ResolutionOption) => void;
};

const ResolutionSelect: React.FC<ResolutionSelectProps> = ({availableResolutions, selectedResolution, onChange}) => {
    if (availableResolutions.length <= 1) {
        return null;
    }
    return (
        <Select value={selectedResolution} onValueChange={value => onChange(value as ResolutionOption)}>
            <SelectTrigger className="w-[110px]">
                <SelectValue />
            </SelectTrigger>
            <SelectContent align='end'>
                {availableResolutions.map(resolution => (
                    <SelectItem key={resolution} value={resolution}>
                        {capitalise(resolution)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

type LegendItemProps = {color: string; label: string; value: number};

const LegendItem: React.FC<LegendItemProps> = ({color, label, value}) => (
    <div className='flex items-center gap-2'>
        <span className='size-2 rounded-full opacity-50' style={{backgroundColor: color}} />
        <span>{label}</span>
        <span className='font-medium text-foreground'>{formatNumber(value)}</span>
    </div>
);

type TooltipRowProps = {colorVar: string; label: string; value: string};

const TooltipRow: React.FC<TooltipRowProps> = ({colorVar, label, value}) => (
    <div className='flex w-full items-center justify-between gap-4'>
        <div className='flex items-center gap-1'>
            <div
                className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                style={{'--color-bg': colorVar} as React.CSSProperties}
            />
            <span className='text-sm text-muted-foreground'>{label}</span>
        </div>
        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
            {value}
        </div>
    </div>
);

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
    const aggregationStrategy = RESOLUTION_TO_STRATEGY[selectedResolution];

    const paidChangeChartData = useMemo<ChartDataPoint[]>(() => {
        if (subscriptionData && subscriptionData.length > 0) {
            return buildChartDataFromSubscriptions(subscriptionData, range, aggregationStrategy, selectedResolution);
        }
        return buildChartDataFromMembers(memberData, range, aggregationStrategy, selectedResolution);
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const totals = useMemo(() => ({
        new: paidChangeChartData.reduce((sum, item) => sum + item.new, 0),
        cancelled: paidChangeChartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0)
    }), [paidChangeChartData]);

    if (isLoading) {
        return null;
    }

    const hasData = paidChangeChartData.length > 0 && (totals.new > 0 || totals.cancelled > 0);

    const renderTooltipContent = (value: unknown, name: string, payload: {payload?: ChartDataPoint}, index: number) => {
        const rawValue = Number(value);
        const absValue = Math.abs(rawValue);
        const displayValue = formatNumber(absValue);

        const newValue = Number(payload?.payload?.new ?? 0);
        const cancelledValue = Number(payload?.payload?.cancelled ?? 0);
        const netChange = newValue + cancelledValue;
        const netChangeFormatted = netChange === 0 ? '0' : (netChange > 0 ? `+${formatNumber(netChange)}` : formatNumber(netChange));

        const rawDate = payload?.payload?.rawDate;
        const tooltipDate = rawDate
            ? formatDisplayDateWithRange(rawDate, RESOLUTION_TO_RANGE_FORMAT[selectedResolution])
            : payload?.payload?.date;

        const configEntry = PAID_CHANGE_CHART_CONFIG[name as keyof typeof PAID_CHANGE_CHART_CONFIG];

        return (
            <div className='flex w-full flex-col'>
                {index === 0 && (
                    <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
                )}
                <TooltipRow
                    colorVar={`var(--color-${name})`}
                    label={configEntry?.label ?? name}
                    value={displayValue}
                />
                {index === 1 && (
                    <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                        <span className='text-sm text-muted-foreground'>Net change</span>
                        <div className="ml-auto flex items-