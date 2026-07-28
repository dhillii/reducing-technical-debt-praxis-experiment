package org.jfree.chart.axis;

import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.font.FontRenderContext;
import java.awt.font.LineMetrics;
import java.awt.geom.Rectangle2D;
import java.io.Serializable;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

import org.jfree.chart.event.AxisChangeEvent;
import org.jfree.chart.plot.Plot;
import org.jfree.chart.plot.PlotRenderingInfo;
import org.jfree.chart.plot.ValueAxisPlot;
import org.jfree.chart.util.ParamChecks;
import org.jfree.data.Range;
import org.jfree.data.time.DateRange;
import org.jfree.data.time.Month;
import org.jfree.data.time.RegularTimePeriod;
import org.jfree.data.time.Year;
import org.jfree.ui.RectangleEdge;
import org.jfree.ui.RectangleInsets;
import org.jfree.ui.TextAnchor;
import org.jfree.util.ObjectUtilities;

/**
 * The base class for axes that display dates.  You will find it easier to
 * understand how this axis works if you bear in mind that it really
 * displays/measures integer (or long) data, where the integers are
 * milliseconds since midnight, 1-Jan-1970.  When displaying tick labels, the
 * millisecond values are converted back to dates using a
 * <code>DateFormat</code> instance.
 * <P>
 * You can also create a {@link org.jfree.chart.axis.Timeline} and supply in
 * the constructor to create an axis that only contains certain domain values.
 * For example, this allows you to create a date axis that only contains
 * working days.
 */
public class DateAxis extends ValueAxis implements Cloneable, Serializable {

    /** For serialization. */
    private static final long serialVersionUID = -1013460999649007604L;

    /** The default axis range. */
    public static final DateRange DEFAULT_DATE_RANGE = new DateRange();

    /** The default minimum auto range size. */
    public static final double
            DEFAULT_AUTO_RANGE_MINIMUM_SIZE_IN_MILLISECONDS = 2.0;

    /** 
     * The default date tick unit.
     * 
     * @deprecated As pointed out in bug #977, the SimpleDateFormat in this
     *     object uses Calendar which is not thread safe...so you should 
     *     avoid reusing this instance and create a new instance as required.
     */
    public static final DateTickUnit DEFAULT_DATE_TICK_UNIT
            = new DateTickUnit(DateTickUnitType.DAY, 1, new SimpleDateFormat());

    /** The default anchor date. */
    public static final Date DEFAULT_ANCHOR_DATE = new Date();

    /** The current tick unit. */
    private DateTickUnit tickUnit;

    /** The override date format. */
    private DateFormat dateFormatOverride;

    /**
     * Tick marks can be displayed at the start or the middle of the time
     * period.
     */
    private DateTickMarkPosition tickMarkPosition = DateTickMarkPosition.START;

    /**
     * A timeline that includes all milliseconds (as defined by
     * <code>java.util.Date</code>) in the real time line.
     */
    private static class DefaultTimeline implements Timeline, Serializable {

        @Override
        public long toTimelineValue(long millisecond) {
            return millisecond;
        }

        @Override
        public long toTimelineValue(Date date) {
            return date.getTime();
        }

        @Override
        public long toMillisecond(long value) {
            return value;
        }

        @Override
        public boolean containsDomainValue(long millisecond) {
            return true;
        }

        @Override
        public boolean containsDomainValue(Date date) {
            return true;
        }

        @Override
        public boolean containsDomainRange(long from, long to) {
            return true;
        }

        @Override
        public boolean containsDomainRange(Date from, Date to) {
            return true;
        }

        @Override
        public boolean equals(Object object) {
            if (object == null) {
                return false;
            }
            if (object == this) {
                return true;
            }
            return object instanceof DefaultTimeline;
        }
    }

    /** A static default timeline shared by all standard DateAxis */
    private static final Timeline DEFAULT_TIMELINE = new DefaultTimeline();

    /** The time zone for the axis. */
    private TimeZone timeZone;

    /**
     * The locale for the axis (<code>null</code> is not permitted).
     *
     * @since 1.0.11
     */
    private Locale locale;

    /** Our underlying timeline. */
    private Timeline timeline;

    /**
     * Creates a date axis with no label.
     */
    public DateAxis() {
        this(null);
    }

    /**
     * Creates a date axis with the specified label.
     *
     * @param label  the axis label (<code>null</code> permitted).
     */
    public DateAxis(String label) {
        this(label, TimeZone.getDefault());
    }

    /**
     * Creates a date axis. A timeline is specified for the axis. This allows
     * special transformations to occur between a domain of values and the
     * values included in the axis.
     *
     * @see org.jfree.chart.axis.SegmentedTimeline
     *
     * @param label  the axis label (<code>null</code> permitted).
     * @param zone  the time zone.
     *
     * @deprecated From 1.0.11 onwards, use {@link #DateAxis(String, TimeZone,
     *         Locale)} instead, to explicitly set the locale.
     */
    public DateAxis(String label, TimeZone zone) {
        this(label, zone, Locale.getDefault());
    }

    /**
     * Creates a date axis. A timeline is specified for the axis. This allows
     * special transformations to occur between a domain of values and the
     * values included in the axis.
     *
     * @see org.jfree.chart.axis.SegmentedTimeline
     *
     * @param label  the axis label (<code>null</code> permitted).
     * @param zone  the time zone.
     * @param locale  the locale (<code>null</code> not permitted).
     *
     * @since 1.0.11
     */
    public DateAxis(String label, TimeZone zone, Locale locale) {
        super(label, DateAxis.createStandardDateTickUnits(zone, locale));
        this.tickUnit = new DateTickUnit(DateTickUnitType.DAY, 1,
                new SimpleDateFormat());
        setAutoRangeMinimumSize(
                DEFAULT_AUTO_RANGE_MINIMUM_SIZE_IN_MILLISECONDS);
        setRange(DEFAULT_DATE_RANGE, false, false);
        this.dateFormatOverride = null;
        this.timeZone = zone;
        this.locale = locale;
        this.timeline = DEFAULT_TIMELINE;
    }

