import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

/**
 * Compute the current totals either from API meta or the latest time‑series entry.
 */
function getCurrentTotals(memberData: MemberStatusItem[], metaTotals?: {paid: number; free: number; comped: number}) {
    if (metaTotals) {
        return metaTotals;
    }
    const latest = memberData[memberData.length - 1] ?? {free: 0, paid: 0, comped: 0};
    return {
        free: latest.free,
        paid: latest.paid,
        comped: latest.comped
    };
}

/**
 * Calculate percentage change and direction for a numeric metric.
 */
function calculateChange(current: number, start: number) {
    if (start === 0) {
        return {
            percent: formatPercentage(current > 0 ? 1 : 0),
            direction: current > 0 ? 'up' : 'same' as DiffDirection
        };
    }
    const change = ((current - start) / start) * 100;
    return {
        percent: formatPercentage(change / 100),
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same' as DiffDirection
    };
}

/**
 * Derive member‑related percentage changes and directions.
 */
function getMemberChanges(memberData: MemberStatusItem[]) {
    const percentChanges = {
        total: '0%',
        free: '0%',
        paid: '0%'
    };
    const directions = {
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection
    };

    if (memberData.length < 2) {
        return {percentChanges, directions};
    }

    const first = memberData[0];
    const latest = memberData[memberData.length - 1];
    const firstTotal = first.free + first.paid + first.comped;
    const latestTotal = latest.free + latest.paid + latest.comped;

    if (firstTotal > 0) {
        const {percent, direction} = calculateChange(latestTotal, firstTotal);
        percentChanges.total = percent;
        directions.total = direction;
    }

    if (first.free > 0) {
        const {percent, direction} = calculateChange(latest.free, first.free);
        percentChanges.free = percent;
        directions.free = direction;
    }

    const firstPaid = first.paid + first.comped;
    const latestPaid = latest.paid + latest.comped;
    if (firstPaid > 0) {
        const {percent, direction} = calculateChange(latestPaid, firstPaid);
        percentChanges.paid = percent;
        directions.paid = direction;
    }

    return {percentChanges, directions};
}

/**
 * Find the appropriate starting MRR value for the selected range.
 */
function determineStartMrr(mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) {
    const actualStart = moment(dateFrom).format('YYYY-MM-DD');
    const firstActual = mrrData.find(p => moment(p.date).isSameOrAfter(actualStart));
    const isFromBeginning = moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
        moment(dateFrom).year() < moment().year();

    if (firstActual) {
        if (moment(firstActual.date).isSame(actualStart, 'day')) {
            return firstActual.mrr;
        }
        return isFromBeginning ? 0 : totalMrr;
    }

    return isFromBeginning ? 0 : totalMrr;
}

/**
 * Derive MRR‑related percentage changes and directions.
 */
function getMrrChanges(mrrData: MrrHistoryItem[], dateFrom: string, totalMrr: number) {
    const percentChanges = {mrr: '0%'};
    const directions = {mrr: 'same' as DiffDirection};

    if (mrrData.length < 2) {
        return {percentChanges, directions};
    }

    const startMrr = determineStartMrr(mrrData, dateFrom, totalMrr);
    const mrrChange = startMrr === 0
        ? (totalMrr > 0 ? 100 : 0)
        : ((totalMrr - startMrr) / startMrr) * 100;

    percentChanges.mrr = formatPercentage(mrrChange / 100);
    directions.mrr = mrrChange > 0 ? 'up' : mrrChange < 0 ? 'down' : 'same' as DiffDirection;

    return {percentChanges, directions};
}

/**
 * Aggregate totals, percentage changes and directions for members and MRR.
 */
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
            percentChanges: {
                total: '0%',
                free: '0%',
                paid: '0%',
                mrr: '0%'
            },
            directions: {
                total: 'same' as DiffDirection,
                free: 'same' as DiffDirection,
                paid: 'same' as DiffDirection,
                mrr: 'same' as DiffDirection
            }
        };
    }

    const current = getCurrentTotals(memberData, memberCountTotals);
    const totalMembers = current.free + current.paid + current.comped;
    const latestMrr = mrrData[mrrData.length - 1]?.mrr ?? 0;

    const {percentChanges: memberPercents, directions: memberDirs} = getMemberChanges(memberData);
    const {percentChanges: mrrPercents, directions: mrrDirs} = getMrrChanges(mrrData, dateFrom, latestMrr);

    return {
        totalMembers,
        freeMembers: current.free,
        paidMembers: current.paid + current.comped,
        mrr: latestMrr,
        percentChanges: {
            ...memberPercents,
            ...mrrPercents
        },
        directions: {
            ...memberDirs,
            ...mrrDirs
        }
    };
};

