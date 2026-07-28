public class PiePlot extends Plot implements Cloneable, Serializable {

    // ...

    public PiePlot(PiePlot original) {
        this.dataset = original.dataset;
        this.pieIndex = original.pieIndex;
        this.interiorGap = original.interiorGap;
        this.circular = original.circular;
        this.startAngle = original.startAngle;
        this.direction = original.direction;
        this.minimumArcAngleToDraw = original.minimumArcAngleToDraw;
        this.sectionPaintMap = (PaintMap) original.sectionPaintMap.clone();
        this.baseSectionPaint = original.baseSectionPaint;
        this.autoPopulateSectionPaint = original.autoPopulateSectionPaint;
        this.sectionOutlinesVisible = original.sectionOutlinesVisible;
        this.sectionOutlinePaintMap = (PaintMap) original.sectionOutlinePaintMap.clone();
        this.baseSectionOutlinePaint = original.baseSectionOutlinePaint;
        this.autoPopulateSectionOutlinePaint = original.autoPopulateSectionOutlinePaint;
        this.sectionOutlineStrokeMap = (StrokeMap) original.sectionOutlineStrokeMap.clone();
        this.baseSectionOutlineStroke = original.baseSectionOutlineStroke;
        this.autoPopulateSectionOutlineStroke = original.autoPopulateSectionOutlineStroke;
        this.explodePercentages = new TreeMap<>(original.explodePercentages);
        this.labelGenerator = original.labelGenerator;
        this.labelFont = original.labelFont;
        this.labelPaint = original.labelPaint;
        this.labelBackgroundPaint = original.labelBackgroundPaint;
        this.labelOutlinePaint = original.labelOutlinePaint;
        this.labelOutlineStroke = original.labelOutlineStroke;
        this.labelShadowPaint = original.labelShadowPaint;
        this.simpleLabels = original.simpleLabels;
        this.simpleLabelOffset = original.simpleLabelOffset;
        this.labelPadding = original.labelPadding;
        this.toolTipGenerator = original.toolTipGenerator;
        this.urlGenerator = original.urlGenerator;
        this.legendLabelGenerator = original.legendLabelGenerator;
        this.legendLabelToolTipGenerator = original.legendLabelToolTipGenerator;
        this.legendLabelURLGenerator = original.legendLabelURLGenerator;
        this.legendItemShape = ShapeUtilities.clone(original.legendItemShape);
        this.ignoreNullValues = original.ignoreNullValues;
        this.ignoreZeroValues = original.ignoreZeroValues;
        this.shadowGenerator = original.shadowGenerator;
    }

    // ...
}