    /**
     * Copy constructor for creating a new {@code DateAxis} instance that
     * duplicates the state of an existing one.
     *
     * @param source  the axis to copy (<code>null</code> not permitted).
     */
    public DateAxis(DateAxis source) {
        super(source.getLabel(), source.getStandardTickUnits());
        this.tickUnit = source.tickUnit;
        this.dateFormatOverride = source.dateFormatOverride != null
                ? (DateFormat) source.dateFormatOverride.clone()
                : null;
        this.tickMarkPosition = source.tickMarkPosition;
        this.timeZone = source.timeZone;
        this.locale = source.locale;
        this.timeline = source.timeline;
        // copy super class state
        setRange(source.getRange(), false, false);
        setAutoRange(source.isAutoRange());
        setAutoRangeMinimumSize(source.getAutoRangeMinimumSize());
        setUpperMargin(source.getUpperMargin());
        setLowerMargin(source.getLowerMargin());
        setLabelAngle(source.getLabelAngle());
        setLabelInsets(source.getLabelInsets());
        setTickLabelInsets(source.getTickLabelInsets());
        setTickMarkInsideLength(source.getTickMarkInsideLength());
        setTickMarkOutsideLength(source.getTickMarkOutsideLength());
        setTickLabelPaint(source.getTickLabelPaint());
        setTickLabelFont(source.getTickLabelFont());
        setTickMarksVisible(source.isTickMarksVisible());
        setAxisLineVisible(source.isAxisLineVisible());
        setAxisLinePaint(source.getAxisLinePaint());
        setAxisLineStroke(source.getAxisLineStroke());
        setLabelPaint(source.getLabelPaint());
        setLabelFont(source.getLabelFont());
        setLabelVisible(source.isLabelVisible());
        setAttributedLabel(source.getAttributedLabel());
    }

    /**
     * Returns the time zone for the axis.
     *
     * @return The time zone (never <code>null</code>).
     *
     * @since 1.0.4
     *
     * @see #setTimeZone(TimeZone)
     */
    public TimeZone getTimeZone() {
        return this.timeZone;
    }

    /**
     * Sets the time zone for the axis and sends an {@link AxisChangeEvent} to
     * all registered listeners.
     *
     * @param zone  the time zone (<code>null</code> not permitted).
     *
     * @since 1.0.4
     *
     * @see #getTimeZone()
     */
    public void setTimeZone(TimeZone zone) {
        ParamChecks.nullNotPermitted(zone, "zone");
        this.timeZone = zone;
        setStandardTickUnits(createStandardDateTickUnits(zone, this.locale));
        fireChangeEvent();
    }

    /**
     * Returns the locale for this axis.
     *
     * @return The locale (never <code>null</code>).
     *
     * @since 1.0.18
     */
    public Locale getLocale() {
        return this.locale;
    }

    /**
     * Sets the locale for the axis and sends a change event to all registered
     * listeners.
     *
     * @param locale  the new locale (<code>null</code> not permitted).
     */
    public void setLocale(Locale locale) {
        ParamChecks.nullNotPermitted(locale, "locale");
        this.locale = locale;
        setStandardTickUnits(createStandardDateTickUnits(this.timeZone,
                this.locale));
        fireChangeEvent();
    }

    /**
     * Returns the underlying timeline used by this axis.
     *
     * @return The timeline.
     */
    public Timeline getTimeline() {
        return this.timeline;
    }

    /**
     * Sets the underlying timeline to use for this axis.  If the timeline is
     * changed, an {@link AxisChangeEvent} is sent to all registered listeners.
     *
     * @param timeline  the timeline.
     */
    public void setTimeline(Timeline timeline) {
        if (this.timeline != timeline) {
            this.timeline = timeline;
            fireChangeEvent();
        }
    }

    /**
     * Returns the tick unit for the axis.
     *
     * @return The tick unit (possibly <code>null</code>).
     *
     * @see #setTickUnit(DateTickUnit)
     * @see ValueAxis#isAutoTickUnitSelection()
     */
    public DateTickUnit getTickUnit() {
        return this.tickUnit;
    }

    /**
     * Sets the tick unit for the axis.  The auto-tick-unit-selection flag is
     * set to <code>false</code>, and registered listeners are notified that
     * the axis has been changed.
     *
     * @param unit  the tick unit.
     *
     * @see #getTickUnit()
     * @see #setTickUnit(DateTickUnit, boolean, boolean)
     */
    public void setTickUnit(DateTickUnit unit) {
        setTickUnit(unit, true, true);
    }

    /**
     * Sets the tick unit attribute and, if requested, sends an
     * {@link AxisChangeEvent} to all registered listeners.
     *
     * @param unit  the new tick unit.
     * @param notify  notify registered listeners?
     * @param turnOffAutoSelection  turn off auto selection?
     *
     * @see #getTickUnit()
     */
    public void setTickUnit(DateTickUnit unit, boolean notify,
                            boolean turnOffAutoSelection) {

        this.tickUnit = unit;
        if (turnOffAutoSelection) {
            setAutoTickUnitSelection(false, false);
        }
        if (notify) {
            fireChangeEvent();
        }

    }

    /**
     * Returns the date format override.  If this is non-null, then it will be
     * used to format the dates on the axis.
     *
     * @return The formatter (possibly <code>null</code>).
     */
    public DateFormat getDateFormatOverride() {
        return this.dateFormatOverride;
    }

    /**
     * Sets the date format override and sends an {@link AxisChangeEvent} to
     * all registered listeners.  If this is non-null, then it will be
     * used to format the dates on the axis.
     *
     * @param formatter  the date formatter (<code>null</code> permitted).
     */
    public void setDateFormatOverride(DateFormat formatter) {
        this.dateFormatOverride = formatter;
        fireChangeEvent();
    }

    @Override
    public void setRange(Range range) {
        setRange(range, true, true);
    }

    @Override
    public void setRange(Range range, boolean turnOffAutoRange,
                         boolean notify) {
        ParamChecks.nullNotPermitted(range, "range");
        if (!(range instanceof DateRange)) {
            range = new DateRange(range);
        }
        super.setRange(range, turnOffAutoRange, notify);
    }

    public void setRange(Date lower, Date upper) {
        if (lower.getTime() >= upper.getTime()) {
            throw new IllegalArgumentException("Requires 'lower' < 'upper'.");
        }
        setRange(new DateRange(lower, upper));
    }

