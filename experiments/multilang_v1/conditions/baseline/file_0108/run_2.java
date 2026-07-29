@Override
public boolean removeAnnotation(XYAnnotation annotation) {
    boolean removed = this.foregroundAnnotations.remove(annotation);
    boolean backgroundRemoved = this.backgroundAnnotations.remove(annotation);
    removed = removed && backgroundRemoved;
    annotation.removeChangeListener(this);
    fireChangeEvent();
    return removed;
}