/**
 * Ensure the MRR data contains a point at the start of the requested range.
 */
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

/**
 * Ensure the MRR data contains a point at the end of the requested range.
 */
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

/**
 * Process raw MRR history into a filtered, currency‑specific, range‑bounded array.
 */
function processMrrHistory(
    response: any,
    dateFrom: string,
    range: number,
    dateToMoment: moment.Moment
) {
    if (!response?.stats || !response?.meta?.totals) {
        return {mrrData: [], selectedCurrency: 'usd'};
    }

    // Choose currency with highest total MRR
    const totals = response.meta.totals;
    let selected = totals[0];
    for (const t of totals) {
        if (t.mrr > selected.mrr) {
            selected = t;
        }
    }
    const currency = selected.currency;

    // Filter by currency and start date
    const allCurrencyData = response.stats.filter((d: any) => d.currency === currency);
    const startMoment = moment(dateFrom);
    const filtered = allCurrencyData.filter((item: any) => moment(item.date).isSameOrAfter(startMoment));

    // Ensure start/end points exist
    const withStart = ensureStartPoint(filtered, allCurrencyData, startMoment);
    const finalData = ensureEndPoint(withStart, dateToMoment);

    // Sort chronologically
    const sorted = finalData.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {mrrData: sorted, selectedCurrency: currency};
}

/**
 * Format chart data by merging member and MRR series on a unified date axis.
 */
const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMembers = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrr = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberMap = new Map(sortedMembers.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrr.map(item => [item.date, item]));

    const allDates = Array.from(new Set([...memberMap.keys(), ...mrrMap.keys()])).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    let lastMember: MemberStatusItem | null = null;
    let lastMrr: MrrHistoryItem | null = null;

    return allDates.map(date => {
        const member = memberMap.get(date);
        if (member) {
            lastMember = member;
        }
        const mrr = mrrMap.get(date);
        if (mrr) {
            lastMrr = mrr;
        }

        const free = lastMember?.free ?? 0;
        const paid = lastMember?.paid ?? 0;
        const comped = lastMember?.comped ?? 0;
        const paidTotal = paid + comped;
        const value = free + paidTotal;
        const mrrValue = lastMrr?.mrr ?? 0;
        const paidSubscribed = lastMember?.paid_subscribed ?? 0;
        const paidCanceled = lastMember?.paid_canceled ?? 0;

        return {
            date,
            value,
            free,
            paid: paidTotal,
            comped,
            mrr: mrrValue,
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

    const memberDataStartDate = range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom;

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: {date_from: memberDataStartDate}
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemo(() => {
        let raw: MemberStatusItem[] = [];

        if (memberCountResponse?.stats) {
            raw = memberCountResponse.stats;
        } else if (Array.isArray(memberCountResponse)) {
            raw = memberCountResponse;
        }

        if (range === 1 && raw.length >= 2) {
            const yesterday = raw[raw.length - 2];
            const today = raw[raw.length - 1];
            const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
            const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

            return [
                {...yesterday, date: startOfToday},
                {...today, date: startOfTomorrow}
            ];
        }

        return raw;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');
        return processMrrHistory(mrrHistoryResponse, dateFrom, range, dateToMoment);
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
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        const merged = subscriptionStatsResponse.stats.reduce((acc: Record<string, {date: string; signups: number; cancellations: number}>, cur) => {
            const key = cur.date;
            if (!acc[key]) {
                acc[key] = {date: key, signups: 0, cancellations: 0};
            }
            acc[key].signups += cur.signups;
            acc[key].cancellations += cur.cancellations;
            return acc;
        }, {});

        const array = Object.values(merged).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const from = moment(dateFrom);
        const to = moment(endDate);
        return array.filter(item => {
            const d = moment(item.date);
            return d.isSameOrAfter(from) && d.isSameOrBefore(to);
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