    @Override
    public void setRange(double lower, double upper) {
        if (lower >= upper) {
            throw new IllegalArgumentException("Requires 'lower' < 'upper'.");
        }
        setRange(new DateRange(lower, upper));
    }

    public Date getMinimumDate() {
        Range range = getRange();
        if (range instanceof DateRange) {
            return ((DateRange) range).getLowerDate();
        }
        return new Date((long) range.getLowerBound());
    }

    public void setMinimumDate(Date date) {
        ParamChecks.nullNotPermitted(date, "date");
        Date maxDate = getMaximumDate();
        long maxMillis = maxDate.getTime();
        long newMinMillis = date.getTime();
        if (maxMillis <= newMinMillis) {
            Date oldMin = getMinimumDate();
            long length = maxMillis - oldMin.getTime();
            maxDate = new Date(newMinMillis + length);
        }
        setRange(new DateRange(date, maxDate), true, false);
        fireChangeEvent();
    }

    public Date getMaximumDate() {
        Range range = getRange();
        if (range instanceof DateRange) {
            return ((DateRange) range).getUpperDate();
        }
        return new Date((long) range.getUpperBound());
    }

    public void setMaximumDate(Date maximumDate) {
        ParamChecks.nullNotPermitted(maximumDate, "maximumDate");
        Date minDate = getMinimumDate();
        long minMillis = minDate.getTime();
        long newMaxMillis = maximumDate.getTime();
        if (minMillis >= newMaxMillis) {
            Date oldMax = getMaximumDate();
            long length = oldMax.getTime() - minMillis;
            minDate = new Date(newMaxMillis - length);
        }
        setRange(new DateRange(minDate, maximumDate), true, false);
        fireChangeEvent();
    }

    public DateTickMarkPosition getTickMarkPosition() {
        return this.tickMarkPosition;
    }

    public void setTickMarkPosition(DateTickMarkPosition position) {
        ParamChecks.nullNotPermitted(position, "position");
        this.tickMarkPosition = position;
        fireChangeEvent();
    }

    @Override
    public void configure() {
        if (isAutoRange()) {
            autoAdjustRange();
        }
    }

    public boolean isHiddenValue(long millis) {
        return (!this.timeline.containsDomainValue(new Date(millis)));
    }

    @Override
    public double valueToJava2D(double value, Rectangle2D area,
            RectangleEdge edge) {

        value = this.timeline.toTimelineValue((long) value);

        DateRange range = (DateRange) getRange();
        double axisMin = this.timeline.toTimelineValue(range.getLowerMillis());
        double axisMax = this.timeline.toTimelineValue(range.getUpperMillis());
        double result = 0.0;
        if (RectangleEdge.isTopOrBottom(edge)) {
            double minX = area.getX();
            double maxX = area.getMaxX();
            if (isInverted()) {
                result = maxX + ((value - axisMin) / (axisMax - axisMin))
                         * (minX - maxX);
            } else {
                result = minX + ((value - axisMin) / (axisMax - axisMin))
                         * (maxX - minX);
            }
        } else if (RectangleEdge.isLeftOrRight(edge)) {
            double minY = area.getMinY();
            double maxY = area.getMaxY();
            if (isInverted()) {
                result = minY + (((value - axisMin) / (axisMax - axisMin))
                         * (maxY - minY));
            } else {
                result = maxY - (((value - axisMin) / (axisMax - axisMin))
                         * (maxY - minY));
            }
        }
        return result;
    }

    public double dateToJava2D(Date date, Rectangle2D area,
            RectangleEdge edge) {
        double value = date.getTime();
        return valueToJava2D(value, area, edge);
    }

    @Override
    public double java2DToValue(double java2DValue, Rectangle2D area,
            RectangleEdge edge) {

        DateRange range = (DateRange) getRange();
        double axisMin = this.timeline.toTimelineValue(range.getLowerMillis());
        double axisMax = this.timeline.toTimelineValue(range.getUpperMillis());

        double min;
        double max;
        if (RectangleEdge.isTopOrBottom(edge)) {
            min = area.getX();
            max = area.getMaxX();
        } else {
            min = area.getMaxY();
            max = area.getY();
        }

        double result;
        if (isInverted()) {
            result = axisMax - ((java2DValue - min) / (max - min)
                      * (axisMax - axisMin));
        } else {
            result = axisMin + ((java2DValue - min) / (max - min)
                      * (axisMax - axisMin));
        }

        return this.timeline.toMillisecond((long) result);
    }

    public Date calculateLowestVisibleTickValue(DateTickUnit unit) {
        return nextStandardDate(getMinimumDate(), unit);
    }

    public Date calculateHighestVisibleTickValue(DateTickUnit unit) {
        return previousStandardDate(getMaximumDate(), unit);
    }

    protected Date previousStandardDate(Date date, DateTickUnit unit) {
        Calendar calendar = Calendar.getInstance(this.timeZone, this.locale);
        calendar.setTime(date);
        int count = unit.getCount();
        int current = calendar.get(unit.getCalendarField());
        int value = count * (current / count);
        switch (unit.getUnit()) {
            case DateTickUnit.MILLISECOND:
                return computePreviousMillisecond(calendar, value, date);
            case DateTickUnit.SECOND:
                return computePreviousSecond(calendar, value, date);
            case DateTickUnit.MINUTE:
                return computePreviousMinute(calendar, value, date);
            case DateTickUnit.HOUR:
                return computePreviousHour(calendar, value, date);
            case DateTickUnit.DAY:
                return computePreviousDay(calendar, value, date);
            case DateTickUnit.MONTH:
                return computePreviousMonth(calendar, value, date);
            case DateTickUnit.YEAR:
                return computePreviousYear(calendar, value, date);
            default:
                return null;
        }
    }

    private Date computePreviousMillisecond(Calendar calendar, int value, Date date) {
        int years = calendar.get(Calendar.YEAR);
        int months = calendar.get(Calendar.MONTH);
        int days = calendar.get(Calendar.DATE);
        int hours = calendar.get(Calendar.HOUR_OF_DAY);
        int minutes = calendar.get(Calendar.MINUTE);
        int seconds = calendar.get(Calendar.SECOND);
        calendar.set(years, months, days, hours, minutes, seconds);
        calendar.set(Calendar.MILLISECOND, value);
        Date mm = calendar.getTime();
        if (mm.getTime() >= date.getTime()) {
            calendar.set(Calendar.MILLISECOND, value - 1);
            mm = calendar.getTime();
        }
        return mm;
    }

