/**
 * Creates a copy of the DateAxis instance.
 *
 * @return A copy of the DateAxis instance.
 *
 * @throws CloneNotSupportedException if some component of the axis does
 *         not support cloning.
 */
@Override
public Object clone() throws CloneNotSupportedException {
    return createCopy();
}

/**
 * Creates a copy of the DateAxis instance.
 *
 * @return A copy of the DateAxis instance.
 */
private DateAxis createCopy() {
    DateAxis copy = (DateAxis) super.clone();
    if (this.dateFormatOverride != null) {
        copy.dateFormatOverride = (DateFormat) this.dateFormatOverride.clone();
    }
    return copy;
}