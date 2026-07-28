public class PiePlot extends Plot implements Cloneable, Serializable {

    // ...

    public PiePlot copy() throws CloneNotSupportedException {
        PiePlot copy = (PiePlot) super.clone();
        copy.sectionPaintMap = (PaintMap) this.sectionPaintMap.clone();
        copy.sectionOutlinePaintMap = (PaintMap) this.sectionOutlinePaintMap.clone();
        copy.sectionOutlineStrokeMap = (StrokeMap) this.sectionOutlineStrokeMap.clone();
        copy.explodePercentages = new TreeMap<>(this.explodePercentages);
        if (this.labelGenerator != null) {
            copy.labelGenerator = (PieSectionLabelGenerator) ObjectUtilities.clone(this.labelGenerator);
        }
        if (this.urlGenerator instanceof PublicCloneable) {
            copy.urlGenerator = (PieURLGenerator) ObjectUtilities.clone(this.urlGenerator);
        }
        copy.legendItemShape = ShapeUtilities.clone(this.legendItemShape);
        if (this.legendLabelGenerator != null) {
            copy.legendLabelGenerator = (PieSectionLabelGenerator) ObjectUtilities.clone(this.legendLabelGenerator);
        }
        if (this.legendLabelToolTipGenerator != null) {
            copy.legendLabelToolTipGenerator = (PieSectionLabelGenerator) ObjectUtilities.clone(this.legendLabelToolTipGenerator);
        }
        if (this.legendLabelURLGenerator instanceof PublicCloneable) {
            copy.legendLabelURLGenerator = (PieURLGenerator) ObjectUtilities.clone(this.legendLabelURLGenerator);
        }
        return copy;
    }

    // ...
}