/**
 * Creates a copy of the DateAxis instance.
 *
 * @return A copy of the DateAxis instance.
 */
public DateAxis copy() {
    DateAxis copy = new DateAxis(getLabel(), getTimeZone(), getLocale());
    copy.setTickUnit(getTickUnit());
    copy.setDateFormatOverride(getDateFormatOverride());
    copy.setTickMarkPosition(getTickMarkPosition());
    copy.setTimeline(getTimeline());
    copy.setRange(getRange());
    return copy;
}

/**
 * Returns a copy of the object.
 *
 * @return A copy.
 *
 * @throws CloneNotSupportedException if some component of the axis does
 *         not support cloning.
 */
@Override
public Object clone() throws CloneNotSupportedException {
    return copy();
}