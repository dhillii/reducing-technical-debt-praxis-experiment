public class PiePlot extends Plot implements Cloneable, Serializable {

    // ...

    /**
     * Creates a copy of the plot.
     *
     * @return A copy of the plot.
     */
    public PiePlot copy() {
        PiePlot copy = new PiePlot();
        copy.dataset = this.dataset;
        copy.pieIndex = this.pieIndex;
        copy.interiorGap = this.interiorGap;
        copy.circular = this.circular;
        copy.startAngle = this.startAngle;
        copy.direction = this.direction;
        copy.minimumArcAngleToDraw = this.minimumArcAngleToDraw;
        copy.sectionPaintMap = (PaintMap) this.sectionPaintMap.clone();
        copy.baseSectionPaint = this.baseSectionPaint;
        copy.autoPopulateSectionPaint = this.autoPopulateSectionPaint;
        copy.sectionOutlinesVisible = this.sectionOutlinesVisible;
        copy.sectionOutlinePaintMap = (PaintMap) this.sectionOutlinePaintMap.clone();
        copy.baseSectionOutlinePaint = this.baseSectionOutlinePaint;
        copy.autoPopulateSectionOutlinePaint = this.autoPopulateSectionOutlinePaint;
        copy.sectionOutlineStrokeMap = (StrokeMap) this.sectionOutlineStrokeMap.clone();
        copy.baseSectionOutlineStroke = this.baseSectionOutlineStroke;
        copy.autoPopulateSectionOutlineStroke = this.autoPopulateSectionOutlineStroke;
        copy.explodePercentages = new TreeMap<>(this.explodePercentages);
        copy.labelGenerator = this.labelGenerator != null ? (PieSectionLabelGenerator) ObjectUtilities.clone(this.labelGenerator) : null;
        copy.labelFont = this.labelFont;
        copy.labelPaint = this.labelPaint;
        copy.labelBackgroundPaint = this.labelBackgroundPaint;
        copy.labelOutlinePaint = this.labelOutlinePaint;
        copy.labelOutlineStroke = this.labelOutlineStroke;
        copy.labelShadowPaint = this.labelShadowPaint;
        copy.simpleLabels = this.simpleLabels;
        copy.simpleLabelOffset = this.simpleLabelOffset;
        copy.labelPadding = this.labelPadding;
        copy.maximumLabelWidth = this.maximumLabelWidth;
        copy.labelGap = this.labelGap;
        copy.labelLinksVisible = this.labelLinksVisible;
        copy.labelLinkStyle = this.labelLinkStyle;
        copy.labelLinkMargin = this.labelLinkMargin;
        copy.labelLinkPaint = this.labelLinkPaint;
        copy.labelLinkStroke = this.labelLinkStroke;
        copy.labelDistributor = this.labelDistributor;
        copy.toolTipGenerator = this.toolTipGenerator;
        copy.urlGenerator = this.urlGenerator != null ? (PieURLGenerator) ObjectUtilities.clone(this.urlGenerator) : null;
        copy.legendLabelGenerator = this.legendLabelGenerator != null ? (PieSectionLabelGenerator) ObjectUtilities.clone(this.legendLabelGenerator) : null;
        copy.legendLabelToolTipGenerator = this.legendLabelToolTipGenerator != null ? (PieSectionLabelGenerator) ObjectUtilities.clone(this.legendLabelToolTipGenerator) : null;
        copy.legendLabelURLGenerator = this.legendLabelURLGenerator != null ? (PieURLGenerator) ObjectUtilities.clone(this.legendLabelURLGenerator) : null;
        copy.legendItemShape = ShapeUtilities.clone(this.legendItemShape);
        copy.ignoreNullValues = this.ignoreNullValues;
        copy.ignoreZeroValues = this.ignoreZeroValues;
        copy.shadowGenerator = this.shadowGenerator;
        return copy;
    }

    // ...
}