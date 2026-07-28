@Override
public boolean removeAnnotation(XYAnnotation annotation) {
    boolean removedFromForeground = this.foregroundAnnotations.remove(annotation);
    boolean removedFromBackground = this.backgroundAnnotations.remove(annotation);
    boolean removed = removedFromForeground && removedFromBackground;
    annotation.removeChangeListener(this);
    fireChangeEvent();
    return removed;
}