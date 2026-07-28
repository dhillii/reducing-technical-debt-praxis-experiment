/**
 * Creates a new plot that is a copy of the specified plot.
 *
 * @param plot  the plot to copy.
 */
public PolarPlot(PolarPlot plot) {
    this.datasets = (ObjectList) ObjectUtilities.clone(plot.datasets);
    for (int i = 0; i < this.datasets.size(); i++) {
        XYDataset dataset = (XYDataset) this.datasets.get(i);
        if (dataset != null) {
            dataset.addChangeListener(this);
        }
    }

    this.axes = (ObjectList) ObjectUtilities.clone(plot.axes);
    for (int i = 0; i < this.axes.size(); i++) {
        ValueAxis axis = (ValueAxis) this.axes.get(i);
        if (axis != null) {
            ValueAxis clonedAxis = (ValueAxis) axis.clone();
            this.axes.set(i, clonedAxis);
            clonedAxis.setPlot(this);
            clonedAxis.addChangeListener(this);
        }
    }

    this.axisLocations = (ObjectList) ObjectUtilities.clone(plot.axisLocations);

    this.renderers = (ObjectList) ObjectUtilities.clone(plot.renderers);
    for (int i = 0; i < this.renderers.size(); i++) {
        PolarItemRenderer renderer = (PolarItemRenderer) this.renderers.get(i);
        if (renderer != null && renderer instanceof PublicCloneable) {
            PublicCloneable pc = (PublicCloneable) renderer;
            PolarItemRenderer rc = (PolarItemRenderer) pc.clone();
            this.renderers.set(i, rc);
            rc.setPlot(this);
            rc.addChangeListener(this);
        }
    }

    this.angleTickUnit = (TickUnit) plot.angleTickUnit.clone();
    this.angleOffset = plot.angleOffset;
    this.counterClockwise = plot.counterClockwise;
    this.angleLabelsVisible = plot.angleLabelsVisible;
    this.angleLabelFont = plot.angleLabelFont;
    this.angleLabelPaint = plot.angleLabelPaint;
    this.angleGridlinesVisible = plot.angleGridlinesVisible;
    this.angleGridlineStroke = (Stroke) plot.angleGridlineStroke;
    this.angleGridlinePaint = plot.angleGridlinePaint;
    this.radiusGridlinesVisible = plot.radiusGridlinesVisible;
    this.radiusGridlineStroke = (Stroke) plot.radiusGridlineStroke;
    this.radiusGridlinePaint = plot.radiusGridlinePaint;
    this.radiusMinorGridlinesVisible = plot.radiusMinorGridlinesVisible;
    this.cornerTextItems = new ArrayList(plot.cornerTextItems);
    this.margin = plot.margin;
    this.fixedLegendItems = plot.fixedLegendItems;
    this.datasetToAxesMap = (Map) ObjectUtilities.clone(plot.datasetToAxesMap);
}

/**
 * Removes the clone method implementation.
 */
// @Override
// public Object clone() throws CloneNotSupportedException {
//     // implementation removed
// }