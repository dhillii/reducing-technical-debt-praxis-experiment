import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

/**
 * @typedef {'up' | 'down' | 'same'} DiffDirection
 */

/**
 * @param {MemberStatusItem[]} memberData
 * @param {MrrHistoryItem[]} mrrData
 * @param {string} dateFrom
 * @param {{paid: number; free: number; comped: number} | undefined} memberCountTotals
 * @returns {{
 *   totalMembers: number;
 *   freeMembers: number;
 *   paidMembers: number;
 *   mrr: number;
 *   percentChanges: {total: string; free: string; paid: string; mrr: string};
 *   directions: {total: DiffDirection; free: DiffDirection; paid: DiffDirection; mrr: DiffDirection}
 * }}
 */
const calculateTotals = (memberData, mrrData, dateFrom, memberCountTotals) => {
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

    const currentTotals = memberCountTotals || memberData[memberData.length - 1];
    const latest = memberData.length > 0 ? memberData[memberData.length - 1] : {free: 0, paid: 0, comped: 0};
    const latestMrr = mrrData.length > 0 ? mrrData[mrrData.length - 1] : {mrr: 0};

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
            const totalChange = ((totalMembers - firstTotal) / firstTotal) * 100;
            percentChanges.total = formatPercentage(totalChange / 100);
            directions.total = totalChange > 0 ? 'up' : totalChange < 0 ? 'down' : 'same';
        }

        if (first.free > 0) {
            const freeChange = ((latest.free - first.free) / first.free) * 100;
            percentChanges.free = formatPercentage(freeChange / 100);
            directions.free = freeChange > 0 ? 'up' : freeChange < 0 ? 'down' : 'same';
        }

        const firstPaidTotal = first.paid + first.comped;
        const latestPaidTotal = latest.paid + latest.comped;

        if (firstPaidTotal > 0) {
            const paidChange = ((latestPaidTotal - firstPaidTotal) / firstPaidTotal) * 100;
            percentChanges.paid = formatPercentage(paidChange / 100);
            directions.paid = paidChange > 0 ? 'up' : paidChange < 0 ? 'down' : 'same';
        }
    }

    if (mrrData.length > 1) {
        const actualStartDate = moment(dateFrom).format('YYYY-MM-DD');
        const firstActualPoint = mrrData.find(point => moment(point.date).isSameOrAfter(actualStartDate));

        const isFromBeginningRange =
            moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
            moment(dateFrom).year() < moment().year();

        let firstMrr = 0;

        if (firstActualPoint) {
            if (moment(firstActualPoint.date).isSame(actualStartDate, 'day')) {
                firstMrr = firstActualPoint.mrr;
            } else {
                if (isFromBeginningRange) {
                    firstMrr = 0;
                } else {
                    firstMrr = totalMrr;
                }
            }
        } else if (isFromBeginningRange) {
            firstMrr = 0;
        } else {
            firstMrr = totalMrr;
        }

        if (firstMrr >= 0) {
            const mrrChange =
                firstMrr === 0
                    ? (totalMrr > 0 ? 100 : 0)
                    : ((totalMrr - firstMrr) / firstMrr) * 100;

            percentChanges.mrr = formatPercentage(mrrChange / 100);
            directions.mrr = mrrChange > 0 ? 'up' : mrrChange < 0 ? 'down' : 'same';
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

/**
 * @param {MemberStatusItem[]} memberData
 * @param {MrrHistoryItem[]} mrrData
 * @returns {Array<{
 *   date: string;
 *   value: number;
 *   free: number;
 *   paid: number;
 *   comped: number;
 *   mrr: number;
 *   paid_subscribed: number;
 *   paid_canceled: number;
 *   formattedValue: string;
 *   label: string;
 * }>}
 */
const formatChartData = (memberData, mrrData) => {
    const sortedMemberData = [...memberData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedMrrData = [...mrrData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const memberDates = sortedMemberData.map(item => item.date);
    const mrrDates = sortedMrrData.map(item => item.date);

    const allDates = [...new Set([...memberDates, ...mrrDates])].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    let lastMemberItem = null;
    let lastMrrItem = null;

    const memberMap = new Map(sortedMemberData.map(item => [item.date, item]));
    const mrrMap = new Map(sortedMrrData.map(item => [item.date, item]));

    return allDates.map(date => {
        const currentMemberItem = memberMap.get(date);
        if (currentMemberItem) {
            lastMemberItem = currentMemberItem;
        }

        const currentMrrItem = mrrMap.get(date);
        if (currentMrrItem) {
            lastMrrItem = currentMrrItem;
        }

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

/**
 * @param {any} response
 * @returns {boolean}
 */
const hasMrrStatsAndTotals = response => !!response?.stats && !!response?.meta?.totals;

/**
 * @param {Array<{mrr: number; currency: string}>} totals
 * @returns {{mrr: number; currency: string} | undefined}
 */
const selectCurrencyWithHighestMrr = totals => {
    if (!totals.length) {
        return undefined;
    }
    let currentMax = totals[0];
    for (const total of totals) {
        if (total.mrr > currentMax.mrr) {
            currentMax = total;
        }
    }
    return currentMax;
};

/**
 * @param {Array<{currency: string}>} stats
 * @param {string} currency
 * @returns {Array<{currency: string}>}
 */
const filterMrrDataByCurrency = (stats, currency) => stats.filter(d => d.currency === currency);

/**
 * @param {Array<{date: string}>} data
 * @param {moment.Moment} dateFromMoment
 * @returns {Array<{date: string}>}
 */
const filterMrrDataByDate = (data, dateFromMoment) =>
    data.filter(item => moment(item.date).isSameOrAfter(dateFromMoment));

/**
 * @param {Array<{date: string}>} result
 * @param {moment.Moment} dateFromMoment
 * @param {Array<{date: string}>} allData
 * @returns {Array<{date: string}>}
 */
const ensureStartPoint = (result, dateFromMoment, allData) => {
    const hasStartPoint = result.some(item => moment(item.date).isSame(dateFromMoment, 'day'));
    if (hasStartPoint) {
        return result;
    }
    const mostRecentBeforeRange = allData.find(item => moment(item.date).isBefore(dateFromMoment));
    if (mostRecentBeforeRange) {
        return [{...mostRecentBeforeRange, date: dateFromMoment.format('YYYY-MM-DD')}, ...result];
    }
    if (result.length > 0) {
        const earliestInRange = [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        return [{...earliestInRange, date: dateFromMoment.format('YYYY-MM-DD')}, ...result];
    }
    return result;
};

/**
 * @param {Array<{date: string}>} result
 * @param {moment.Moment} endDateToCheck
 * @param {moment.Moment} dateToMoment
 * @returns {Array<{date: string}>}
 */
const ensureEndPoint = (result, endDateToCheck, dateToMoment) => {
    const hasEndPoint = result.some(item => moment(item.date).isSame(endDateToCheck, 'day'));
    if (hasEndPoint || result.length === 0) {
        return result;
    }
    const sortedResult = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const mostRecentValue = sortedResult[0];
    return [...result, {...mostRecentValue, date: endDateToCheck.format('YYYY-MM-DD')}];
};

/**
 * @param {Array<{date: string}>} data
 * @returns {Array<{date: string}>}
 */
const sortMrrData = data => data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

export const useGrowthStats = range => {
    const {startDate, endDate} = useMemo(() => getRangeDates(range), [range]);
    const dateFrom = formatQueryDate(startDate);

    const memberDataStartDate = range === 1 ? moment(dateFrom).subtract(1, 'day').format('YYYY-MM-DD') : dateFrom;

    const {data: memberCountResponse, isLoading: isMemberCountLoading} = useMemberCountHistory({
        searchParams: {
            date_from: memberDataStartDate
        }
    });

    const {data: mrrHistoryResponse, isLoading: isMrrLoading} = useMrrHistory({
        searchParams: {
            date_from: memberDataStartDate
        }
    });

    const {data: subscriptionStatsResponse, isLoading: isSubscriptionLoading} = useSubscriptionStats();

    const memberData = useMemo(() => {
        let rawData = [];
        if (memberCountResponse?.stats) {
            rawData = memberCountResponse.stats;
        } else if (Array.isArray(memberCountResponse)) {
            rawData = memberCountResponse;
        }

        if (range === 1 && rawData.length >= 2) {
            const yesterdayData = rawData[rawData.length - 2];
            const todayData = rawData[rawData.length - 1];
            const startOfToday = moment(dateFrom).format('YYYY-MM-DD');
            const startOfTomorrow = moment(dateFrom).add(1, 'day').format('YYYY-MM-DD');

            const startPoint = {...yesterdayData, date: startOfToday};
            const endPoint = {...todayData, date: startOfTomorrow};

            return [startPoint, endPoint];
        }

        return rawData;
    }, [memberCountResponse, range, dateFrom]);

    const {mrrData, selectedCurrency} = useMemo(() => {
        if (!hasMrrStatsAndTotals(mrrHistoryResponse)) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const totals = mrrHistoryResponse.meta.totals;
        const currentMax = selectCurrencyWithHighestMrr(totals);
        if (!currentMax) {
            return {mrrData: [], selectedCurrency: 'usd'};
        }

        const useCurrency = currentMax.currency;
        const currencyFilteredData = filterMrrDataByCurrency(mrrHistoryResponse.stats, useCurrency);

        const dateFromMoment = moment(dateFrom);
        const filteredData = filterMrrDataByDate(currencyFilteredData, dateFromMoment);

        const allData = [...currencyFilteredData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        let result = [...filteredData];

        result = ensureStartPoint(result, dateFromMoment, allData);

        const endDateToCheck = range === 1 ? moment().startOf('day') : moment().endOf('day');
        result = ensureEndPoint(result, endDateToCheck, dateFromMoment);

        const finalResult = sortMrrData(result);

        return {mrrData: finalResult, selectedCurrency: useCurrency};
    }, [mrrHistoryResponse, dateFrom, range]);

    const totalsData = useMemo(() => calculateTotals(memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals), [memberData, mrrData, dateFrom, memberCountResponse?.meta?.totals]);

    const chartData = useMemo(() => formatChartData(memberData, mrrData), [memberData, mrrData]);

    const currencySymbol = useMemo(() => getSymbol(selectedCurrency), [selectedCurrency]);

    const isLoading = useMemo(() => isMemberCountLoading || isMrrLoading || isSubscriptionLoading, [isMemberCountLoading, isMrrLoading, isSubscriptionLoading]);

    const subscriptionData = useMemo(() => {
        if (!subscriptionStatsResponse?.stats) {
            return [];
        }

        const mergedByDate = subscriptionStatsResponse.stats.reduce((acc, current) => {
            const dateKey = current.date;
            if (!acc[dateKey]) {
                acc[dateKey] = {date: dateKey, signups: 0, cancellations: 0};
            }
            acc[dateKey].signups += current.signups;
            acc[dateKey].cancellations += current.cancellations;
            return acc;
        }, {});

        const subscriptionArray = Object.values(mergedByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const dateFromMoment = moment(dateFrom);
        const dateToMoment = moment(endDate);
        return subscriptionArray.filter(item => {
            const itemDate = moment(item.date);
            return itemDate.isSameOrAfter(dateFromMoment) && itemDate.isSameOrBefore(dateToMoment);
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