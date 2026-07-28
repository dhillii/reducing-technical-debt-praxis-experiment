/**
 * Creates a copy of the contour plot.
 *
 * @param plot the plot to copy
 * @return a new contour plot that is a copy of the input plot
 */
public static ContourPlot createCopy(ContourPlot plot) {
    ContourPlot copy = new ContourPlot();
    copy.domainAxis = (ValueAxis) plot.domainAxis.clone();
    copy.domainAxis.setPlot(copy);
    copy.domainAxis.addChangeListener(copy);

    copy.rangeAxis = (ValueAxis) plot.rangeAxis.clone();
    copy.rangeAxis.setPlot(copy);
    copy.rangeAxis.addChangeListener(copy);

    copy.dataset = plot.dataset;
    if (copy.dataset != null) {
        copy.dataset.addChangeListener(copy);
    }

    copy.colorBar = (ColorBar) plot.colorBar.clone();
    copy.colorBarLocation = plot.colorBarLocation;

    copy.domainMarkers = (List) ObjectUtilities.deepClone(plot.domainMarkers);
    copy.rangeMarkers = (List) ObjectUtilities.deepClone(plot.rangeMarkers);
    copy.annotations = (List) ObjectUtilities.deepClone(plot.annotations);

    copy.clipPath = (ClipPath) plot.clipPath.clone();
    copy.missingPaint = plot.missingPaint;

    copy.toolTipGenerator = plot.toolTipGenerator;
    copy.urlGenerator = plot.urlGenerator;

    copy.renderAsPoints = plot.renderAsPoints;
    copy.ptSizePct = plot.ptSizePct;

    copy.domainCrosshairVisible = plot.domainCrosshairVisible;
    copy.domainCrosshairValue = plot.domainCrosshairValue;
    copy.domainCrosshairStroke = plot.domainCrosshairStroke;
    copy.domainCrosshairPaint = plot.domainCrosshairPaint;
    copy.domainCrosshairLockedOnData = plot.domainCrosshairLockedOnData;

    copy.rangeCrosshairVisible = plot.rangeCrosshairVisible;
    copy.rangeCrosshairValue = plot.rangeCrosshairValue;
    copy.rangeCrosshairStroke = plot.rangeCrosshairStroke;
    copy.rangeCrosshairPaint = plot.rangeCrosshairPaint;
    copy.rangeCrosshairLockedOnData = plot.rangeCrosshairLockedOnData;

    copy.dataAreaRatio = plot.dataAreaRatio;

    return copy;
}