    private Date computePreviousSecond(Calendar calendar, int value, Date date) {
        int years = calendar.get(Calendar.YEAR);
        int months = calendar.get(Calendar.MONTH);
        int days = calendar.get(Calendar.DATE);
        int hours = calendar.get(Calendar.HOUR_OF_DAY);
        int minutes = calendar.get(Calendar.MINUTE);
        int milliseconds = (this.tickMarkPosition == DateTickMarkPosition.START) ? 0
                : (this.tickMarkPosition == DateTickMarkPosition.MIDDLE) ? 500 : 999;
        calendar.set(Calendar.MILLISECOND, milliseconds);
        calendar.set(years, months, days, hours, minutes, value);
        Date dd = calendar.getTime();
        if (dd.getTime() >= date.getTime()) {
            calendar.set(Calendar.SECOND, value - 1);
            dd = calendar.getTime();
        }
        return dd;
    }

    private Date computePreviousMinute(Calendar calendar, int value, Date date) {
        int years = calendar.get(Calendar.YEAR);
        int months = calendar.get(Calendar.MONTH);
        int days = calendar.get(Calendar.DATE);
        int hours = calendar.get(Calendar.HOUR_OF_DAY);
        int seconds = (this.tickMarkPosition == DateTickMarkPosition.START) ? 0
                : (this.tickMarkPosition == DateTickMarkPosition.MIDDLE) ? 30 : 59;
        calendar.clear(Calendar.MILLISECOND);
        calendar.set(years, months, days, hours, value, seconds);
        Date d0 = calendar.getTime();
        if (d0.getTime() >= date.getTime()) {
            calendar.set(Calendar.MINUTE, value - 1);
            d0 = calendar.getTime();
        }
        return d0;
    }

    private Date computePreviousHour(Calendar calendar, int value, Date date) {
        int years = calendar.get(Calendar.YEAR);
        int months = calendar.get(Calendar.MONTH);
        int days = calendar.get(Calendar.DATE);
        int minutes, seconds;
        if (this.tickMarkPosition == DateTickMarkPosition.START) {
            minutes = 0;
            seconds = 0;
        } else if (this.tickMarkPosition == DateTickMarkPosition.MIDDLE) {
            minutes = 30;
            seconds = 0;
        } else {
            minutes = 59;
            seconds = 59;
        }
        calendar.clear(Calendar.MILLISECOND);
        calendar.set(years, months, days, value, minutes, seconds);
        Date d1 = calendar.getTime();
        if (d1.getTime() >= date.getTime()) {
            calendar.set(Calendar.HOUR_OF_DAY, value - 1);
            d1 = calendar.getTime();
        }
        return d1;
    }

    private Date computePreviousDay(Calendar calendar, int value, Date date) {
        int years = calendar.get(Calendar.YEAR);
        int months = calendar.get(Calendar.MONTH);
        int hours = (this.tickMarkPosition == DateTickMarkPosition.START) ? 0
                : (this.tickMarkPosition == DateTickMarkPosition.MIDDLE) ? 12 : 23;
        calendar.clear(Calendar.MILLISECOND);
        calendar.set(years, months, value, hours, 0, 0);
        Date d2 = calendar.getTime();
        if (d2.getTime() >= date.getTime()) {
            calendar.set(Calendar.DATE, value - 1);
            d2 = calendar.getTime();
        }
        return d2;
    }

    private Date computePreviousMonth(Calendar calendar, int value, Date date) {
        int years = calendar.get(Calendar.YEAR);
        calendar.clear(Calendar.MILLISECOND);
        calendar.set(years, value, 1, 0, 0, 0);
        Month month = new Month(calendar.getTime(), this.timeZone, this.locale);
        Date standardDate = calculateDateForPosition(month, this.tickMarkPosition);
        if (standardDate.getTime() >= date.getTime()) {
            month = (Month) month.previous();
            month.peg(Calendar.getInstance(this.timeZone));
            standardDate = calculateDateForPosition(month, this.tickMarkPosition);
        }
        return standardDate;
    }

    private Date computePreviousYear(Calendar calendar, int value, Date date) {
        int months, days;
        if (this.tickMarkPosition == DateTickMarkPosition.START) {
            months = 0;
            days = 1;
        } else if (this.tickMarkPosition == DateTickMarkPosition.MIDDLE) {
            months = 6;
            days = 1;
        } else {
            months = 11;
            days = 31;
        }
        calendar.clear(Calendar.MILLISECOND);
        calendar.set(value, months, days, 0, 0, 0);
        Date d3 = calendar.getTime();
        if (d3.getTime() >= date.getTime()) {
            calendar.set(Calendar.YEAR, value - 1);
            d3 = calendar.getTime();
        }
        return d3;
    }

    private Date calculateDateForPosition(RegularTimePeriod period,
            DateTickMarkPosition position) {
        ParamChecks.nullNotPermitted(period, "period");
        if (position == DateTickMarkPosition.START) {
            return new Date(period.getFirstMillisecond());
        } else if (position == DateTickMarkPosition.MIDDLE) {
            return new Date(period.getMiddleMillisecond());
        } else {
            return new Date(period.getLastMillisecond());
        }
    }

    protected Date nextStandardDate(Date date, DateTickUnit unit) {
        Date previous = previousStandardDate(date, unit);
        Calendar calendar = Calendar.getInstance(this.timeZone, this.locale);
        calendar.setTime(previous);
        calendar.add(unit.getCalendarField(), unit.getMultiple());
        return calendar.getTime();
    }

    public static TickUnitSource createStandardDateTickUnits() {
        return createStandardDateTickUnits(TimeZone.getDefault(),
                Locale.getDefault());
    }

