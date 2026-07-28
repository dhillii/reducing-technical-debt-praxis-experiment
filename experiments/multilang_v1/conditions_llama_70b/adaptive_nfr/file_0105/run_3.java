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

    @Override
    public Object clone() throws CloneNotSupportedException {
        ContourPlot clone = (ContourPlot) super.clone();

        ContourPlotConfiguration configuration = new ContourPlotConfiguration(
                (ContourDataset) this.dataset,
                (ValueAxis) this.domainAxis,
                (ValueAxis) this.rangeAxis,
                (ColorBar) this.colorBar
        );

        clone.dataset = configuration.getDataset();
        clone.domainAxis = configuration.getDomainAxis();
        clone.rangeAxis = configuration.getRangeAxis();
        clone.colorBar = configuration.getColorBar();

        if (clone.dataset != null) {
            clone.dataset.addChangeListener(clone);
        }

        if (clone.domainAxis != null) {
            clone.domainAxis.setPlot(clone);
            clone.domainAxis.addChangeListener(clone);
        }

        if (clone.rangeAxis != null) {
            clone.rangeAxis.setPlot(clone);
            clone.rangeAxis.addChangeListener(clone);
        }

        if (clone.colorBar != null) {
            clone.colorBar.getAxis().setPlot(clone);
            clone.colorBar.getAxis().addChangeListener(clone);
            clone.colorBar.configure(clone);
        }

        return clone;
    }

    // ...
}