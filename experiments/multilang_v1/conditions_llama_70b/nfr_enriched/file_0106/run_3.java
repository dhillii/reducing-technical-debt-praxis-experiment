public class PiePlot extends Plot implements Cloneable, Serializable {

    // ...

    /**
     * Creates a copy of the plot.
     *
     * @return A copy of the plot.
     *
     * @throws CloneNotSupportedException if some component of the plot does
     *         not support cloning.
     */
    @Override
    public Object clone() throws CloneNotSupportedException {
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
        copy.labelGenerator = (PieSectionLabelGenerator) ObjectUtilities.clone(this.labelGenerator);
        copy.labelFont = this.labelFont;
        copy.labelPaint = this.labelPaint;
        copy.labelBackgroundPaint = this.labelBackgroundPaint;
        copy.labelOutlinePaint = this.labelOutlinePaint;
        copy.labelOutlineStroke = this.labelOutlineStroke;
        copy.labelShadowPaint = this.labelShadowPaint;
        copy.simpleLabels = this.simpleLabels;
        copy.simpleLabelOffset = this.simpleLabelOffset;
        copy.labelPadding = this.labelPadding;
        copy.toolTipGenerator = (PieToolTipGenerator) ObjectUtilities.clone(this.toolTipGenerator);
        copy.urlGenerator = (PieURLGenerator) ObjectUtilities.clone(this.urlGenerator);
        copy.legendLabelGenerator = (PieSectionLabelGenerator) ObjectUtilities.clone(this.legendLabelGenerator);
        copy.legendLabelToolTipGenerator = (PieSectionLabelGenerator) ObjectUtilities.clone(this.legendLabelToolTipGenerator);
        copy.legendLabelURLGenerator = (PieURLGenerator) ObjectUtilities.clone(this.legendLabelURLGenerator);
        copy.legendItemShape = ShapeUtilities.clone(this.legendItemShape);
        copy.ignoreNullValues = this.ignoreNullValues;
        copy.ignoreZeroValues = this.ignoreZeroValues;
        copy.shadowGenerator = (ShadowGenerator) ObjectUtilities.clone(this.shadowGenerator);
        return copy;
    }

    // ...
}