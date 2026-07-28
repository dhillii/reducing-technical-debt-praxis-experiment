/**
 * Creates a new instance that is a copy of the specified axis.
 *
 * @param axis  the axis to copy.
 */
public DateAxis(DateAxis axis) {
    super(axis);
    this.timeZone = axis.timeZone;
    this.locale = axis.locale;
    this.tickUnit = axis.tickUnit;
    this.dateFormatOverride = axis.dateFormatOverride;
    this.tickMarkPosition = axis.tickMarkPosition;
    this.timeline = axis.timeline;
}

/**
 * Returns a copy of this axis.
 *
 * @return A copy of this axis.
 */
public DateAxis copy() {
    return new DateAxis(this);
}