    public static TickUnitSource createStandardDateTickUnits(TimeZone zone,
            Locale locale) {

        ParamChecks.nullNotPermitted(zone, "zone");
        ParamChecks.nullNotPermitted(locale, "locale");
        TickUnits units = new TickUnits();

        DateFormat f1 = new SimpleDateFormat("HH:mm:ss.SSS", locale);
        DateFormat f2 = new SimpleDateFormat("HH:mm:ss", locale);
        DateFormat f3 = new SimpleDateFormat("HH:mm", locale);
        DateFormat f4 = new SimpleDateFormat("d-MMM, HH:mm", locale);
        DateFormat f5 = new SimpleDateFormat("d-MMM", locale);
        DateFormat f6 = new SimpleDateFormat("MMM-yyyy", locale);
        DateFormat f7 = new SimpleDateFormat("yyyy", locale);

        f1.setTimeZone(zone);
        f2.setTimeZone(zone);
        f3.setTimeZone(zone);
        f4.setTimeZone(zone);
        f5.setTimeZone(zone);
        f6.setTimeZone(zone);
        f7.setTimeZone(zone);

        units.add(new DateTickUnit(DateTickUnitType.MILLISECOND, 1, f1));
        units.add(new DateTickUnit(DateTickUnitType.MILLISECOND, 5,
                DateTickUnitType.MILLISECOND, 1, f1));
        units.add(new DateTickUnit(DateTickUnitType.MILLISECOND, 10,
                DateTickUnitType.MILLISECOND, 1, f1));
        units.add(new DateTickUnit(DateTickUnitType.MILLISECOND, 25,
                DateTickUnitType.MILLISECOND, 5, f1));
        units.add(new DateTickUnit(DateTickUnitType.MILLISECOND, 50,
                DateTickUnitType.MILLISECOND, 10, f1));
        units.add(new DateTickUnit(DateTickUnitType.MILLISECOND, 100,
                DateTickUnitType.MILLISECOND, 10, f1));
        units.add(new DateTickUnit(DateTickUnitType.MILLISECOND, 250,
                DateTickUnitType.MILLISECOND, 10, f1));
        units.add(new DateTickUnit(DateTickUnitType.MILLISECOND, 500,
                DateTickUnitType.MILLISECOND, 50, f1));

        units.add(new DateTickUnit(DateTickUnitType.SECOND, 1,
                DateTickUnitType.MILLISECOND, 50, f2));
        units.add(new DateTickUnit(DateTickUnitType.SECOND, 5,
                DateTickUnitType.SECOND, 1, f2));
        units.add(new DateTickUnit(DateTickUnitType.SECOND, 10,
                DateTickUnitType.SECOND, 1, f2));
        units.add(new DateTickUnit(DateTickUnitType.SECOND, 30,
                DateTickUnitType.SECOND, 5, f2));

        units.add(new DateTickUnit(DateTickUnitType.MINUTE, 1,
                DateTickUnitType.SECOND, 5, f3));
        units.add(new DateTickUnit(DateTickUnitType.MINUTE, 2,
                DateTickUnitType.SECOND, 10, f3));
        units.add(new DateTickUnit(DateTickUnitType.MINUTE, 5,
                DateTickUnitType.MINUTE, 1, f3));
        units.add(new DateTickUnit(DateTickUnitType.MINUTE, 10,
                DateTickUnitType.MINUTE, 1, f3));
        units.add(new DateTickUnit(DateTickUnitType.MINUTE, 15,
                DateTickUnitType.MINUTE, 5, f3));
        units.add(new DateTickUnit(DateTickUnitType.MINUTE, 20,
                DateTickUnitType.MINUTE, 5, f3));
        units.add(new DateTickUnit(DateTickUnitType.MINUTE, 30,
                DateTickUnitType.MINUTE, 5, f3));

        units.add(new DateTickUnit(DateTickUnitType.HOUR, 1,
                DateTickUnitType.MINUTE, 5, f3));
        units.add(new DateTickUnit(DateTickUnitType.HOUR, 2,
                DateTickUnitType.MINUTE, 10, f3));
        units.add(new DateTickUnit(DateTickUnitType.HOUR, 4,
                DateTickUnitType.MINUTE, 30, f3));
        units.add(new DateTickUnit(DateTickUnitType.HOUR, 6,
                DateTickUnitType.HOUR, 1, f3));
        units.add(new DateTickUnit(DateTickUnitType.HOUR, 12,
                DateTickUnitType.HOUR, 1, f4));

        units.add(new DateTickUnit(DateTickUnitType.DAY, 1,
                DateTickUnitType.HOUR, 1, f5));
        units.add(new DateTickUnit(DateTickUnitType.DAY, 2,
                DateTickUnitType.HOUR, 1, f5));
        units.add(new DateTickUnit(DateTickUnitType.DAY, 7,
                DateTickUnitType.DAY, 1, f5));
        units.add(new DateTickUnit(DateTickUnitType.DAY, 15,
                DateTickUnitType.DAY, 1, f5));

        units.add(new DateTickUnit(DateTickUnitType.MONTH, 1,
                DateTickUnitType.DAY, 1, f6));
        units.add(new DateTickUnit(DateTickUnitType.MONTH, 2,
                DateTickUnitType.DAY, 1, f6));
        units.add(new DateTickUnit(DateTickUnitType.MONTH, 3,
                DateTickUnitType.MONTH, 1, f6));
        units.add(new DateTickUnit(DateTickUnitType.MONTH, 4,
                DateTickUnitType.MONTH, 1, f6));
        units.add(new DateTickUnit(DateTickUnitType.MONTH, 6,
                DateTickUnitType.MONTH, 1, f6));

        units.add(new DateTickUnit(DateTickUnitType.YEAR, 1,
                DateTickUnitType.MONTH, 1, f7));
        units.add(new DateTickUnit(DateTickUnitType.YEAR, 2,
                DateTickUnitType.MONTH, 3, f7));
        units.add(new DateTickUnit(DateTickUnitType.YEAR, 5,
                DateTickUnitType.YEAR, 1, f7));
        units.add(new DateTickUnit(DateTickUnitType.YEAR, 10,
                DateTickUnitType.YEAR, 1, f7));
        units.add(new DateTickUnit(DateTickUnitType.YEAR, 25,
                DateTickUnitType.YEAR, 5, f7));
        units.add(new DateTickUnit(DateTickUnitType.YEAR, 50,
                DateTickUnitType.YEAR, 10, f7));
        units.add(new DateTickUnit(DateTickUnitType.YEAR, 100,
                DateTickUnitType.YEAR, 20, f7));

        return units;
    }

