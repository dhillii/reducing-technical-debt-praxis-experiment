/**
 * Creates a copy of the ContourPlot instance.
 *
 * @return A copy of the ContourPlot instance.
 */
public ContourPlot copy() {
    ContourPlot copy = new ContourPlot();
    copy.domainAxis = this.domainAxis != null ? (ValueAxis) this.domainAxis.clone() : null;
    copy.rangeAxis = this.rangeAxis != null ? (ValueAxis) this.rangeAxis.clone() : null;
    copy.dataset = this.dataset;
    copy.colorBar = this.colorBar != null ? (ColorBar) this.colorBar.clone() : null;
    copy.colorBarLocation = this.colorBarLocation;
    copy.domainCrosshairVisible = this.domainCrosshairVisible;
    copy.domainCrosshairValue = this.domainCrosshairValue;
    copy.domainCrosshairStroke = this.domainCrosshairStroke;
    copy.domainCrosshairPaint = this.domainCrosshairPaint;
    copy.domainCrosshairLockedOnData = this.domainCrosshairLockedOnData;
    copy.rangeCrosshairVisible = this.rangeCrosshairVisible;
    copy.rangeCrosshairValue = this.rangeCrosshairValue;
    copy.rangeCrosshairStroke = this.rangeCrosshairStroke;
    copy.rangeCrosshairPaint = this.rangeCrosshairPaint;
    copy.rangeCrosshairLockedOnData = this.rangeCrosshairLockedOnData;
    copy.dataAreaRatio = this.dataAreaRatio;
    copy.domainMarkers = this.domainMarkers != null ? (List) ObjectUtilities.deepClone(this.domainMarkers) : null;
    copy.rangeMarkers = this.rangeMarkers != null ? (List) ObjectUtilities.deepClone(this.rangeMarkers) : null;
    copy.annotations = this.annotations != null ? (List) ObjectUtilities.deepClone(this.annotations) : null;
    copy.toolTipGenerator = this.toolTipGenerator;
    copy.urlGenerator = this.urlGenerator;
    copy.renderAsPoints = this.renderAsPoints;
    copy.ptSizePct = this.ptSizePct;
    copy.clipPath = this.clipPath != null ? (ClipPath) this.clipPath.clone() : null;
    copy.missingPaint = this.missingPaint;
    return copy;
}