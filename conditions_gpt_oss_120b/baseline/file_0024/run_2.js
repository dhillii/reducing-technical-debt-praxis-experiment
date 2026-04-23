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

const computeChange = (current: number, start: number) => {
    if (start === 0) {
        const percent = current > 0 ? 100 : 0;
        return {percent: formatPercentage(percent / 100), direction: current > 0 ? 'up' : 'same' as DiffDirection};
    }
    const diff = ((current - start) / start) * 100;
    const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same' as DiffDirection;
    return {percent: formatPercentage(diff / 100), direction};
};

const getFirstMrr = (
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    totalMrr: number,
    isFromBeginningRange: boolean
) => {
    const start = moment(dateFrom).format('YYYY-MM-DD');
    const firstActual = mrrData.find(p => moment(p.date).isSameOrAfter(start));

    if (firstActual) {
        if (moment(firstActual.date).isSame(start, 'day')) {
            return firstActual.mrr;
        }
        return isFromBeginningRange ? 0 : totalMrr;
    }

    return isFromBeginningRange ? 0 : totalMrr;
};

const calculateTotals = (
    memberData: MemberStatusItem[],
    mrrData: MrrHistoryItem[],
    dateFrom: string,
    memberCountTotals?: {paid: number; free: number; comped: number}
) => {
    if (!memberData.length) {
        const zero = {total: '0%', free: '0%', paid: '0%', mrr: '0%'} as const;
        const same: DiffDirection = 'same';
        return {
            totalMembers: 0,
            freeMembers: 0,
            paidMembers: 0,
            mrr: 0,
            percentChanges: zero,
            directions: {total: same, free: same, paid: same, mrr: same}
        };
    }

    const current = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData.length ? mrrData[mrrData.length - 1].mrr : 0;

    const totalMembers = current.free + current.paid + current.comped;
    const totalMrr = latestMrr;

    const percentChanges = {total: '0%', free: '0%', paid: '0%', mrr: '0%'} as const;
    const directions = {
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection,
        mrr: 'same' as DiffDirection
    };

    if (memberData.length > 1) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const {percent, direction} = computeChange(totalMembers, firstTotal);
            percentChanges.total = percent;
            directions.total = direction;
        }

        if (first.free > 0) {
            const {percent, direction} = computeChange(latest.free, first.free);
            percentChanges.free = percent;
            directions.free = direction;
        }

        const firstPaid = first.paid + first.comped;
        const latestPaid = latest.paid + latest.comped;
        if (firstPaid > 0) {
            const {percent, direction} = computeChange(latestPaid, firstPaid);
            percentChanges.paid = percent;
            directions.paid = direction;
        }
    }

    if (mrrData.length > 1) {
        const isFromBeginningRange =
            moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
            moment(dateFrom).year() < moment().year();

        const firstMrr = getFirstMrr(mrrData, dateFrom, totalMrr, isFromBeginningRange);
        const {percent, direction} = computeChange(totalMrr, firstMrr);
        percentChanges.mrr = percent;
        directions.mrr = direction;
    }

    return {
        totalMembers,
        freeMembers: current.free,
        paidMembers: current.paid + current.comped,
        mrr: totalMrr,
        percentChanges,
        directions
    };
};

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMembers = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrr = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const allDates = Array.from(
        new Set([...sortedMembers.map(i => i.date), ...sortedMrr.map(i => i.date)])
    ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const memberMap = new Map(sortedMembers.map(i => [i.date, i]));
    const mrrMap = new Map(sortedMrr.map(i => [i.date, i]));

    let lastMember: MemberStatusItem | null = null;
    let lastMrr: MrrHistoryItem | null = null;

    return allDates.map(date => {
        const curMember = memberMap.get(date);
        if (curMember) lastMember = curMember;

        const curMrr = mrrMap.get(date);
        if (curMrr) lastMrr = curMrr;

        const free = lastMember?.free ?? 0;
        const paid = (lastMember?.paid ?? 0) + (lastMember?.comped ?? 0);
        const comped = lastMember?.comped ?? 0;
        const value = free + paid;
        const mrr = lastMrr?.mrr ?? 0;
        const paidSubscribed = lastMember?.paid_subscribed ?? 0;
        const paidCanceled = lastMember?.paid_canceled ?? 0;

        return {
            date,
            value,
            free,
            paid,
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
            const start = moment(dateFrom).format('YYYY-MM-DD');
            const next = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

            return [
                {...yesterday, date: start},
                {...today, date: next}
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

        const totals = mrrHistoryResponse.meta.totals;
        const top = totals.reduce((max, cur) => (cur.mrr > max.mrr ? cur : max), totals[0] ?? {currency: 'usd', mrr: 0});
        const currency = top.currency;

        const filtered = mrrHistoryResponse.stats
            .filter(d => d.currency === currency && moment(d.date).isSameOrAfter(fromMoment))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (!filtered.length) return {mrrData: [], selectedCurrency: currency};

        const ensurePoint = (arr: MrrHistoryItem[], target: moment.Moment) => {
            const exists = arr.some(i => moment(i.date).isSame(target, 'day'));
            if (exists) return arr;

            const before = mrrHistoryResponse.stats
                .filter(i => i.currency === currency && moment(i.date).isBefore(target))
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

            if (before) {
                return [{...before, date: target.format('YYYY-MM-DD')}, ...arr];
            }

            const first = arr[0];
            return [{...first, date: target.format('YYYY-MM-DD')}, ...arr];
        };

        const withStart = ensurePoint(filtered, fromMoment);
        const endTarget = range === 1 ? moment().startOf('day') : toMoment;
        const finalData = ensurePoint(withStart, endTarget).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return {mrrData: finalData, selectedCurrency: currency};
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