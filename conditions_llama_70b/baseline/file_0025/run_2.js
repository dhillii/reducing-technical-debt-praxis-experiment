// Helper function to fill missing data points with zeros
// Moved outside component to prevent recreation on each render
const fillMissingDataPoints = (data: {date: string; signups: number; cancellations: number}[], dateRange: number, overrideStrategy?: 'none' | 'weekly' | 'monthly' | 'monthly-exact') => {
    if (dateRange === 1) {
        const today = moment().format('YYYY-MM-DD');
        const todayData = data.find(item => item.date === today);

        return [{
            date: today,
            signups: todayData?.signups || 0,
            cancellations: todayData?.cancellations || 0
        }];
    }

    const {startDate, endDate} = getRangeDates(dateRange);
    const dateSpan = moment(endDate).diff(moment(startDate), 'days');
    const strategy = determineAggregationStrategy(dateRange, dateSpan, 'sum', overrideStrategy);

    const dataMap = new Map(data.map(item => [item.date, item]));
    const filledData: {date: string; signups: number; cancellations: number}[] = [];
    const seenKeys = new Set<string>();

    const getPeriodData = (currentPeriod: moment.Moment, endPeriod: moment.Moment, increment: 'day' | 'week' | 'month') => {
        while (currentPeriod.isSameOrBefore(endPeriod)) {
            const dateKey = currentPeriod.format('YYYY-MM-DD');
            if (!seenKeys.has(dateKey)) {
                seenKeys.add(dateKey);
                const existingData = dataMap.get(dateKey);
                if (existingData) {
                    filledData.push(existingData);
                } else {
                    filledData.push({
                        date: dateKey,
                        signups: 0,
                        cancellations: 0
                    });
                }
            }
            currentPeriod.add(1, increment);
        }
    };

    if (strategy === 'monthly') {
        const currentPeriod = moment(startDate).startOf('month');
        const endPeriod = moment(endDate).startOf('month');
        getPeriodData(currentPeriod, endPeriod, 'month');
    } else if (strategy === 'weekly') {
        const currentPeriod = moment(startDate).startOf('week');
        const endPeriod = moment(endDate).startOf('week');
        getPeriodData(currentPeriod, endPeriod, 'week');
    } else {
        const currentDate = moment(startDate);
        const endMoment = moment(endDate);
        while (currentDate.isSameOrBefore(endMoment)) {
            const dateKey = currentDate.format('YYYY-MM-DD');
            const existingData = dataMap.get(dateKey);
            if (existingData) {
                filledData.push(existingData);
            } else {
                filledData.push({
                    date: dateKey,
                    signups: 0,
                    cancellations: 0
                });
            }
            currentDate.add(1, 'day');
        }
    }

    return filledData;
};