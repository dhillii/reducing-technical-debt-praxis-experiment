import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

// ---------- Helper Functions ----------

// Return totals based on API meta or latest member data
function resolveCurrentTotals(memberData: MemberStatusItem[], metaTotals?: {paid: number; free: number; comped: number}) {
    if (metaTotals) {
        return metaTotals;
    }
    const latest = memberData[memberData.length - 1];
    return {
        free: latest?.free ?? 0,
        paid: latest?.paid ?? 0,
        comped: latest?.comped ?? 0
    };
}

// Compute percentage change and direction for a numeric metric
function computeChange(current: number, start: number) {
    if (start === 0) {
        const pct = current > 0 ? 100 : 0;
        return {pct: formatPercentage(pct / 100), dir: pct > 0 ? 'up' : 'same' as DiffDirection};
    }
    const change = ((current - start) / start) * 100;
    return {pct: formatPercentage(change / 100), dir: change > 0 ? 'up' : change < 0 ? 'down' : 'same' as DiffDirection};
}

// Calculate member‑related percent changes and directions
function calculateMemberChanges(memberData: MemberStatusItem[]) {
    const first = memberData[0];
    const latest = memberData[memberData.length - 1];
    const firstTotal = first.free + first.paid + first.comped;
    const latestTotal = latest.free + latest.paid + latest.comped;

    const total = computeChange(latestTotal, firstTotal);
    const free = computeChange(latest.free, first.free);
    const paidComped = computeChange(latest.paid + latest.comped, first.paid + first.comped);

    return {
        total,
        free,
        paid: paidComped
    };
}

// Calculate MRR percent change and direction
function calculateMrrChanges(mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) {
    const actualStart = moment(dateFrom).format('YYYY-MM-DD');
    const firstActual = mrrData.find(p => moment(p.date).isSameOrAfter(actualStart));

    const isFromBeginning = moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
        moment(dateFrom).year() < moment().year();

    let startMrr = 0;
    if (firstActual) {
        if (moment(firstActual.date).isSame(actualStart, 'day')) {
            startMrr = firstActual.mrr;
        } else {
            startMrr = isFromBeginning ? 0 : totalMrr;
        }
    } else {
        startMrr = isFromBeginning ? 0 : totalMrr;
    }

    return computeChange(totalMrr, startMrr);
}

// Select currency with highest total MRR
function selectCurrency(totals: {currency: string; mrr: number}[]) {
    if (!totals?.length) {
        return 'usd';
    }
    return totals.reduce((max, cur) => (cur.mrr > max.mrr ? cur : max), totals[0]).currency;
}

// Filter MRR data by selected currency and start date
function filterMrrByCurrencyAndDate(
    data: MrrHistoryItem[],
    currency: string,
    startMoment: moment.Moment
) {
    return data
        .filter(d => d.currency === currency && moment(d.date).isSameOrAfter(startMoment));
}

// Ensure a data point exists at the start of the range
function ensureStartPoint(
    data: MrrHistoryItem[],
    allData: MrrHistoryItem[],
    startMoment: moment.Moment
) {
    const hasStart = data.some(item => moment(item.date).isSame(startMoment, 'day'));
    if (hasStart) {
        return data;
    }
    const before = allData.find(item => moment(item.date).isBefore(startMoment));
    if (before) {
        return [{...before, date: startMoment.format('YYYY-MM-DD')}, ...data];
    }
    if (data.length) {
        const earliest = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        return [{...earliest, date: startMoment.format('YYYY-MM-DD')}, ...data];
    }
    return data;
}

// Ensure a data point exists at the end of the range
function ensureEndPoint(
    data: MrrHistoryItem[],
    endMoment: moment.Moment
) {
    const hasEnd = data.some(item => moment(item.date).isSame(endMoment, 'day'));
    if (hasEnd || !data.length) {
        return data;
    }
    const mostRecent = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    return [...data, {...mostRecent, date: endMoment.format('YYYY-MM-DD')}];
}

// ---------- Core Calculations ----------

