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
    monthly: 366,
    weekly: 91,
    daily: 30
};

const paidChangeChartConfig = {
    new: {label: 'New', color: 'hsl(var(--chart-teal))'},
    cancelled: {label: 'Cancelled', color: 'hsl(var(--chart-rose))'}
} satisfies ChartConfig;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const sortByDate = <T extends {date: string}>(data: T[]): T[] =>
    [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const mergeDateArrays = <T extends {date: string}>(
    primary: T[],
    secondary: T[],
    mergeItem: (item: T) => T
): T[] => {
    const primaryDates = new Set(primary.map(item => item.date));
    const extras = secondary
        .filter(item => !primaryDates.has(item.date))
        .map(mergeItem);
    return [...primary, ...extras];
};

// ─── Fill missing data points ─────────────────────────────────────────────────

const buildPeriodIterator = (
    strategy: string,
    startDate: string,
    endDate: string
): {start: moment.Moment; end: moment.Moment; unit: moment.unitOfTime.DurationConstructor; boundary: moment.unitOfTime.StartOf} => {
    if (strategy === 'monthly') {
        return {
            start: moment(startDate).startOf('month'),
            end: moment(endDate).startOf('month'),
            unit: 'month',
            boundary: 'month'
        };
    }
    if (strategy === 'weekly') {
        return {
            start: moment(startDate).startOf('week'),
            end: moment(endDate).startOf('week'),
            unit: 'week',
            boundary: 'week'
        };
    }
    return {
        start: moment(startDate),
        end: moment(endDate),
        unit: 'day',
        boundary: 'day'
    };
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
    const {start, end, unit} = buildPeriodIterator(strategy, startDate, endDate);

    const filledData: SubscriptionDataPoint[] = [];
    const seenKeys = new Set<string>();
    const current = start.clone();

    while (current.isSameOrBefore(end)) {
        const dateKey = current.format('YYYY-MM-DD');
        if (!seenKeys.has(dateKey)) {
            seenKeys.add(dateKey);
            filledData.push(dataMap.get(dateKey) ?? {date: dateKey, signups: 0, cancellations: 0});
        }
        current.add(1, unit);
    }

    return filledData;
};

// ─── Chart data builders ──────────────────────────────────────────────────────

const buildTodayChartPoint = (
    date: string,
    newVal: number,
    cancelledVal: number,
    range: number
): ChartDataPoint => ({
    date: formatDisplayDateWithRange(date, range),
    rawDate: date,
    new: newVal,
    cancelled: -cancelledVal
});

const toChartPoint = (
    item: {date: string; signups: number; cancellations: number},
    range: number,
    resolution: ResolutionOption
): ChartDataPoint => ({
    date: formatDisplayDateWithRange(item.date, getEffectiveRange(range, resolution)),
    rawDate: item.date,
    new: item.signups,
    cancelled: -item.cancellations
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
        return [buildTodayChartPoint(today, todayData?.signups ?? 0, todayData?.cancellations ?? 0, range)];
    }

    const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
    const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);
    const cancellationsMap = new Map(cancellationsData.map(c => [c.date, c]));

    const combined: SubscriptionDataPoint[] = signupsData.map(item => ({
        date: item.date,
        signups: item.signups ?? 0,
        cancellations: cancellationsMap.get(item.date)?.cancellations ?? 0
    }));

    const merged = mergeDateArrays(combined, cancellationsData, cancelItem => ({
        date: cancelItem.date,
        signups: 0,
        cancellations: cancelItem.cancellations ?? 0
    }));

    const filled = fillMissingDataPoints(sortByDate(merged), range, aggregationStrategy);
    return filled.map(item => toChartPoint(item, range, resolution));
};

const buildChartDataFromMemberData = (
    memberData: MemberDataPoint[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    resolution: ResolutionOption
): ChartDataPoint[] => {
    if (!memberData?.length) {
        return [];
    }

    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = memberData.find(item => item.date === today);
        return [buildTodayChartPoint(today, todayData?.paid_subscribed ?? 0, todayData?.paid_canceled ?? 0, range)];
    }

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);
    const canceledMap = new Map(canceledData.map(c => [c.date, c]));

    const combined = subscribedData.map(item => ({
        date: item.date,
        signups: item.paid_subscribed ?? 0,
        cancellations: canceledMap.get(item.date)?.paid_canceled ?? 0
    }));

    const merged = mergeDateArrays(combined, canceledData, cancelItem => ({
        date: cancelItem.date,
        signups: 0,
        cancellations: cancelItem.paid_canceled ?? 0
    }));

    return sortByDate(merged).map(item => toChartPoint(item, range, resolution));
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
                        {capitalize(resolution)}
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

type TooltipRowProps = {
    colorVar: string;
    label: string;
    value: string;
};

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

// ─── Tooltip formatter ────────────────────────────────────────────────────────

const formatAbsoluteValue = (value: number): string => {
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

const createTooltipFormatter = (selectedResolution: ResolutionOption) =>
    (value: unknown, name: unknown, payload: unknown, index: number) => {
        const rawValue = Number(value);
        const displayValue = formatAbsoluteValue(rawValue);
        const typedPayload = payload as {payload?: ChartDataPoint};
        const typedName = name as string;

        const newValue = Number(typedPayload?.payload?.new ?? 0);
        const cancelledValue = Number(typedPayload?.payload?.cancelled ?? 0);
        const netChange = newValue + cancelledValue;
        const netChangeFormatted = formatNetChange(netChange);

        const rawDate = typedPayload?.payload?.rawDate;
        const tooltipDate = rawDate
            ? formatDisplayDateWithRange(rawDate, RESOLUTION_TO_RANGE_FORMAT[selectedResolution])
            : typedPayload?.payload?.date;

        const configLabel = paidChangeChartConfig[typedName as keyof typeof paidChangeChartConfig]?.label ?? typedName;

        return (
            <div className='flex w-full flex-col'>
                {index === 0 && (
                    <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
                )}
                <TooltipRow
                    colorVar={`var(--color-${typedName})`}
                    label={configLabel}
                    value={displayValue}
                />
                {index === 1 && (
                    <div className='mt-1 flex w-full items-center justify-between gap-4 border-t pt-1'>
                        <span className='text-sm text-muted-foreground'>Net change</span>
                        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                            {netChangeFormatted}
                        </div>
                    </div>
                )}
            </div>
        );
    };

// ─── Main component ───────────────────────────────────────────────────────────

const PaidMembersChangeChart: React.FC<PaidMembersChange