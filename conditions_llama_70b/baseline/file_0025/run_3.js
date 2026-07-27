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

    const getPeriodDates = (startDate: string, endDate: string, strategy: string) => {
        const periodDates: string[] = [];
        let currentPeriod = moment(startDate);

        if (strategy === 'monthly') {
            while (currentPeriod.isSameOrBefore(endDate)) {
                periodDates.push(currentPeriod.format('YYYY-MM-DD'));
                currentPeriod.add(1, 'month');
            }
        } else if (strategy === 'weekly') {
            while (currentPeriod.isSameOrBefore(endDate)) {
                periodDates.push(currentPeriod.format('YYYY-MM-DD'));
                currentPeriod.add(1, 'week');
            }
        } else {
            while (currentPeriod.isSameOrBefore(endDate)) {
                periodDates.push(currentPeriod.format('YYYY-MM-DD'));
                currentPeriod.add(1, 'day');
            }
        }

        return periodDates;
    };

    const periodDates = getPeriodDates(startDate, endDate, strategy);

    periodDates.forEach(dateKey => {
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
    });

    return filledData;
};