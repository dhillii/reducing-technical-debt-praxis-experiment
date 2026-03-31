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
        const current = start.clone().startOf(startOf);
        const endPeriod = end.clone().startOf(startOf);

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

    const start = moment(startDate);
    const end = moment(endDate);

    if (strategy === 'monthly') {
        return iteratePeriods(start, end, 'month', 'month');
    }
    if (strategy === 'weekly') {
        return iteratePeriods(start, end, 'week', 'week');
    }
    return iteratePeriods(start, end, 'day', 'day');
};

// ─── Data Merging ─────────────────────────────────────────────────────────────

const mergeByDate = <T extends {date: string}>(
    primary: T[],
    secondary: T[],
    mergeItem: (primaryItem: T, secondaryItem: T | undefined) => SubscriptionDataItem
): SubscriptionDataItem[] => {
    const secondaryMap = new Map(secondary.map(item => [item.date, item]));
    const merged = primary.map(item => mergeItem(item, secondaryMap.get(item.date)));

    const primaryDates = new Set(primary.map(item => item.date));
    secondary.forEach((item) => {
        if (!primaryDates.has(item.date)) {
            merged.push(mergeItem(item as unknown as T, undefined));
        }
    });

    return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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

    const merged = mergeByDate(signupsData, cancellationsData, (primary, secondary) => ({
        date: primary.date,
        signups: primary.signups ?? 0,
        cancellations: secondary?.cancellations ?? 0
    }));

    return fillMissingDataPoints(merged, range, aggregationStrategy)
        .map(item => toChartItem(item, range, resolution));
};

const buildChartDataFromMemberData = (
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

    const merged = mergeByDate(subscribedData, canceledData, (primary, secondary) => ({
        date: primary.date,
        signups: primary.paid_subscribed ?? 0,
        cancellations: secondary?.paid_canceled ?? 0
    }));

    return merged.map(item => toChartItem(item, range, resolution));
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

const ChartLegend: React.FC<{totals: {new: number; cancelled: number}}> = ({totals}) => (
    <div className='mt-3 flex items-center justify-center gap-6 text-sm text-muted-foreground'>
        {(['new', 'cancelled'] as const).map(key => (
            <div key={key} className='flex items-center gap-2'>
                <span
                    className='size-2 rounded-full opacity-50'
                    style={{backgroundColor: PAID_CHANGE_CHART_CONFIG[key].color}}
                />
                <span>{PAID_CHANGE_CHART_CONFIG[key].label}</span>
                <span className='font-medium text-foreground'>{formatNumber(totals[key])}</span>
            </div>
        ))}
    </div>
);

const TooltipFormatter = (
    value: unknown,
    name: unknown,
    payload: {payload?: {new?: number; cancelled?: number; date?: string; rawDate?: string}},
    index: number,
    selectedResolution: ResolutionOption
) => {
    const rawValue = Number(value);
    const displayValue = rawValue === 0 ? '0' : formatNumber(Math.abs(rawValue));

    const newValue = Number(payload?.payload?.new ?? 0);
    const cancelledValue = Number(payload?.payload?.cancelled ?? 0);
    const netChange = newValue + cancelledValue;
    const netChangeFormatted = netChange === 0
        ? '0'
        : netChange > 0
            ? `+${formatNumber(netChange)}`
            : formatNumber(netChange);

    let tooltipDate = payload?.payload?.date;
    if (payload?.payload?.rawDate) {
        const rangeMap: Record<ResolutionOption, number> = {monthly: 366, weekly: 91, daily: 30};
        tooltipDate = formatDisplayDateWithRange(payload.payload.rawDate, rangeMap[selectedResolution]);
    }

    const nameKey = name as keyof typeof PAID_CHANGE_CHART_CONFIG;
    const label = PAID_CHANGE_CHART_CONFIG[nameKey]?.label ?? name;

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
                    <span className='text-sm text-muted-foreground'>{label}</span>
                </div>
                <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                    {displayValue}
                </div>
            </div>
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

    const chartData = useMemo<ChartDataItem[]>(() => {
        if (subscriptionData?.length) {
            return buildChartDataFromSubscriptions(subscriptionData, range, aggregationStrategy, selectedResolution);
        }
        return buildChartDataFromMemberData(memberData, range, aggregationStrategy, selectedResolution);
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const totals = useMemo(() => ({
        new: chartData.reduce((sum, item) => sum + item.new, 0),
        cancelled: chartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0)
    }), [chartData]);

    if (isLoading) {