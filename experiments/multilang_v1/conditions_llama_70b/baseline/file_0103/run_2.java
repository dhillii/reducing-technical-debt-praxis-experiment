/**
 * Creates a copy of this theme.
 *
 * @return A copy of this theme.
 */
public StandardChartTheme copy() {
    StandardChartTheme result = new StandardChartTheme(this.name);
    result.extraLargeFont = this.extraLargeFont;
    result.largeFont = this.largeFont;
    result.regularFont = this.regularFont;
    result.smallFont = this.smallFont;
    result.titlePaint = this.titlePaint;
    result.subtitlePaint = this.subtitlePaint;
    result.chartBackgroundPaint = this.chartBackgroundPaint;
    result.legendBackgroundPaint = this.legendBackgroundPaint;
    result.legendItemPaint = this.legendItemPaint;
    result.drawingSupplier = this.drawingSupplier;
    result.plotBackgroundPaint = this.plotBackgroundPaint;
    result.plotOutlinePaint = this.plotOutlinePaint;
    result.labelLinkStyle = this.labelLinkStyle;
    result.labelLinkPaint = this.labelLinkPaint;
    result.domainGridlinePaint = this.domainGridlinePaint;
    result.rangeGridlinePaint = this.rangeGridlinePaint;
    result.baselinePaint = this.baselinePaint;
    result.crosshairPaint = this.crosshairPaint;
    result.axisOffset = this.axisOffset;
    result.axisLabelPaint = this.axisLabelPaint;
    result.tickLabelPaint = this.tickLabelPaint;
    result.itemLabelPaint = this.itemLabelPaint;
    result.shadowVisible = this.shadowVisible;
    result.shadowPaint = this.shadowPaint;
    result.barPainter = this.barPainter;
    result.xyBarPainter = this.xyBarPainter;
    result.thermometerPaint = this.thermometerPaint;
    result.wallPaint = this.wallPaint;
    result.errorIndicatorPaint = this.errorIndicatorPaint;
    result.gridBandPaint = this.gridBandPaint;
    result.gridBandAlternatePaint = this.gridBandAlternatePaint;
    result.shadowGenerator = this.shadowGenerator;
    return result;
}