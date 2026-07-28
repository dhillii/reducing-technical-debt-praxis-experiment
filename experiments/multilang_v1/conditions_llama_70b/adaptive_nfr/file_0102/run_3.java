public class ChartPanel extends JPanel implements ChartChangeListener,
        ChartProgressListener, ActionListener, MouseListener,
        MouseMotionListener, OverlayChangeListener, Printable, Serializable {

    // ...

    public static class ChartPanelConfiguration {
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

        public ChartPanelConfiguration(int width, int height, int minimumDrawWidth, int minimumDrawHeight,
                int maximumDrawWidth, int maximumDrawHeight, boolean useBuffer, boolean properties,
                boolean copy, boolean save, boolean print, boolean zoom, boolean tooltips) {
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

        // getters and setters
    }

    public ChartPanel(JFreeChart chart, ChartPanelConfiguration config) {
        this(chart, config.width, config.height, config.minimumDrawWidth, config.minimumDrawHeight,
                config.maximumDrawWidth, config.maximumDrawHeight, config.useBuffer, config.properties,
                config.copy, config.save, config.print, config.zoom, config.tooltips);
    }

    // ...

    public ChartPanel(JFreeChart chart, int width, int height,
            int minimumDrawWidth, int minimumDrawHeight, int maximumDrawWidth,
            int maximumDrawHeight, boolean useBuffer, boolean properties,
            boolean copy, boolean save, boolean print, boolean zoom,
            boolean tooltips) {

        setChart(chart);
        this.chartMouseListeners = new EventListenerList();
        this.info = new ChartRenderingInfo();
        setPreferredSize(new Dimension(width, height));
        this.useBuffer = useBuffer;
        this.refreshBuffer = false;
        this.minimumDrawWidth = minimumDrawWidth;
        this.minimumDrawHeight = minimumDrawHeight;
        this.maximumDrawWidth = maximumDrawWidth;
        this.maximumDrawHeight = maximumDrawHeight;
        this.zoomTriggerDistance = DEFAULT_ZOOM_TRIGGER_DISTANCE;

        // ...
    }

    // ...
}