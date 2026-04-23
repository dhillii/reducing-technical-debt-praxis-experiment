import moment from 'moment';
import {
    MemberStatusItem,
    MrrHistoryItem,
    useMemberCountHistory,
    useMrrHistory,
    useSubscriptionStats
} from '@tryghost/admin-x-framework/api/stats';
import {
    formatNumber,
    formatPercentage,
    formatQueryDate,
    getRangeDates
} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

const getDirection = (change: number): DiffDirection =>
    change > 0 ? 'up' : change < 0 ? 'down' : 'same';

const computeMemberChanges = (
    memberData: MemberStatusItem[],
    currentTotals: {free: number; paid: number; comped: number}
) => {
    const first = memberData[0];
    const latest = memberData[memberData.length - 1];

    const firstTotal = first.free + first.paid + first.comped;
    const latestPaidTotal = latest.paid + latest.comped;
    const firstPaidTotal = first.paid + first.comped;

    const changes: {
        total: {percent: string; direction: DiffDirection};
        free: {percent: string; direction: DiffDirection};
        paid: {percent: string; direction: DiffDirection};
    } = {
        total: {percent: '0%', direction: 'same'},
        free: {percent: '0%', direction: 'same'},
        paid: {percent: '0%', direction: 'same'}
    };

    if (firstTotal > 0) {
        const totalChange = ((currentTotals.free + currentTotals.paid + currentTotals.comped - firstTotal) / firstTotal) * 100;
        changes.total.percent = formatPercentage(totalChange / 100);
        changes.total.direction = getDirection(totalChange);
    }

    if (first.free > 0) {
        const freeChange = ((currentTotals.free - first.free) / first.free) * 100;
        changes.free.percent = formatPercentage(freeChange / 100);
        changes.free.direction = getDirection(freeChange);
    }

    if (firstPaidTotal > 0) {
        const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
        changes.paid.percent = formatPercentage(paidChange / 100);
        changes.paid.direction = getDirection(paidChange);
    }

    return changes;
};

const computeMrrChanges = (
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number
) => {
    if (mrrData.length < 2) {
        return {percent: '0%', direction: 'same' as DiffDirection};
    }

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

    const change = startMrr === 0
        ? totalMrr > 0 ? 100 : 0
        : ((totalMrr - startMrr) / startMrr) * 100;

    return {
        percent: formatPercentage(change / 100),
        direction: getDirection(change) as DiffDirection
    };
};

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

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latestMrr = mrrData.length ? mrrData[mrrData.length - 1].mrr : 0;
    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;

    const memberChanges = memberData.length > 1
        ? computeMemberChanges(memberData, currentTotals)
        : {
            total: {percent: '0%', direction: 'same' as DiffDirection},
            free: {percent: '0%', direction: 'same' as DiffDirection},
            paid: {percent: '0%', direction: 'same' as DiffDirection}
        };

    const mrrChanges = computeMrrChanges(mrrData, dateFrom, latestMrr);

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: latestMrr,
        percentChanges: {
            total: memberChanges.total.percent,
            free: memberChanges.free.percent,
            paid: memberChanges.paid.percent,
            mrr: mrrChanges.percent
        },
        directions: {
            total: memberChanges.total.direction,
            free: memberChanges.free.direction,
            paid: memberChanges.paid.direction,
            mrr: mrrChanges.direction
        }
    };
};

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMember = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrr = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const allDates = Array.from(
        new Set([...sortedMember.map(i => i.date), ...sortedMrr.map(i => i.date)])
    ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

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

        if (memberCountResponse?.stats) raw = memberCountResponse.stats;
        else if (Array.isArray(memberCountResponse)) raw = memberCountResponse;

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
        const fromMoment = moment(dateFrom);
        const toMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

        if (!mrrHistoryResponse?.stats || !mrrHistoryResponse?.meta?.totals) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const bestCurrency = mrrHistoryResponse.meta.totals.reduce((best, cur) =>
            cur.mrr > best.mrr ? cur : best, mrrHistoryResponse.meta.totals[0]);

        const filtered = mrrHistoryResponse.stats
            .filter(d => d.currency === bestCurrency.currency)
            .filter(d => moment(d.date).isSameOrAfter(fromMoment));

        const allSorted = [...mrrHistoryResponse.stats]
            .filter(d => d.currency === bestCurrency.currency)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const ensureStart = (data: MrrHistoryItem[]) => {
            const hasStart = data.some(i => moment(i.date).isSame(fromMoment, 'day'));
            if (hasStart) return data;

            const before = allSorted.find(i => moment(i.date).isBefore(fromMoment));
            if (before) {
                return [{...before, date: fromMoment.format('YYYY-MM-DD')}, ...data];
            }
            if (data.length) {
                const earliest = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
                return [{...earliest, date: fromMoment.format('YYYY-MM-DD')}, ...data];
            }
            return data;
        };

        const ensureEnd = (data: MrrHistoryItem[]) => {
            const endCheck = range === 1 ? moment().startOf('day') : toMoment;
            const hasEnd = data.some(i => moment(i.date).isSame(endCheck, 'day'));
            if (hasEnd || !data.length) return data;

            const mostRecent = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            return [...data, {...mostRecent, date: endCheck.format('YYYY-MM-DD')}];
        };

        const finalData = ensureEnd(ensureStart(filtered)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return {mrrData: finalData, selectedCurrency: bestCurrency.currency};
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
            if (!acc[key]) acc[key] = {date: key, signups: 0, cancellations: 0};
            acc[key].signups += cur.signups;
            acc[key].cancellations += cur.cancellations;
            return acc;
        }, {} as Record<string, {date: string; signups: number; cancellations: number}>);

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