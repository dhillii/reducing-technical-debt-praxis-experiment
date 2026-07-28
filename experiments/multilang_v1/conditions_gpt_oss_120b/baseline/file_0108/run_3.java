@Override
    public boolean removeAnnotation(XYAnnotation annotation) {
        boolean removedFromForeground = this.foregroundAnnotations.remove(annotation);
        boolean removedFromBackground = this.backgroundAnnotations.remove(annotation);
        annotation.removeChangeListener(this);
        fireChangeEvent();
        return removedFromForeground && removedFromBackground;
    }