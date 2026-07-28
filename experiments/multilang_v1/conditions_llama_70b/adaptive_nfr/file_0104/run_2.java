public class DateAxis extends ValueAxis implements Cloneable, Serializable {

    // ...

    /**
     * Creates a copy of the object.
     *
     * @return A copy of the object.
     *
     * @throws CloneNotSupportedException if some component of the axis does
     *         not support cloning.
     */
    @Override
    public Object clone() throws CloneNotSupportedException {
        return new DateAxis(this);
    }

    /**
     * Creates a copy of the specified axis.
     *
     * @param axis  the axis to copy.
     */
    protected DateAxis(DateAxis axis) {
        super(axis);
        this.tickUnit = axis.tickUnit;
        if (axis.dateFormatOverride != null) {
            this.dateFormatOverride = (DateFormat) axis.dateFormatOverride.clone();
        }
        this.tickMarkPosition = axis.tickMarkPosition;
        this.timeZone = axis.timeZone;
        this.locale = axis.locale;
        this.timeline = axis.timeline;
    }

    // ...
}