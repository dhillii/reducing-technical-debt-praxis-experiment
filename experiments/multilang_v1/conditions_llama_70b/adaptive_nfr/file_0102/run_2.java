public class ChartPanel extends JPanel implements ChartChangeListener,
        ChartProgressListener, ActionListener, MouseListener,
        MouseMotionListener, OverlayChangeListener, Printable, Serializable {

    // ...

    public static class ChartPanelConfiguration {
        private JFreeChart chart;
        private int width;
        private int height;
        private int minimumDrawWidth;
        private int minimumDrawHeight;
        private int maximumDrawWidth;
        private int maximumDrawHeight;
        private boolean useBuffer;
        private boolean properties;
        private boolean copy;
        private boolean save;
        private boolean print;
        private boolean zoom;
        private boolean tooltips;

        public ChartPanelConfiguration(JFreeChart chart, int width, int height,
                int minimumDrawWidth, int minimumDrawHeight, int maximumDrawWidth,
                int maximumDrawHeight, boolean useBuffer, boolean properties,
                boolean copy, boolean save, boolean print, boolean zoom,
                boolean tooltips) {
            this.chart = chart;
            this.width = width;
            this.height = height;
            this.minimumDrawWidth = minimumDrawWidth;
            this.minimumDrawHeight = minimumDrawHeight;
            this.maximumDrawWidth = maximumDrawWidth;
            this.maximumDrawHeight = maximumDrawHeight;
            this.useBuffer = useBuffer;
            this.properties = properties;
            this.copy = copy;
            this.save = save;
            this.print = print;
            this.zoom = zoom;
            this.tooltips = tooltips;
        }

        public JFreeChart getChart() {
            return chart;
        }

        public int getWidth() {
            return width;
        }

        public int getHeight() {
            return height;
        }

        public int getMinimumDrawWidth() {
            return minimumDrawWidth;
        }

        public int getMinimumDrawHeight() {
            return minimumDrawHeight;
        }

        public int getMaximumDrawWidth() {
            return maximumDrawWidth;
        }

        public int getMaximumDrawHeight() {
            return maximumDrawHeight;
        }

        public boolean isUseBuffer() {
            return useBuffer;
        }

        public boolean isProperties() {
            return properties;
        }

        public boolean isCopy() {
            return copy;
        }

        public boolean isSave() {
            return save;
        }

        public boolean isPrint() {
            return print;
        }

        public boolean isZoom() {
            return zoom;
        }

        public boolean isTooltips() {
            return tooltips;
        }
    }

    public ChartPanel(ChartPanelConfiguration config) {
        this(config.getChart(), config.getWidth(), config.getHeight(),
                config.getMinimumDrawWidth(), config.getMinimumDrawHeight(),
                config.getMaximumDrawWidth(), config.getMaximumDrawHeight(),
                config.isUseBuffer(), config.isProperties(), config.isCopy(),
                config.isSave(), config.isPrint(), config.isZoom(),
                config.isTooltips());
    }

    // ...
}