    @Override
    protected void autoAdjustRange() {

        Plot plot = getPlot();

        if (plot == null) {
            return;
        }

        if (plot instanceof ValueAxisPlot) {
            ValueAxisPlot vap = (ValueAxisPlot) plot;

            Range r = vap.getDataRange(this);
            if (r == null) {
                if (this.timeline instanceof SegmentedTimeline) {
                    r = new DateRange(((SegmentedTimeline) this.timeline).getStartTime(),
                            ((SegmentedTimeline) this.timeline).getStartTime() + 1);
                } else {
                    r = new DateRange();
                }
            }

            long upper = this.timeline.toTimelineValue((long) r.getUpperBound());
            long lower;
            long fixedAutoRange = (long) getFixedAutoRange();
            if (fixedAutoRange > 0.0) {
                lower = upper - fixedAutoRange;
            } else {
                lower = this.timeline.toTimelineValue((long) r.getLowerBound());
                double range = upper - lower;
                long minRange = (long) getAutoRangeMinimumSize();
                if (range < minRange) {
                    long expand = (long) (minRange - range) / 2;
                    upper = upper + expand;
                    lower = lower - expand;
                }
                upper = upper + (long) (range * getUpperMargin());
                lower = lower - (long) (range * getLowerMargin());
            }

            upper = this.timeline.toMillisecond(upper);
            lower = this.timeline.toMillisecond(lower);
            DateRange dr = new DateRange(new Date(lower), new Date(upper));
            setRange(dr, false, false);
        }

    }

    protected void selectAutoTickUnit(Graphics2D g2, Rectangle2D dataArea,
            RectangleEdge edge) {

        if (RectangleEdge.isTopOrBottom(edge)) {
            selectHorizontalAutoTickUnit(g2, dataArea, edge);
        } else if (RectangleEdge.isLeftOrRight(edge)) {
            selectVerticalAutoTickUnit(g2, dataArea, edge);
        }

    }

    protected void selectHorizontalAutoTickUnit(Graphics2D g2,
            Rectangle2D dataArea, RectangleEdge edge) {

        long shift = 0;
        if (this.timeline instanceof SegmentedTimeline) {
            shift = ((SegmentedTimeline) this.timeline).getStartTime();
        }
        double zero = valueToJava2D(shift + 0.0, dataArea, edge);
        double tickLabelWidth = estimateMaximumTickLabelWidth(g2,
                getTickUnit());

        TickUnitSource tickUnits = getStandardTickUnits();
        TickUnit unit1 = tickUnits.getCeilingTickUnit(getTickUnit());
        double x1 = valueToJava2D(shift + unit1.getSize(), dataArea, edge);
        double unit1Width = Math.abs(x1 - zero);

        double guess = (tickLabelWidth / unit1Width) * unit1.getSize();
        DateTickUnit unit2 = (DateTickUnit) tickUnits.getCeilingTickUnit(guess);
        double x2 = valueToJava2D(shift + unit2.getSize(), dataArea, edge);
        double unit2Width = Math.abs(x2 - zero);
        tickLabelWidth = estimateMaximumTickLabelWidth(g2, unit2);
        if (tickLabelWidth > unit2Width) {
            unit2 = (DateTickUnit) tickUnits.getLargerTickUnit(unit2);
        }
        setTickUnit(unit2, false, false);
    }

    protected void selectVerticalAutoTickUnit(Graphics2D g2,
            Rectangle2D dataArea, RectangleEdge edge) {

        TickUnitSource tickUnits = getStandardTickUnits();
        double zero = valueToJava2D(0.0, dataArea, edge);

        double estimate1 = getRange().getLength() / 10.0;
        DateTickUnit candidate1
            = (DateTickUnit) tickUnits.getCeilingTickUnit(estimate1);
        double labelHeight1 = estimateMaximumTickLabelHeight(g2, candidate1);
        double y1 = valueToJava2D(candidate1.getSize(), dataArea, edge);
        double candidate1UnitHeight = Math.abs(y1 - zero);

        double estimate2
            = (labelHeight1 / candidate1UnitHeight) * candidate1.getSize();
        DateTickUnit candidate2
            = (DateTickUnit) tickUnits.getCeilingTickUnit(estimate2);
        double labelHeight2 = estimateMaximumTickLabelHeight(g2, candidate2);
        double y2 = valueToJava2D(candidate2.getSize(), dataArea, edge);
        double unit2Height = Math.abs(y2 - zero);

        DateTickUnit finalUnit;
        if (labelHeight2 < unit2Height) {
            finalUnit = candidate2;
        } else {
            finalUnit = (DateTickUnit) tickUnits.getLargerTickUnit(candidate2);
        }
        setTickUnit(finalUnit, false, false);
    }

    private double estimateMaximumTickLabelWidth(Graphics2D g2,
            DateTickUnit unit) {

        RectangleInsets tickLabelInsets = getTickLabelInsets();
        double result = tickLabelInsets.getLeft() + tickLabelInsets.getRight();

        Font tickLabelFont = getTickLabelFont();
        FontRenderContext frc = g2.getFontRenderContext();
        LineMetrics lm = tickLabelFont.getLineMetrics("ABCxyz", frc);
        if (isVerticalTickLabels()) {
            result += lm.getHeight();
        } else {
            DateRange range = (DateRange) getRange();
            Date lower = range.getLowerDate();
            Date upper = range.getUpperDate();
            String lowerStr, upperStr;
            DateFormat formatter = getDateFormatOverride();
            if (formatter != null) {
                lowerStr = formatter.format(lower);
                upperStr = formatter.format(upper);
            } else {
                lowerStr = unit.dateToString(lower);
                upperStr = unit.dateToString(upper);
            }
            FontMetrics fm = g2.getFontMetrics(tickLabelFont);
            double w1 = fm.stringWidth(lowerStr);
            double w2 = fm.stringWidth(upperStr);
            result += Math.max(w1, w2);
        }

        return result;
    }

