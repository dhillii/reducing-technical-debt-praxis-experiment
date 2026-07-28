/**
 * Creates a new instance that is a copy of the specified axis.
 *
 * @param axis  the axis to copy.
 */
public DateAxis(DateAxis axis) {
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

// Remove the clone method