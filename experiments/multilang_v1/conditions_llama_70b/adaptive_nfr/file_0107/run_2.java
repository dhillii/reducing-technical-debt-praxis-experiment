public class PolarPlot extends Plot implements ValueAxisPlot, Zoomable,
        RendererChangeListener, PublicCloneable {

    // ...

    /**
     * Creates a copy of the plot.
     *
     * @param plot the plot to copy
     */
    public PolarPlot(PolarPlot plot) {
        this.datasets = (ObjectList) ObjectUtilities.clone(plot.datasets);
        this.axes = (ObjectList) ObjectUtilities.clone(plot.axes);
        this.axisLocations = (ObjectList) ObjectUtilities.clone(plot.axisLocations);
        this.renderers = (ObjectList) ObjectUtilities.clone(plot.renderers);
        this.angleTickUnit = plot.angleTickUnit;
        this.angleOffset = plot.angleOffset;
        this.counterClockwise = plot.counterClockwise;
        this.angleLabelsVisible = plot.angleLabelsVisible;
        this.angleLabelFont = plot.angleLabelFont;
        this.angleLabelPaint = plot.angleLabelPaint;
        this.angleGridlinesVisible = plot.angleGridlinesVisible;
        this.angleGridlineStroke = plot.angleGridlineStroke;
        this.angleGridlinePaint = plot.angleGridlinePaint;
        this.radiusGridlinesVisible = plot.radiusGridlinesVisible;
        this.radiusGridlineStroke = plot.radiusGridlineStroke;
        this.radiusGridlinePaint = plot.radiusGridlinePaint;
        this.radiusMinorGridlinesVisible = plot.radiusMinorGridlinesVisible;
        this.cornerTextItems = new ArrayList(plot.cornerTextItems);
        this.margin = plot.margin;
        this.fixedLegendItems = plot.fixedLegendItems;
        this.datasetToAxesMap = new TreeMap(plot.datasetToAxesMap);
    }

    /**
     * Returns a copy of the plot.
     *
     * @return A copy of the plot.
     *
     * @throws CloneNotSupportedException  this can occur if some component of
     *         the plot cannot be cloned.
     */
    @Override
    public Object clone() throws CloneNotSupportedException {
        return new PolarPlot(this);
    }

    // ...
}