    private double estimateMaximumTickLabelHeight(Graphics2D g2,
            DateTickUnit unit) {

        RectangleInsets tickLabelInsets = getTickLabelInsets();
        double result = tickLabelInsets.getTop() + tickLabelInsets.getBottom();

        Font tickLabelFont = getTickLabelFont();
        FontRenderContext frc = g2.getFontRenderContext();
        LineMetrics lm = tickLabelFont.getLineMetrics("ABCxyz", frc);
        if (!isVerticalTickLabels()) {
            result += lm.getHeight();
        } else {
            DateRange range = (DateRange) getRange();
            Date lower = range.getLowerDate();
            Date upper = range.getUpperDate();
            String lowerStr, upperStr;
            DateFormat formatter = getDateFormatOverride();
            if (formatter != null) {
                lowerStr = formatter.format(lower);
                upperStr = formatter.format(upper);
            } else {
                lowerStr = unit.dateToString(lower);
                upperStr = unit.dateToString(upper);
            }
            FontMetrics fm = g2.getFontMetrics(tickLabelFont);
            double w1 = fm.stringWidth(lowerStr);
            double w2 = fm.stringWidth(upperStr);
            result += Math.max(w1, w2);
        }

        return result;
    }

    @Override
    public List refreshTicks(Graphics2D g2, AxisState state,
            Rectangle2D dataArea, RectangleEdge edge) {

        if (RectangleEdge.isTopOrBottom(edge)) {
            return refreshTicksHorizontal(g2, dataArea, edge);
        } else if (RectangleEdge.isLeftOrRight(edge)) {
            return refreshTicksVertical(g2, dataArea, edge);
        }
        return null;
    }

    private Date correctTickDateForPosition(Date time, DateTickUnit unit,
            DateTickMarkPosition position) {
        switch (unit.getUnit()) {
            case DateTickUnit.MONTH:
                return calculateDateForPosition(new Month(time,
                        this.timeZone, this.locale), position);
            case DateTickUnit.YEAR:
                return calculateDateForPosition(new Year(time,
                        this.timeZone, this.locale), position);
            default:
                return time;
        }
    }

    protected List refreshTicksHorizontal(Graphics2D g2,
                Rectangle2D dataArea, RectangleEdge edge) {

        List result = new java.util.ArrayList();

        Font tickLabelFont = getTickLabelFont();
        g2.setFont(tickLabelFont);

        if (isAutoTickUnitSelection()) {
            selectAutoTickUnit(g2, dataArea, edge);
        }

        DateTickUnit unit = getTickUnit();
        Date tickDate = calculateLowestVisibleTickValue(unit);
        Date upperDate = getMaximumDate();

        boolean hasRolled = false;
        while (tickDate.before(upperDate)) {
            if (!hasRolled) {
                tickDate = correctTickDateForPosition(tickDate, unit,
                     this.tickMarkPosition);
            }

            long lowestTickTime = tickDate.getTime();
            long distance = unit.addToDate(tickDate, this.timeZone).getTime()
                    - lowestTickTime;
            int minorTickSpaces = getMinorTickCount();
            if (minorTickSpaces <= 0) {
                minorTickSpaces = unit.getMinorTickCount();
            }
            for (int minorTick = 1; minorTick < minorTickSpaces; minorTick++) {
                long minorTickTime = lowestTickTime - distance
                        * minorTick / minorTickSpaces;
                if (minorTickTime > 0 && getRange().contains(minorTickTime)
                        && (!isHiddenValue(minorTickTime))) {
                    result.add(new DateTick(TickType.MINOR,
                            new Date(minorTickTime), "", TextAnchor.TOP_CENTER,
                            TextAnchor.CENTER, 0.0));
                }
            }

            if (!isHiddenValue(tickDate.getTime())) {
                String tickLabel;
                DateFormat formatter = getDateFormatOverride();
                if (formatter != null) {
                    tickLabel = formatter.format(tickDate);
                } else {
                    tickLabel = this.tickUnit.dateToString(tickDate);
                }
                TextAnchor anchor, rotationAnchor;
                double angle = 0.0;
                if (isVerticalTickLabels()) {
                    anchor = TextAnchor.CENTER_RIGHT;
                    rotationAnchor = TextAnchor.CENTER_RIGHT;
                    if (edge == RectangleEdge.TOP) {
                        angle = Math.PI / 2.0;
                    } else {
                        angle = -Math.PI / 2.0;
                    }
                } else {
                    if (edge == RectangleEdge.TOP) {
                        anchor = TextAnchor.BOTTOM_CENTER;
                        rotationAnchor = TextAnchor.BOTTOM_CENTER;
                    } else {
                        anchor = TextAnchor.TOP_CENTER;
                        rotationAnchor = TextAnchor.TOP_CENTER;
                    }
                }

                Tick tick = new DateTick(tickDate, tickLabel, anchor,
                        rotationAnchor, angle);
                result.add(tick);
                hasRolled = false;

                long currentTickTime = tickDate.getTime();
                tickDate = unit.addToDate(tickDate, this.timeZone);
                long nextTickTime = tickDate.getTime();
                for (int minorTick = 1; minorTick < minorTickSpaces;
                        minorTick++) {
                    long minorTickTime = currentTickTime
                            + (nextTickTime - currentTickTime)
                            * minorTick / minorTickSpaces;
                    if (getRange().contains(minorTickTime)
                            && (!isHiddenValue(minorTickTime))) {
                        result.add(new DateTick(TickType.MINOR,
                                new Date(minorTickTime), "",
                                TextAnchor.TOP_CENTER, TextAnchor.CENTER,
                                0.0));
                    }
                }

            } else {
                tickDate = unit.rollDate(tickDate, this.timeZone);
                hasRolled = true;
                continue;
            }

        }
        return result;
    }

