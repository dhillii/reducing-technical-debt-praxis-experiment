/**
 * Creates a copy of the plot.
 *
 * @param plot the plot to copy.
 */
public ContourPlot(ContourPlot plot) {
    this.dataset = plot.dataset;
    if (this.dataset != null) {
        this.dataset.addChangeListener(this);
    }

    this.domainAxis = (ValueAxis) plot.domainAxis.clone();
    if (this.domainAxis != null) {
        this.domainAxis.setPlot(this);
        this.domainAxis.addChangeListener(this);
    }

    this.rangeAxis = (ValueAxis) plot.rangeAxis.clone();
    if (this.rangeAxis != null) {
        this.rangeAxis.setPlot(this);
        this.rangeAxis.addChangeListener(this);
    }

    this.colorBar = (ColorBar) plot.colorBar.clone();
    if (this.colorBar != null) {
        this.colorBar.getAxis().setPlot(this);
        this.colorBar.getAxis().addChangeListener(this);
        this.colorBar.configure(this);
    }

    this.domainMarkers = (List) ObjectUtilities.deepClone(plot.domainMarkers);
    this.rangeMarkers = (List) ObjectUtilities.deepClone(plot.rangeMarkers);
    this.annotations = (List) ObjectUtilities.deepClone(plot.annotations);

    this.clipPath = (ClipPath) plot.clipPath.clone();

    this.toolTipGenerator = plot.toolTipGenerator;
    this.urlGenerator = plot.urlGenerator;

    this.domainCrosshairVisible = plot.domainCrosshairVisible;
    this.domainCrosshairValue = plot.domainCrosshairValue;
    this.domainCrosshairStroke = plot.domainCrosshairStroke;
    this.domainCrosshairPaint = plot.domainCrosshairPaint;
    this.domainCrosshairLockedOnData = plot.domainCrosshairLockedOnData;

    this.rangeCrosshairVisible = plot.rangeCrosshairVisible;
    this.rangeCrosshairValue = plot.rangeCrosshairValue;
    this.rangeCrosshairStroke = plot.rangeCrosshairStroke;
    this.rangeCrosshairPaint = plot.rangeCrosshairPaint;
    this.rangeCrosshairLockedOnData = plot.rangeCrosshairLockedOnData;

    this.dataAreaRatio = plot.dataAreaRatio;
    this.renderAsPoints = plot.renderAsPoints;
    this.ptSizePct = plot.ptSizePct;
    this.missingPaint = plot.missingPaint;
}

// Remove the clone() method