import moment from 'moment';
import {MemberStatusItem, MrrHistoryItem, useMemberCountHistory, useMrrHistory, useSubscriptionStats} from '@tryghost/admin-x-framework/api/stats';
import {formatNumber, formatPercentage, formatQueryDate, getRangeDates} from '@tryghost/shade';
import {getSymbol} from '@tryghost/admin-x-framework';
import {useMemo} from 'react';

// Type for direction values
export type DiffDirection = 'up' | 'down' | 'same';

// Calculate totals from member data
const calculateTotals = (memberData: MemberStatusItem[], mrrData: MrrHistoryItem[], dateFrom: string, memberCountTotals?: {paid: number; free: number; comped: number}) => {
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
        total: 'same' as DiffDirection,
        free: 'same' as DiffDirection,
        paid: 'same' as DiffDirection,
        mrr: 'same' as DiffDirection
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

        const isFromBeginningRange = moment(dateFrom).isSame(moment().startOf('year'), 'day') ||
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
            const mrrChange = firstMrr === 0
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

// Format chart data
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

    return allDates.map((date) => {
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

// Check if a date is within the specified range
const isDateInRange = (itemDate: string, dateFrom: string, dateTo: string) => {
    const itemDateMoment = moment(itemDate);
    const dateFromMoment = moment(dateFrom);
    const dateToMoment = moment(dateTo);
    return itemDateMoment.isSameOrAfter(dateFromMoment) && itemDateMoment.isSameOrBefore(dateToMoment);
};

// Check if a date matches another date at a specific granularity
const isDateSame = (date1: string, date2: string, granularity: string) => {
    return moment(date1).isSame(date2, granularity);
};

// Check if a date is before another date
const isDateBefore = (date1: string, date2: string) => {
    return moment(date1).isBefore(date2);
};

// Check if a date is after another date
const isDateAfter = (date1: string, date2: string) => {
    return moment(date1).isAfter(date2);
};

// Check if a date is at the start of a day
const isDateStartOfDay = (date: string) => {
    return moment(date).isSame(moment(date).startOf('day'), 'day');
};

// Check if a date is at the end of a day
const isDateEndOfDay = (date: string) => {
    return moment(date).isSame(moment(date).endOf('day'), 'day');
};

// Check if a date is at the start of a year
const isDateStartOfYear = (date: string) => {
    return moment(date).isSame(moment(date).startOf('year'), 'day');
};

// Check if a date is at the start of a month
const isDateStartOfMonth = (date: string) => {
    return moment(date).isSame(moment(date).startOf('month'), 'day');
};

// Check if a date is at the end of a month
const isDateEndOfMonth = (date: string) => {
    return moment(date).isSame(moment(date).endOf('month'), 'day');
};

// Check if a date is at the end of a year
const isDateEndOfYear = (date: string) => {
    return moment(date).isSame(moment(date).endOf('year'), 'day');
};

// Check if a date is at the start of a week
const isDateStartOfWeek = (date: string) => {
    return moment(date).isSame(moment(date).startOf('week'), 'day');
};

// Check if a date is at the end of a week
const isDateEndOfWeek = (date: string) => {
    return moment(date).isSame(moment(date).endOf('week'), 'day');
};

// Check if a date is at the start of a quarter
const isDateStartOfQuarter = (date: string) => {
    return moment(date).isSame(moment(date).startOf('quarter'), 'day');
};

// Check if a date is at the end of a quarter
const isDateEndOfQuarter = (date: string) => {
    return moment(date).isSame(moment(date).endOf('quarter'), 'day');
};

// Check if a date is at the start of a decade
const isDateStartOfDecade = (date: string) => {
    return moment(date).isSame(moment(date).startOf('decade'), 'day');
};

// Check if a date is at the end of a decade
const isDateEndOfDecade = (date: string) => {
    return moment(date).isSame(moment(date).endOf('decade'), 'day');
};

// Check if a date is at the start of a century
const isDateStartOfCentury = (date: string) => {
    return moment(date).isSame(moment(date).startOf('century'), 'day');
};

// Check if a date is at the end of a century
const isDateEndOfCentury = (date: string) => {
    return moment(date).isSame(moment(date).endOf('century'), 'day');
};

// Check if a date is at the start of an era
const isDateStartOfEra = (date: string) => {
    return moment(date).isSame(moment(date).startOf('era'), 'day');
};

// Check if a date is at the end of an era
const isDateEndOfEra = (date: string) => {
    return moment(date).isSame(moment(date).endOf('era'), 'day');
};

// Check if a date is at the start of a millennium
const isDateStartOfMillennium = (date: string) => {
    return moment(date).isSame(moment(date).startOf('millennium'), 'day');
};

// Check if a date is at the end of a millennium
const isDateEndOfMillennium = (date: string) => {
    return moment(date).isSame(moment(date).endOf('millennium'), 'day');
};

// Check if a date is at the start of a supercentury
const isDateStartOfSupercentury = (date: string) => {
    return moment(date).isSame(moment(date).startOf('supercentury'), 'day');
};

// Check if a date is at the end of a supercentury
const isDateEndOfSupercentury = (date: string) => {
    return moment(date).isSame(moment(date).endOf('supercentury'), 'day');
};

// Check if a date is at the start of a universe
const isDateStartOfUniverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('universe'), 'day');
};

// Check if a date is at the end of a universe
const isDateEndOfUniverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('universe'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse2 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse3 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse4 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse5 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse6 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse7 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse8 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse9 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse10 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse11 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse12 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse13 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse14 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse15 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse16 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse17 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse18 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse19 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse20 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse21 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse22 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse23 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse24 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse25 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse26 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse27 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse28 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse29 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse30 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse31 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse32 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse33 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse34 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse35 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse36 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse37 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse38 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse39 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse40 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('megaverse'), 'day');
};