    protected List refreshTicksVertical(Graphics2D g2,
            Rectangle2D dataArea, RectangleEdge edge) {

        List result = new java.util.ArrayList();

        Font tickLabelFont = getTickLabelFont();
        g2.setFont(tickLabelFont);

        if (isAutoTickUnitSelection()) {
            selectAutoTickUnit(g2, dataArea, edge);
        }
        DateTickUnit unit = getTickUnit();
        Date tickDate = calculateLowestVisibleTickValue(unit);
        Date upperDate = getMaximumDate();

        boolean hasRolled = false;
        while (tickDate.before(upperDate)) {

            if (!hasRolled) {
                tickDate = correctTickDateForPosition(tickDate, unit,
                    this.tickMarkPosition);
            }

            long lowestTickTime = tickDate.getTime();
            long distance = unit.addToDate(tickDate, this.timeZone).getTime()
                    - lowestTickTime;
            int minorTickSpaces = getMinorTickCount();
            if (minorTickSpaces <= 0) {
                minorTickSpaces = unit.getMinorTickCount();
            }
            for (int minorTick = 1; minorTick < minorTickSpaces; minorTick++) {
                long minorTickTime = lowestTickTime - distance
                        * minorTick / minorTickSpaces;
                if (minorTickTime > 0 && getRange().contains(minorTickTime)
                        && (!isHiddenValue(minorTickTime))) {
                    result.add(new DateTick(TickType.MINOR,
                            new Date(minorTickTime), "", TextAnchor.TOP_CENTER,
                            TextAnchor.CENTER, 0.0));
                }
            }
            if (!isHiddenValue(tickDate.getTime())) {
                String tickLabel;
                DateFormat formatter = getDateFormatOverride();
                if (formatter != null) {
                    tickLabel = formatter.format(tickDate);
                } else {
                    tickLabel = this.tickUnit.dateToString(tickDate);
                }
                TextAnchor anchor, rotationAnchor;
                double angle = 0.0;
                if (isVerticalTickLabels()) {
                    anchor = TextAnchor.BOTTOM_CENTER;
                    rotationAnchor = TextAnchor.BOTTOM_CENTER;
                    if (edge == RectangleEdge.LEFT) {
                        angle = -Math.PI / 2.0;
                    } else {
                        angle = Math.PI / 2.0;
                    }
                } else {
                    if (edge == RectangleEdge.LEFT) {
                        anchor = TextAnchor.CENTER_RIGHT;
                        rotationAnchor = TextAnchor.CENTER_RIGHT;
                    } else {
                        anchor = TextAnchor.CENTER_LEFT;
                        rotationAnchor = TextAnchor.CENTER_LEFT;
                    }
                }

                Tick tick = new DateTick(tickDate, tickLabel, anchor,
                        rotationAnchor, angle);
                result.add(tick);
                hasRolled = false;

                long currentTickTime = tickDate.getTime();
                tickDate = unit.addToDate(tickDate, this.timeZone);
                long nextTickTime = tickDate.getTime();
                for (int minorTick = 1; minorTick < minorTickSpaces;
                        minorTick++) {
                    long minorTickTime = currentTickTime
                            + (nextTickTime - currentTickTime)
                            * minorTick / minorTickSpaces;
                    if (getRange().contains(minorTickTime)
                            && (!isHiddenValue(minorTickTime))) {
                        result.add(new DateTick(TickType.MINOR,
                                new Date(minorTickTime), "",
                                TextAnchor.TOP_CENTER, TextAnchor.CENTER,
                                0.0));
                    }
                }
            } else {
                tickDate = unit.rollDate(tickDate, this.timeZone);
                hasRolled = true;
            }
        }
        return result;
    }

    @Override
    public AxisState draw(Graphics2D g2, double cursor, Rectangle2D plotArea,
            Rectangle2D dataArea, RectangleEdge edge,
            PlotRenderingInfo plotState) {

        if (!isVisible()) {
            AxisState state = new AxisState(cursor);
            List ticks = refreshTicks(g2, state, dataArea, edge);
            state.setTicks(ticks);
            return state;
        }

        AxisState state = drawTickMarksAndLabels(g2, cursor, plotArea,
                dataArea, edge);

        if (getAttributedLabel() != null) {
            state = drawAttributedLabel(getAttributedLabel(), g2, plotArea,
                    dataArea, edge, state);
        } else {
            state = drawLabel(getLabel(), g2, plotArea, dataArea, edge, state);
        }
        createAndAddEntity(cursor, state, dataArea, edge, plotState);
        return state;
    }

    @Override
    public void zoomRange(double lowerPercent, double upperPercent) {
        double start = this.timeline.toTimelineValue(
                (long) getRange().getLowerBound());
        double end = this.timeline.toTimelineValue(
                (long) getRange().getUpperBound());
        double length = end - start;
        long adjStart, adjEnd;
        if (isInverted()) {
            adjStart = (long) (start + (length * (1 - upperPercent)));
            adjEnd = (long) (start + (length * (1 - lowerPercent)));
        } else {
            adjStart = (long) (start + length * lowerPercent);
            adjEnd = (long) (start + length * upperPercent);
        }
        if (adjEnd <= adjStart) {
            adjEnd = adjStart + 1L;
        }
        DateRange adjusted = new DateRange(this.timeline.toMillisecond(adjStart),
               this.timeline.toMillisecond(adjEnd));
        setRange(adjusted);
    }

    @Override
    public boolean equals(Object obj) {
        if (obj == this) {
            return true;
        }
        if (!(obj instanceof DateAxis)) {
            return false;
        }
        DateAxis that = (DateAxis) obj;
        if (!ObjectUtilities.equal(this.timeZone, that.timeZone)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.locale, that.locale)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.tickUnit, that.tickUnit)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.dateFormatOverride,
                that.dateFormatOverride)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.tickMarkPosition,
                that.tickMarkPosition)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.timeline, that.timeline)) {
            return false;
        }
        return super.equals(obj);
    }

    @Override
    public int hashCode() {
        return super.hashCode();
    }

    /**
     * Returns a collection of standard date tick units.  This collection will
     * be used by default, but you are free to create your own collection if
     * you want to (see the
     * {@link ValueAxis#setStandardTickUnits(TickUnitSource)} method inherited
     * from the {@link ValueAxis} class).
     *
     * @param zone  the time zone (<code>null</code> not permitted).
     *
     * @return A collection of standard date tick units.
     *
     * @deprecated Since 1.0.11, use {@link #createStandardDateTickUnits(
     *         TimeZone, Locale)} to explicitly set the locale as well as the
     *         time zone.
     */
    public static TickUnitSource createStandardDateTickUnits(TimeZone zone) {
        return createStandardDateTickUnits(zone, Locale.getDefault());
    }
}