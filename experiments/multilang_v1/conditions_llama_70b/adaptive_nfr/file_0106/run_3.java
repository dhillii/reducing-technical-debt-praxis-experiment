public PiePlot(PiePlot other) {
    this.dataset = other.dataset;
    this.pieIndex = other.pieIndex;
    this.interiorGap = other.interiorGap;
    this.circular = other.circular;
    this.startAngle = other.startAngle;
    this.direction = other.direction;
    this.minimumArcAngleToDraw = other.minimumArcAngleToDraw;
    this.sectionPaintMap = (PaintMap) other.sectionPaintMap.clone();
    this.baseSectionPaint = other.baseSectionPaint;
    this.autoPopulateSectionPaint = other.autoPopulateSectionPaint;
    this.sectionOutlinesVisible = other.sectionOutlinesVisible;
    this.sectionOutlinePaintMap = (PaintMap) other.sectionOutlinePaintMap.clone();
    this.baseSectionOutlinePaint = other.baseSectionOutlinePaint;
    this.autoPopulateSectionOutlinePaint = other.autoPopulateSectionOutlinePaint;
    this.sectionOutlineStrokeMap = (StrokeMap) other.sectionOutlineStrokeMap.clone();
    this.baseSectionOutlineStroke = other.baseSectionOutlineStroke;
    this.autoPopulateSectionOutlineStroke = other.autoPopulateSectionOutlineStroke;
    this.explodePercentages = new TreeMap<>(other.explodePercentages);
    this.labelGenerator = other.labelGenerator;
    this.labelFont = other.labelFont;
    this.labelPaint = other.labelPaint;
    this.labelBackgroundPaint = other.labelBackgroundPaint;
    this.labelOutlinePaint = other.labelOutlinePaint;
    this.labelOutlineStroke = other.labelOutlineStroke;
    this.labelShadowPaint = other.labelShadowPaint;
    this.simpleLabels = other.simpleLabels;
    this.simpleLabelOffset = other.simpleLabelOffset;
    this.labelPadding = other.labelPadding;
    this.maximumLabelWidth = other.maximumLabelWidth;
    this.labelGap = other.labelGap;
    this.labelLinksVisible = other.labelLinksVisible;
    this.labelLinkStyle = other.labelLinkStyle;
    this.labelLinkMargin = other.labelLinkMargin;
    this.labelLinkPaint = other.labelLinkPaint;
    this.labelLinkStroke = other.labelLinkStroke;
    this.labelDistributor = other.labelDistributor;
    this.toolTipGenerator = other.toolTipGenerator;
    this.urlGenerator = other.urlGenerator;
    this.legendLabelGenerator = other.legendLabelGenerator;
    this.legendLabelToolTipGenerator = other.legendLabelToolTipGenerator;
    this.legendLabelURLGenerator = other.legendLabelURLGenerator;
    this.legendItemShape = other.legendItemShape;
    this.ignoreNullValues = other.ignoreNullValues;
    this.ignoreZeroValues = other.ignoreZeroValues;
    this.shadowGenerator = other.shadowGenerator;
    this.shadowPaint = other.shadowPaint;
    this.shadowXOffset = other.shadowXOffset;
    this.shadowYOffset = other.shadowYOffset;
}

@Override
public Object clone() throws CloneNotSupportedException {
    return new PiePlot(this);
}