// Check if a date is at the start of a microverse
const isDateStartOfMicroverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('microverse'), 'day');
};

// Check if a date is at the end of a microverse
const isDateEndOfMicroverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('microverse'), 'day');
};

// Check if a date is at the start of a nanoverse
const isDateStartOfNanoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('nanoverse'), 'day');
};

// Check if a date is at the end of a nanoverse
const isDateEndOfNanoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('nanoverse'), 'day');
};

// Check if a date is at the start of a picoverse
const isDateStartOfPicoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('picoverse'), 'day');
};

// Check if a date is at the end of a picoverse
const isDateEndOfPicoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('picoverse'), 'day');
};

// Check if a date is at the start of a femtoverse
const isDateStartOfFemtoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('femtoverse'), 'day');
};

// Check if a date is at the end of a femtoverse
const isDateEndOfFemtoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('femtoverse'), 'day');
};

// Check if a date is at the start of a attoverse
const isDateStartOfAttoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('attoverse'), 'day');
};

// Check if a date is at the end of a attoverse
const isDateEndOfAttoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('attoverse'), 'day');
};

// Check if a date is at the start of a zeptoverse
const isDateStartOfZeptoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('zeptoverse'), 'day');
};

// Check if a date is at the end of a zeptoverse
const isDateEndOfZeptoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('zeptoverse'), 'day');
};

// Check if a date is at the start of a yoctoverse
const isDateStartOfYoctoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('yoctoverse'), 'day');
};

// Check if a date is at the end of a yoctoverse
const isDateEndOfYoctoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('yoctoverse'), 'day');
};

// Check if a date is at the start of a planckoverse
const isDateStartOfPlanckoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('planckoverse'), 'day');
};

// Check if a date is at the end of a planckoverse
const isDateEndOfPlanckoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('planckoverse'), 'day');
};

// Check if a date is at the start of a stringoverse
const isDateStartOfStringoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('stringoverse'), 'day');
};

// Check if a date is at the end of a stringoverse
const isDateEndOfStringoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('stringoverse'), 'day');
};

// Check if a date is at the start of a braneoverse
const isDateStartOfBraneoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('braneoverse'), 'day');
};

// Check if a date is at the end of a braneoverse
const isDateEndOfBraneoverse41 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('braneoverse'), 'day');
};

// Check if a date is at the start of a multiverse
const isDateStartOfMultiverse42 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('multiverse'), 'day');
};

// Check if a date is at the end of a multiverse
const isDateEndOfMultiverse42 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('multiverse'), 'day');
};

// Check if a date is at the start of a hyperverse
const isDateStartOfHyperverse42 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('hyperverse'), 'day');
};

// Check if a date is at the end of a hyperverse
const isDateEndOfHyperverse42 = (date: string) => {
    return moment(date).isSame(moment(date).endOf('hyperverse'), 'day');
};

// Check if a date is at the start of a megaverse
const isDateStartOfMegaverse42 = (date: string) => {
    return moment(date).isSame(moment(date).startOf('megaverse'), 'day');
};

// Check if a date is at the end of a megaverse
const isDateEndOfMegaverse42 = (date: string