/**
 * Creates a copy of the plot.
 *
 * @return A copy of the plot.
 */
public PolarPlot copy() {
    PolarPlot copy = new PolarPlot();
    copy.axes = (ObjectList) ObjectUtilities.clone(this.axes);
    for (int i = 0; i < this.axes.size(); i++) {
        ValueAxis axis = (ValueAxis) this.axes.get(i);
        if (axis != null) {
            ValueAxis clonedAxis = (ValueAxis) axis.clone();
            copy.axes.set(i, clonedAxis);
            clonedAxis.setPlot(copy);
            clonedAxis.addChangeListener(copy);
        }
    }

    // the datasets are not cloned, but listeners need to be added...
    copy.datasets = (ObjectList) ObjectUtilities.clone(this.datasets);
    for (int i = 0; i < copy.datasets.size(); ++i) {
        XYDataset d = getDataset(i);
        if (d != null) {
            d.addChangeListener(copy);
        }
    }

    copy.renderers = (ObjectList) ObjectUtilities.clone(this.renderers);
    for (int i = 0; i < this.renderers.size(); i++) {
        PolarItemRenderer renderer2 = (PolarItemRenderer) this.renderers.get(i);
        if (renderer2 instanceof PublicCloneable) {
            PublicCloneable pc = (PublicCloneable) renderer2;
            PolarItemRenderer rc = (PolarItemRenderer) pc.clone();
            copy.renderers.set(i, rc);
            rc.setPlot(copy);
            rc.addChangeListener(copy);
        }
    }

    copy.cornerTextItems = new ArrayList(this.cornerTextItems);
    copy.angleTickUnit = this.angleTickUnit;
    copy.angleOffset = this.angleOffset;
    copy.counterClockwise = this.counterClockwise;
    copy.angleLabelsVisible = this.angleLabelsVisible;
    copy.angleLabelFont = this.angleLabelFont;
    copy.angleLabelPaint = this.angleLabelPaint;
    copy.angleGridlinesVisible = this.angleGridlinesVisible;
    copy.angleGridlineStroke = this.angleGridlineStroke;
    copy.angleGridlinePaint = this.angleGridlinePaint;
    copy.radiusGridlinesVisible = this.radiusGridlinesVisible;
    copy.radiusGridlineStroke = this.radiusGridlineStroke;
    copy.radiusGridlinePaint = this.radiusGridlinePaint;
    copy.radiusMinorGridlinesVisible = this.radiusMinorGridlinesVisible;
    copy.margin = this.margin;
    copy.fixedLegendItems = this.fixedLegendItems;
    copy.datasetToAxesMap = new TreeMap(this.datasetToAxesMap);
    copy.axisLocations = (ObjectList) ObjectUtilities.clone(this.axisLocations);

    return copy;
}