const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) => {
    if (!memberData.length) {
        return {
            totalMembers: 0,
            freeMembers: 0,
            paidMembers: 0,
            mrr: 0,
            percentChanges: {total: '0%', free: '0%', paid: '0%', mrr: '0%'},
            directions: {total: 'same', free: 'same', paid: 'same', mrr: 'same'}
        };
    }

    const currentTotals = resolveCurrentTotals(memberData, memberCountTotals);
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;

    const latestMrr = mrrData.length ? mrrData[mrrData.length - 1].mrr : 0;

    const percentChanges: Record<string, string> = {total: '0%', free: '0%', paid: '0%', mrr: '0%'};
    const directions: Record<string, DiffDirection> = {total: 'same', free: 'same', paid: 'same', mrr: 'same'};

    if (memberData.length > 1) {
        const {total, free, paid} = calculateMemberChanges(memberData);
        percentChanges.total = total.pct;
        directions.total = total.dir;
        percentChanges.free = free.pct;
        directions.free = free.dir;
        percentChanges.paid = paid.pct;
        directions.paid = paid.dir;
    }

    if (mrrData.length > 1) {
        const mrrChanges = calculateMrrChanges(mrrData, dateFrom, latestMrr);
        percentChanges.mrr = mrrChanges.pct;
        directions.mrr = mrrChanges.dir;
    }

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: latestMrr,
        percentChanges,
        directions
    };
};

// Format chart data
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMember = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrr = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMember.map(i => i.date);
    const mrrDates = sortedMrr.map(i => i.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const memberMap = new Map(sortedMember.map(i => [i.date, i]));
    const mrrMap = new Map(sortedMrr.map(i => [i.date, i]));

    let lastMember: MemberStatusItem | null = null;
    let lastMrr: MrrHistoryItem | null = null;

    return allDates.map(date => {
        const curMember = memberMap.get(date);
        if (curMember) lastMember = curMember;

        const curMrr = mrrMap.get(date);
        if (curMrr) lastMrr = curMrr;

        const free = lastMember?.free ?? 0;
        const paid = lastMember?.paid ?? 0;
        const comped = lastMember?.comped ?? 0;
        const paidTotal = paid + comped;
        const value = free + paidTotal;
        const mrr = lastMrr?.mrr ?? 0;
        const paidSubscribed = lastMember?.paid_subscribed ?? 0;
        const paidCanceled = lastMember?.paid_canceled ?? 0;

        return {
            date,
            value,
            free,
            paid: paidTotal,
            comped,
            mrr,
            paid_subscribed: paidSubscribed,
            paid_canceled: paidCanceled,
            formattedValue: formatNumber(value),
            label: 'Total members'
        };
    });
};

export const useGrowthStats = (range: number) => {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);
    const memberStartDate = range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom;

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: {date_from: memberStartDate}
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: {date_from: memberStartDate}
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemo(() => {
        let raw: MemberStatusItem[] = [];
        if (memberCountResponse?.stats) raw = memberCountResponse.stats;
        else if (Array.isArray(memberCountResponse)) raw = memberCountResponse;

        if (range === 1 && raw.length >= 2) {
            const yesterday = raw[raw.length - 2];
            const today = raw[raw.length - 1];
            const startToday = moment(dateFrom).format('YYYY-MM-DD');
            const startTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

            return [
                {...yesterday, date: startToday},
                {...today, date: startTomorrow}
            ];
        }
        return raw;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        const fromMoment = moment(dateFrom);
        const toMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

        if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const currency = selectCurrency(mrrHistoryResponse.meta.totals);
        const filtered = filterMrrByCurrencyAndDate(mrrHistoryResponse.stats, currency, fromMoment);
        const allSorted = [...mrrHistoryResponse.stats]
            .filter(d => d.currency === currency)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const withStart = ensureStartPoint(filtered, allSorted, fromMoment);
        const endCheck = range === 1 ? moment().startOf('day') : toMoment;
        const withEnd = ensureEndPoint(withStart, endCheck);

        const final = withEnd.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return {mrrData: final, selectedCurrency: currency};
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(
        () => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals),
        [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]
    );

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(
        () => isMemberCountLoading || isMrrLoading || isSubscriptionLoading,
        [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]
    );

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) return [];

        const merged = subscriptionStatsResponse.stats.reduce((acc, cur) => {
            const key = cur.date;
            if (!acc[key]) {
                acc[key] = {date: key, signups: 0, cancellations: 0};
            }
            acc[key].signups += cur.signups;
            acc[key].cancellations += cur.cancellations;
            return acc;
        }, {} as Record<string, {date: string; signups: number; cancellations: number}>);

        const array = Object.values(merged).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const fromMoment = moment(dateFrom);
        const toMoment = moment(endDate);
        return array.filter(item => {
            const d = moment(item.date);
            return d.isSameOrAfter(fromMoment) && d.isSameOrBefore(toMoment);
        });
    }, [subscriptionStatsResponse, dateFrom, endDate]);

    return {
        isLoading,
        memberData,
        mrrData,
        dateFrom,
        endDate,
        totals: totalsData,
        chartData,
        subscriptionData,
        selectedCurrency,
        currencySymbol
    };
};