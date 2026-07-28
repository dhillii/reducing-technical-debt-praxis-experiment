/**
 * Creates a copy of this theme.
 *
 * @return A copy of this theme.
 */
public StandardChartTheme copy() {
    StandardChartTheme copy = new StandardChartTheme(this.name);
    copy.extraLargeFont = this.extraLargeFont;
    copy.largeFont = this.largeFont;
    copy.regularFont = this.regularFont;
    copy.smallFont = this.smallFont;
    copy.titlePaint = this.titlePaint;
    copy.subtitlePaint = this.subtitlePaint;
    copy.chartBackgroundPaint = this.chartBackgroundPaint;
    copy.legendBackgroundPaint = this.legendBackgroundPaint;
    copy.legendItemPaint = this.legendItemPaint;
    copy.drawingSupplier = this.drawingSupplier;
    copy.plotBackgroundPaint = this.plotBackgroundPaint;
    copy.plotOutlinePaint = this.plotOutlinePaint;
    copy.labelLinkStyle = this.labelLinkStyle;
    copy.labelLinkPaint = this.labelLinkPaint;
    copy.domainGridlinePaint = this.domainGridlinePaint;
    copy.rangeGridlinePaint = this.rangeGridlinePaint;
    copy.baselinePaint = this.baselinePaint;
    copy.crosshairPaint = this.crosshairPaint;
    copy.axisOffset = this.axisOffset;
    copy.axisLabelPaint = this.axisLabelPaint;
    copy.tickLabelPaint = this.tickLabelPaint;
    copy.itemLabelPaint = this.itemLabelPaint;
    copy.shadowVisible = this.shadowVisible;
    copy.shadowPaint = this.shadowPaint;
    copy.barPainter = this.barPainter;
    copy.xyBarPainter = this.xyBarPainter;
    copy.thermometerPaint = this.thermometerPaint;
    copy.wallPaint = this.wallPaint;
    copy.errorIndicatorPaint = this.errorIndicatorPaint;
    copy.gridBandPaint = this.gridBandPaint;
    copy.gridBandAlternatePaint = this.gridBandAlternatePaint;
    copy.shadowGenerator = this.shadowGenerator;
    return copy;
}