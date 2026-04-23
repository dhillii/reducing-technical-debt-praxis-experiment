import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

export type DiffDirection = 'up' | 'down' | 'same';

const formatPercent = (value: number) => formatPercentage(value / 100);
const getDirection = (value: number): DiffDirection => (value > 0 ? 'up' : value < 0 ? 'down' : 'same');

const getFirstMrr = (dateFrom: string, mrrData: MrrHistoryItem[], totalMrr: number) => {
    const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
    const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));
    const isFromBeginningRange =
        moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
        moment(dateFrom).year() < moment().year();

    if (firstActualPoint) {
        if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
            return firstActualPoint.mrr;
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
                total: 'same',
                free: 'same',
                paid: 'same',
                mrr: 'same'
            }
        };
    }

    const currentTotals = memberCountTotals ?? memberData[memberData.length - 1];
    const latest = memberData[memberData.length - 1];
    const latestMrr = mrrData[mrrData.length - 1] ?? {mrr: 0};

    const totalMembers = currentTotals.free + currentTotals.paid + currentTotals.comped;
    const totalMrr = latestMrr.mrr;

    const percentChanges = {
        total: '0%',
        free: '0%',
        paid: '0%',
        mrr: '0%'
    };
    const directions = {
        total: 'same',
        free: 'same',
        paid: 'same',
        mrr: 'same'
    };

    if (memberData.length > 1) {
        const first = memberData[0];
        const firstTotal = first.free + first.paid + first.comped;

        if (firstTotal > 0) {
            const change = ((totalMembers - firstTotal) / firstTotal) * 100;
            percentChanges.total = formatPercent(change);
            directions.total = getDirection(change);
        }

        if (first.free > 0) {
            const change = ((latest.free - first.free) / first.free) * 100;
            percentChanges.free = formatPercent(change);
            directions.free = getDirection(change);
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latest.paid + latest.comped;
        if (firstPaidTotal > 0) {
            const change = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
            percentChanges.paid = formatPercent(change);
            directions.paid = getDirection(change);
        }
    }

    if (mrrData.length > 1) {
        const firstMrr = getFirstMrr(dateFrom, mrrData, totalMrr);
        if (firstMrr >= 0) {
            const change =
                firstMrr === 0
                    ? (totalMrr > 0 ? 100 : 0)
                    : ((totalMrr - firstMrr) / firstMrr) * 100;
            percentChanges.mrr = formatPercent(change);
            directions.mrr = getDirection(change);
        }
    }

    return {
        totalMembers,
        freeMembers: currentTotals.free,
        paidMembers: currentTotals.paid + currentTotals.comped,
        mrr: totalMrr,
        percentChanges,
        directions
    };
};

const formatChartData = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[]) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMemberData.map(item => item.date);
    const mrrDates = sortedMrrData.map(item => item.date);
    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    let lastMemberItem: MemberStatusItem | null = null;
    let lastMrrItem: MrrHistoryItem | null = null;

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

    return allDates.map(date => {
        const currentMemberItem = memberMap.get(date);
        if (currentMemberItem) lastMemberItem = currentMemberItem;

        const currentMrrItem = mrrMap.get(date);
        if (currentMrrItem) lastMrrItem = currentMrrItem;

        const free = lastMemberItem?.free ?? 0;
        const paid = lastMemberItem?.paid ?? 0;
        const comped = lastMemberItem?.comped ?? 0;
        const paidTotal = paid + comped;
        const value = free + paidTotal;
        const mrr = lastMrrItem?.mrr ?? 0;
        const paidSubscribed = lastMemberItem?.paid_subscribed ?? 0;
        const paidCanceled = lastMemberItem?.paid_canceled ?? 0;

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
        let rawData: MemberStatusItem[] = [];
        if (memberCountResponse?.stats) rawData = memberCountResponse.stats;
        else if (Array.isArray(memberCountResponse)) rawData = memberCountResponse;

        if (range === 1 && rawData.length >= 2) {
            const yesterdayData = rawData[rawData.length - 2];
            const todayData = rawData[rawData.length - 1];
            const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
            const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');
            return [
                {...yesterdayData, date: startOfToday},
                {...todayData, date: startOfTomorrow}
            ];
        }
        return rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        const dateFromMoment = moment(dateFrom);
        const dateToMoment = range === 1 ? moment().endOf('day') : moment().startOf('day');

        if (mrrHistoryResponse?.stats && mrrHistoryResponse?.meta?.totals) {
            const totals = mrrHistoryResponse.meta.totals;
            const useCurrency = totals.reduce((max, curr) => (curr.mrr > max.mrr ? curr : max), totals[0]).currency;
            const currencyFiltered = mrrHistoryResponse.stats.filter(d => d.currency === useCurrency);
            const filtered = currencyFiltered.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));
            const allData = [...currencyFiltered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const result = [...filtered];
            const hasStart = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
            if (!hasStart) {
                const before = allData.find(item => moment(item.date).isBefore(dateFromMoment));
                if (before) {
                    result.unshift({...before, date: dateFromMoment.format('YYYY-MM-DD')});
                } else if (result.length) {
                    const earliest = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
                    result.unshift({...earliest, date: dateFromMoment.format('YYYY-MM-DD')});
                }
            }

            const endDateToCheck = range === 1 ? moment().startOf('day') : dateToMoment;
            const hasEnd = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
            if (!hasEnd && result.length) {
                const mostRecent = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                result.push({...mostRecent, date: endDateToCheck.format('YYYY-MM-DD')});
            }

            return {mrrData: result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), selectedCurrency: useCurrency};
        }
        return {mrrData: [], selectedCurrency: 'usd'};
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

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