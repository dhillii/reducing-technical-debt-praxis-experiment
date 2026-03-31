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

const iteratePeriods = (
    startDate: string,
    endDate: string,
    unit: 'day' | 'week' | 'month',
    periodStart: 'day' | 'week' | 'month'
): string[] => {
    const dates: string[] = [];
    const current = moment(startDate).startOf(periodStart);
    const end = moment(endDate).startOf(periodStart);
    while (current.isSameOrBefore(end)) {
        dates.push(current.format('YYYY-MM-DD'));
        current.add(1, unit);
    }
    return [...new Set(dates)];
};

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

    const periodConfig: Record<string, {unit: 'day' | 'week' | 'month'; start: 'day' | 'week' | 'month'}> = {
        monthly: {unit: 'month', start: 'month'},
        weekly: {unit: 'week', start: 'week'},
        none: {unit: 'day', start: 'day'}
    };

    const {unit, start} = periodConfig[strategy] ?? periodConfig.none;
    const dates = iteratePeriods(startDate, endDate, unit, start);

    return dates.map(dateKey => dataMap.get(dateKey) ?? {date: dateKey, signups: 0, cancellations: 0});
};

// ─── Data Merging ─────────────────────────────────────────────────────────────

const mergeByDate = <T extends {date: string}, U extends {date: string}>(
    primary: T[],
    secondary: U[],
    merge: (primary: T | undefined, secondary: U | undefined, date: string) => SubscriptionDataItem
): SubscriptionDataItem[] => {
    const primaryMap = new Map(primary.map(item => [item.date, item]));
    const secondaryMap = new Map(secondary.map(item => [item.date, item]));
    const allDates = new Set([...primaryMap.keys(), ...secondaryMap.keys()]);

    return [...allDates]
        .map(date => merge(primaryMap.get(date), secondaryMap.get(date), date))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// ─── Chart Data Builders ──────────────────────────────────────────────────────

const buildTodayChartData = (
    signups: number,
    cancellations: number,
    range: number
): ChartDataItem[] => {
    const today = moment().format('YYYY-MM-DD');
    return [{
        date: formatDisplayDateWithRange(today, range),
        rawDate: today,
        new: signups,
        cancelled: -cancellations
    }];
};

const buildFromSubscriptionData = (
    subscriptionData: SubscriptionDataItem[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    resolution: ResolutionOption
): ChartDataItem[] => {
    if (range === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = subscriptionData.find(item => item.date === today);
        return buildTodayChartData(todayData?.signups ?? 0, todayData?.cancellations ?? 0, range);
    }

    const signupsData = sanitizeChartData(subscriptionData, range, 'signups', 'sum', aggregationStrategy);
    const cancellationsData = sanitizeChartData(subscriptionData, range, 'cancellations', 'sum', aggregationStrategy);

    const merged = mergeByDate(signupsData, cancellationsData, (s, c, date) => ({
        date,
        signups: s?.signups ?? 0,
        cancellations: c?.cancellations ?? 0
    }));

    return fillMissingDataPoints(merged, range, aggregationStrategy)
        .map(item => toChartItem(item, range, resolution));
};

const buildFromMemberData = (
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
        return buildTodayChartData(todayData?.paid_subscribed ?? 0, todayData?.paid_canceled ?? 0, range);
    }

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);

    const merged = mergeByDate(subscribedData, canceledData, (s, c, date) => ({
        date,
        signups: s?.paid_subscribed ?? 0,
        cancellations: c?.paid_canceled ?? 0
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
    payload: {payload?: ChartDataItem},
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

    return (
        <div className='flex w-full flex-col'>
            {index === 0 && (
                <div className="mb-1 text-sm font-medium text-foreground">{tooltipDate}</div>
            )}
            <div className='flex w-full items-center justify-between gap-4'>
                <div className='flex items-center gap-1'>
                    <div
                        className="size-2 shrink-0 rounded-full bg-[var(--color-bg)] opacity-50"
                        style={{'--color-bg': `var(--color-${nameKey})`} as React.CSSProperties}
                    />
                    <span className='text-sm text-muted-foreground'>
                        {PAID_CHANGE_CHART_CONFIG[nameKey]?.label ?? name}
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
        const hasSubscriptionData = subscriptionData && subscriptionData.length > 0;
        return hasSubscriptionData
            ? buildFromSubscriptionData(subscriptionData!, range, aggregationStrategy, selectedResolution)
            : buildFromMemberData(memberData, range, aggregationStrategy, selectedResolution);
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const totals = useMemo(() => ({
        new: chartData.reduce((sum, item) => sum + item.new, 0),
        cancelled: chartData.reduce((sum, item) => sum + Math.abs(item.cancelled), 0