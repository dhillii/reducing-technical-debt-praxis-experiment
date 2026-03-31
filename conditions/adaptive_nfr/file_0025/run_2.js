```typescript
import React, {useEffect, useMemo, useState} from 'react';
import moment from 'moment';
import {Card, CardContent, CardDescription, CardHeader, CardTitle, ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, EmptyIndicator, LucideIcon, Recharts, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, formatDisplayDateWithRange, formatNumber, getRangeDates} from '@tryghost/shade';
import {determineAggregationStrategy, getPeriodText, sanitizeChartData} from '@src/utils/chart-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResolutionOption = 'daily' | 'weekly' | 'monthly';
type AggregationStrategy = 'none' | 'weekly' | 'monthly';

type DataPoint = {date: string; signups: number; cancellations: number};
type ChartDataPoint = {date: string; rawDate: string; new: number; cancelled: number};

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

// ─── Range / Resolution Helpers ───────────────────────────────────────────────

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

// ─── Data Helpers ─────────────────────────────────────────────────────────────

const buildTodayDataPoint = (
    data: DataPoint[],
    signupsKey: keyof DataPoint = 'signups',
    cancellationsKey: keyof DataPoint = 'cancellations'
): DataPoint[] => {
    const today = moment().format('YYYY-MM-DD');
    const todayData = data.find(item => item.date === today);
    return [{
        date: today,
        signups: (todayData?.[signupsKey] as number) || 0,
        cancellations: (todayData?.[cancellationsKey] as number) || 0
    }];
};

const mergeDateSeries = <T extends {date: string}>(
    primary: T[],
    secondary: T[],
    mergeItem: (primaryItem: T, secondaryMap: Map<string, T>) => DataPoint
): DataPoint[] => {
    const secondaryMap = new Map(secondary.map(item => [item.date, item]));
    const merged = primary.map(item => mergeItem(item, secondaryMap));

    const mergedDates = new Set(merged.map(item => item.date));
    secondary.forEach((item) => {
        if (!mergedDates.has(item.date)) {
            merged.push(mergeItem({date: item.date} as T, secondaryMap));
        }
    });

    return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const fillMissingDataPoints = (
    data: DataPoint[],
    dateRange: number,
    overrideStrategy?: AggregationStrategy
): DataPoint[] => {
    if (dateRange === 1) {
        return buildTodayDataPoint(data);
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);
    const dataMap = new Map(data.map(item => [item.date, item]));

    const emptyPoint = (date: string): DataPoint => ({date, signups: 0, cancellations: 0});
    const getOrEmpty = (dateKey: string) => dataMap.get(dateKey) ?? emptyPoint(dateKey);

    const periodConfig: Record<string, {unit: moment.unitOfTime.DurationConstructor; startOf: moment.unitOfTime.StartOf}> = {
        monthly: {unit: 'month', startOf: 'month'},
        weekly: {unit: 'week', startOf: 'week'}
    };

    if (strategy in periodConfig) {
        const {unit, startOf} = periodConfig[strategy];
        const current = moment(startDate).startOf(startOf);
        const end = moment(endDate).startOf(startOf);
        const result: DataPoint[] = [];
        const seen = new Set<string>();

        while (current.isSameOrBefore(end)) {
            const key = current.format('YYYY-MM-DD');
            if (!seen.has(key)) {
                seen.add(key);
                result.push(getOrEmpty(key));
            }
            current.add(1, unit);
        }
        return result;
    }

    // Daily
    const current = moment(startDate);
    const end = moment(endDate);
    const result: DataPoint[] = [];
    while (current.isSameOrBefore(end)) {
        result.push(getOrEmpty(current.format('YYYY-MM-DD')));
        current.add(1, 'day');
    }
    return result;
};

const toChartDataPoint = (
    item: DataPoint,
    range: number,
    resolution: ResolutionOption
): ChartDataPoint => ({
    date: formatDisplayDateWithRange(item.date, getEffectiveRange(range, resolution)),
    rawDate: item.date,
    new: item.signups || 0,
    cancelled: -(item.cancellations || 0)
});

// ─── Chart Data Builders ──────────────────────────────────────────────────────

const buildChartDataFromSubscriptions = (
    subscriptionData: {date: string; signups: number; cancellations: number}[],
    range: number,
    aggregationStrategy: AggregationStrategy,
    resolution: ResolutionOption
): ChartDataPoint[] => {
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

    const merged = mergeDateSeries(signupsData, cancellationsData, (item, cancelMap) => ({
        date: item.date,
        signups: (item as typeof signupsData[0]).signups || 0,
        cancellations: cancelMap.get(item.date)?.cancellations || 0
    }));

    const filled = fillMissingDataPoints(merged, range, aggregationStrategy);
    return filled.map(item => toChartDataPoint(item, range, resolution));
};

const buildChartDataFromMemberData = (
    memberData: PaidMembersChangeChartProps['memberData'],
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
        return [{
            date: formatDisplayDateWithRange(today, range),
            rawDate: today,
            new: todayData?.paid_subscribed || 0,
            cancelled: -(todayData?.paid_canceled || 0)
        }];
    }

    const subscribedData = sanitizeChartData(memberData, range, 'paid_subscribed', 'sum', aggregationStrategy);
    const canceledData = sanitizeChartData(memberData, range, 'paid_canceled', 'sum', aggregationStrategy);

    const merged = mergeDateSeries(subscribedData, canceledData, (item, cancelMap) => ({
        date: item.date,
        signups: (item as typeof subscribedData[0]).paid_subscribed || 0,
        cancellations: cancelMap.get(item.date)?.paid_canceled || 0
    }));

    return merged.map(item => toChartDataPoint(item, range, resolution));
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
                        {resolution.charAt(0).toUpperCase() + resolution.slice(1)}
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

const TooltipFormatter = (
    value: unknown,
    name: string,
    payload: {payload?: {new?: number; cancelled?: number; rawDate?: string; date?: string}},
    index: number,
    selectedResolution: ResolutionOption
) => {
    const rawValue = Number(value);
    const displayValue = rawValue === 0
        ? '0'
        : rawValue < 0 ? formatNumber(rawValue * -1) : formatNumber(rawValue);

    const newValue = Number(payload?.payload?.new || 0);
    const cancelledValue = Number(payload?.payload?.cancelled || 0);
    const netChange = newValue + cancelledValue;
    const netChangeFormatted = netChange === 0
        ? '0'
        : netChange > 0 ? `+${formatNumber(netChange)}` : formatNumber(netChange);

    let tooltipDate = payload?.payload?.date;
    if (payload?.payload?.rawDate) {
        const rangeForFormat = RESOLUTION_TO_RANGE_THRESHOLD[selectedResolution];
        tooltipDate = formatDisplayDateWithRange(payload.payload.rawDate, rangeForFormat);
    }

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
                        {PAID_CHANGE_CHART_CONFIG[name as keyof typeof PAID_CHANGE_CHART_CONFIG]?.label || name}
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

    const chartData = useMemo<ChartDataPoint[]>(() => {
        if (subscriptionData?.length) {
            return buildChartDataFromSubscriptions(subscriptionData, range, aggregationStrategy, selectedResolution);
        }
        return buildChartDataFromMemberData(memberData, range, aggregationStrategy, selectedResolution);
    }, [memberData, subscriptionData, range, aggregationStrategy, selectedResolution]);

    const totals = useMemo(() => ({
        new: chartData.reduce((sum, item) => sum + item.new, 0),
        cancelled: chartData.reduce((sum, item)