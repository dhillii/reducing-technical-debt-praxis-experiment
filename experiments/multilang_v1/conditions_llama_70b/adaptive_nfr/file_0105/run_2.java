public class ContourPlot extends Plot implements ContourValuePlot, ValueAxisPlot, PropertyChangeListener, Serializable, Cloneable {

    // ...

    public static class ContourPlotConfiguration {
        private ContourDataset dataset;
        private ValueAxis domainAxis;
        private ValueAxis rangeAxis;
        private ColorBar colorBar;
        private RectangleEdge colorBarLocation;

        public ContourPlotConfiguration(ContourDataset dataset, ValueAxis domainAxis, ValueAxis rangeAxis, ColorBar colorBar) {
            this.dataset = dataset;
            this.domainAxis = domainAxis;
            this.rangeAxis = rangeAxis;
            this.colorBar = colorBar;
            this.colorBarLocation = RectangleEdge.LEFT;
        }

        public ContourDataset getDataset() {
            return dataset;
        }

        public ValueAxis getDomainAxis() {
            return domainAxis;
        }

        public ValueAxis getRangeAxis() {
            return rangeAxis;
        }

        public ColorBar getColorBar() {
            return colorBar;
        }

        public RectangleEdge getColorBarLocation() {
            return colorBarLocation;
        }
    }

    public static class ContourPlotBuilder {
        private ContourDataset dataset;
        private ValueAxis domainAxis;
        private ValueAxis rangeAxis;
        private ColorBar colorBar;
        private RectangleEdge colorBarLocation;

        public ContourPlotBuilder withDataset(ContourDataset dataset) {
            this.dataset = dataset;
            return this;
        }

        public ContourPlotBuilder withDomainAxis(ValueAxis domainAxis) {
            this.domainAxis = domainAxis;
            return this;
        }

        public ContourPlotBuilder withRangeAxis(ValueAxis rangeAxis) {
            this.rangeAxis = rangeAxis;
            return this;
        }

        public ContourPlotBuilder withColorBar(ColorBar colorBar) {
            this.colorBar = colorBar;
            return this;
        }

        public ContourPlotBuilder withColorBarLocation(RectangleEdge colorBarLocation) {
            this.colorBarLocation = colorBarLocation;
            return this;
        }

        public ContourPlot build() {
            return new ContourPlot(new ContourPlotConfiguration(dataset, domainAxis, rangeAxis, colorBar));
        }
    }

    public ContourPlot(ContourPlotConfiguration configuration) {
        super();

        this.dataset = configuration.getDataset();
        if (dataset != null) {
            dataset.addChangeListener(this);
        }

        this.domainAxis = configuration.getDomainAxis();
        if (domainAxis != null) {
            domainAxis.setPlot(this);
            domainAxis.addChangeListener(this);
        }

        this.rangeAxis = configuration.getRangeAxis();
        if (rangeAxis != null) {
            rangeAxis.setPlot(this);
            rangeAxis.addChangeListener(this);
        }

        this.colorBar = configuration.getColorBar();
        if (colorBar != null) {
            colorBar.getAxis().setPlot(this);
            colorBar.getAxis().addChangeListener(this);
            colorBar.configure(this);
        }
        this.colorBarLocation = configuration.getColorBarLocation();

        this.toolTipGenerator = new StandardContourToolTipGenerator();
    }

    // ...

    public static ContourPlot createContourPlot(ContourDataset dataset, ValueAxis domainAxis, ValueAxis rangeAxis, ColorBar colorBar) {
        return new ContourPlotBuilder()
                .withDataset(dataset)
                .withDomainAxis(domainAxis)
                .withRangeAxis(rangeAxis)
                .withColorBar(colorBar)
                .build();
    }

    // ...

    @Override
    public Object clone() throws CloneNotSupportedException {
        ContourPlot clone = (ContourPlot) super.clone();

        if (this.domainAxis != null) {
            clone.domainAxis = (ValueAxis) this.domainAxis.clone();
            clone.domainAxis.setPlot(clone);
            clone.domainAxis.addChangeListener(clone);
        }
        if (this.rangeAxis != null) {
            clone.rangeAxis = (ValueAxis) this.rangeAxis.clone();
            clone.rangeAxis.setPlot(clone);
            clone.rangeAxis.addChangeListener(clone);
        }

        if (clone.dataset != null) {
            clone.dataset.addChangeListener(clone);
        }

        if (this.colorBar != null) {
            clone.colorBar = (ColorBar) this.colorBar.clone();
        }

        clone.domainMarkers = (List) ObjectUtilities.deepClone(this.domainMarkers);
        clone.rangeMarkers = (List) ObjectUtilities.deepClone(this.rangeMarkers);
        clone.annotations = (List) ObjectUtilities.deepClone(this.annotations);

        if (this.clipPath != null) {
            clone.clipPath = (ClipPath) this.clipPath.clone();
        }

        return clone;
    }
}