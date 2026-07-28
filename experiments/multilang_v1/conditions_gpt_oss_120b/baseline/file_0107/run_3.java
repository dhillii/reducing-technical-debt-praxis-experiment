package org.jfree.chart.plot;

import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Composite;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Paint;
import java.awt.Point;
import java.awt.Shape;
import java.awt.Stroke;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.ResourceBundle;
import java.util.TreeMap;

import org.jfree.chart.LegendItem;
import org.jfree.chart.LegendItemCollection;
import org.jfree.chart.axis.Axis;
import org.jfree.chart.axis.AxisState;
import org.jfree.chart.axis.NumberTick;
import org.jfree.chart.axis.NumberTickUnit;
import org.jfree.chart.axis.TickType;
import org.jfree.chart.axis.TickUnit;
import org.jfree.chart.axis.ValueAxis;
import org.jfree.chart.axis.ValueTick;
import org.jfree.chart.event.PlotChangeEvent;
import org.jfree.chart.event.RendererChangeEvent;
import org.jfree.chart.event.RendererChangeListener;
import org.jfree.chart.renderer.PolarItemRenderer;
import org.jfree.chart.util.ParamChecks;
import org.jfree.chart.util.ResourceBundleWrapper;
import org.jfree.data.Range;
import org.jfree.data.general.Dataset;
import org.jfree.data.general.DatasetChangeEvent;
import org.jfree.data.general.DatasetUtilities;
import org.jfree.data.xy.XYDataset;
import org.jfree.io.SerialUtilities;
import org.jfree.text.TextUtilities;
import org.jfree.ui.RectangleEdge;
import org.jfree.ui.RectangleInsets;
import org.jfree.ui.TextAnchor;
import org.jfree.util.ObjectList;
import org.jfree.util.ObjectUtilities;
import org.jfree.util.PaintUtilities;
import org.jfree.util.PublicCloneable;

/**
 * Plots data that is in (theta, radius) pairs where
 * theta equal to zero is due north and increases clockwise.
 */
public class PolarPlot extends Plot implements ValueAxisPlot, Zoomable,
        RendererChangeListener, Serializable {

    /** For serialization. */
    private static final long serialVersionUID = 3794383185924179525L;

    /** The default margin. */
    private static final int DEFAULT_MARGIN = 20;

    /** The annotation margin. */
    private static final double ANNOTATION_MARGIN = 7.0;

    /**
     * The default angle tick unit size.
     *
     * @since 1.0.10
     */
    public static final double DEFAULT_ANGLE_TICK_UNIT_SIZE = 45.0;

    /**
     * The default angle offset.
     *
     * @since 1.0.14
     */
    public static final double DEFAULT_ANGLE_OFFSET = -90.0;

    /** The default grid line stroke. */
    public static final Stroke DEFAULT_GRIDLINE_STROKE = new BasicStroke(
            0.5f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_BEVEL,
            0.0f, new float[]{2.0f, 2.0f}, 0.0f);

    /** The default grid line paint. */
    public static final Paint DEFAULT_GRIDLINE_PAINT = Color.gray;

    /** The resourceBundle for the localization. */
    protected static ResourceBundle localizationResources
            = ResourceBundleWrapper.getBundle(
                    "org.jfree.chart.plot.LocalizationBundle");

    /** The angles that are marked with gridlines. */
    private List angleTicks;

    /** The range axis (used for the y-values). */
    private ObjectList axes;

    /** The axis locations. */
    private ObjectList axisLocations;

    /** Storage for the datasets. */
    private ObjectList datasets;

    /** Storage for the renderers. */
    private ObjectList renderers;

    /**
     * The tick unit that controls the spacing between the angular grid lines.
     *
     * @since 1.0.10
     */
    private TickUnit angleTickUnit;

    /**
     * An offset for the angles, to start with 0 degrees at north, east, south
     * or west.
     *
     * @since 1.0.14
     */
    private double angleOffset;

    /**
     * A flag indicating if the angles increase counterclockwise or clockwise.
     *
     * @since 1.0.14
     */
    private boolean counterClockwise;

    /** A flag that controls whether or not the angle labels are visible. */
    private boolean angleLabelsVisible = true;

    /** The font used to display the angle labels - never null. */
    private Font angleLabelFont = new Font("SansSerif", Font.PLAIN, 12);

    /** The paint used to display the angle labels. */
    private transient Paint angleLabelPaint = Color.black;

    /** A flag that controls whether the angular grid-lines are visible. */
    private boolean angleGridlinesVisible;

    /** The stroke used to draw the angular grid-lines. */
    private transient Stroke angleGridlineStroke;

    /** The paint used to draw the angular grid-lines. */
    private transient Paint angleGridlinePaint;

    /** A flag that controls whether the radius grid-lines are visible. */
    private boolean radiusGridlinesVisible;

    /** The stroke used to draw the radius grid-lines. */
    private transient Stroke radiusGridlineStroke;

    /** The paint used to draw the radius grid-lines. */
    private transient Paint radiusGridlinePaint;

    /**
     * A flag that controls whether the radial minor grid-lines are visible.
     * @since 1.0.15
     */
    private boolean radiusMinorGridlinesVisible;

    /** The annotations for the plot. */
    private List cornerTextItems = new ArrayList();

    /**
     * The actual margin in pixels.
     *
     * @since 1.0.14
     */
    private int margin;

    /**
     * An optional collection of legend items that can be returned by the
     * getLegendItems() method.
     */
    private LegendItemCollection fixedLegendItems;

    /**
     * Storage for the mapping between datasets/renderers and range axes.  The
     * keys in the map are Integer objects, corresponding to the dataset
     * index.  The values in the map are List objects containing Integer
     * objects (corresponding to the axis indices).  If the map contains no
     * entry for a dataset, it is assumed to map to the primary domain axis
     * (index = 0).
     */
    private Map datasetToAxesMap;

    /**
     * Default constructor.
     */
    public PolarPlot() {
        this(null, null, null);
    }

   /**
     * Creates a new plot.
     *
     * @param dataset  the dataset (<code>null</code> permitted).
     * @param radiusAxis  the radius axis (<code>null</code> permitted).
     * @param renderer  the renderer (<code>null</code> permitted).
     */
    public PolarPlot(XYDataset dataset, ValueAxis radiusAxis,
                PolarItemRenderer renderer) {

        super();

        this.datasets = new ObjectList();
        this.datasets.set(0, dataset);
        if (dataset != null) {
            dataset.addChangeListener(this);
        }
        this.angleTickUnit = new NumberTickUnit(DEFAULT_ANGLE_TICK_UNIT_SIZE);

        this.axes = new ObjectList();
        this.datasetToAxesMap = new TreeMap();
        this.axes.set(0, radiusAxis);
        if (radiusAxis != null) {
            radiusAxis.setPlot(this);
            radiusAxis.addChangeListener(this);
        }

        // define the default locations for up to 8 axes...
        this.axisLocations = new ObjectList();
        this.axisLocations.set(0, PolarAxisLocation.EAST_ABOVE);
        this.axisLocations.set(1, PolarAxisLocation.NORTH_LEFT);
        this.axisLocations.set(2, PolarAxisLocation.WEST_BELOW);
        this.axisLocations.set(3, PolarAxisLocation.SOUTH_RIGHT);
        this.axisLocations.set(4, PolarAxisLocation.EAST_BELOW);
        this.axisLocations.set(5, PolarAxisLocation.NORTH_RIGHT);
        this.axisLocations.set(6, PolarAxisLocation.WEST_ABOVE);
        this.axisLocations.set(7, PolarAxisLocation.SOUTH_LEFT);

        this.renderers = new ObjectList();
        this.renderers.set(0, renderer);
        if (renderer != null) {
            renderer.setPlot(this);
            renderer.addChangeListener(this);
        }

        this.angleOffset = DEFAULT_ANGLE_OFFSET;
        this.counterClockwise = false;
        this.angleGridlinesVisible = true;
        this.angleGridlineStroke = DEFAULT_GRIDLINE_STROKE;
        this.angleGridlinePaint = DEFAULT_GRIDLINE_PAINT;

        this.radiusGridlinesVisible = true;
        this.radiusMinorGridlinesVisible = true;
        this.radiusGridlineStroke = DEFAULT_GRIDLINE_STROKE;
        this.radiusGridlinePaint = DEFAULT_GRIDLINE_PAINT;
        this.margin = DEFAULT_MARGIN;
    }

    /**
     * Copy constructor.
     *
     * @param source  the plot to copy (must not be {@code null}).
     */
    public PolarPlot(PolarPlot source) {
        super(source);
        // Primitive and immutable fields
        this.angleTickUnit = source.angleTickUnit;
        this.angleOffset = source.angleOffset;
        this.counterClockwise = source.counterClockwise;
        this.angleLabelsVisible = source.angleLabelsVisible;
        this.angleLabelFont = source.angleLabelFont;
        this.angleLabelPaint = source.angleLabelPaint;
        this.angleGridlinesVisible = source.angleGridlinesVisible;
        this.angleGridlineStroke = source.angleGridlineStroke;
        this.angleGridlinePaint = source.angleGridlinePaint;
        this.radiusGridlinesVisible = source.radiusGridlinesVisible;
        this.radiusMinorGridlinesVisible = source.radiusMinorGridlinesVisible;
        this.radiusGridlineStroke = source.radiusGridlineStroke;
        this.radiusGridlinePaint = source.radiusGridlinePaint;
        this.margin = source.margin;
        this.fixedLegendItems = source.fixedLegendItems;
        this.datasetToAxesMap = new TreeMap();
        // Deep copy of axes
        this.axes = (ObjectList) ObjectUtilities.clone(source.axes);
        for (int i = 0; i < this.axes.size(); i++) {
            ValueAxis axis = (ValueAxis) this.axes.get(i);
            if (axis != null) {
                try {
                    ValueAxis clonedAxis = (ValueAxis) axis.clone();
                    this.axes.set(i, clonedAxis);
                    clonedAxis.setPlot(this);
                    clonedAxis.addChangeListener(this);
                } catch (CloneNotSupportedException e) {
                    // Should not happen as we are cloning a known axis type
                    throw new RuntimeException(e);
                }
            }
        }
        // Datasets are not cloned; listeners are re‑registered
        this.datasets = (ObjectList) ObjectUtilities.clone(source.datasets);
        for (int i = 0; i < this.datasets.size(); i++) {
            XYDataset d = (XYDataset) this.datasets.get(i);
            if (d != null) {
                d.addChangeListener(this);
            }
        }
        // Renderers: clone if they implement PublicCloneable
        this.renderers = (ObjectList) ObjectUtilities.clone(source.renderers);
        for (int i = 0; i < this.renderers.size(); i++) {
            PolarItemRenderer r = (PolarItemRenderer) this.renderers.get(i);
            if (r instanceof PublicCloneable) {
                PolarItemRenderer cloned = (PolarItemRenderer) ((PublicCloneable) r).clone();
                this.renderers.set(i, cloned);
                cloned.setPlot(this);
                cloned.addChangeListener(this);
            } else if (r != null) {
                // retain original reference but re‑register listener
                r.addChangeListener(this);
            }
        }
        // Axis locations
        this.axisLocations = (ObjectList) ObjectUtilities.clone(source.axisLocations);
        // Corner text items
        this.cornerTextItems = new ArrayList(source.cornerTextItems);
        // Dataset‑to‑axis mapping (deep copy of the lists)
        for (Object key : source.datasetToAxesMap.keySet()) {
            List srcList = (List) source.datasetToAxesMap.get(key);
            this.datasetToAxesMap.put(key, new ArrayList(srcList));
        }
    }

    /**
     * Returns a copy of this plot.
     *
     * @return a new {@code PolarPlot} instance that is a copy of this plot.
     */
    public PolarPlot copy() {
        return new PolarPlot(this);
    }

    // -------------------------------------------------------------------------
    // The remainder of the class is unchanged apart from the removal of the
    // original {@code clone()} method.
    // -------------------------------------------------------------------------

    /**
     * Returns the plot type as a string.
     *
     * @return A short string describing the type of plot.
     */
    @Override
    public String getPlotType() {
       return PolarPlot.localizationResources.getString("Polar_Plot");
    }

    public ValueAxis getAxis() {
        return getAxis(0);
    }

    public ValueAxis getAxis(int index) {
        ValueAxis result = null;
        if (index < this.axes.size()) {
            result = (ValueAxis) this.axes.get(index);
        }
        return result;
    }

    public void setAxis(ValueAxis axis) {
        setAxis(0, axis);
    }

    public void setAxis(int index, ValueAxis axis) {
        setAxis(index, axis, true);
    }

    public void setAxis(int index, ValueAxis axis, boolean notify) {
        ValueAxis existing = getAxis(index);
        if (existing != null) {
            existing.removeChangeListener(this);
        }
        if (axis != null) {
            axis.setPlot(this);
        }
        this.axes.set(index, axis);
        if (axis != null) {
            axis.configure();
            axis.addChangeListener(this);
        }
        if (notify) {
            fireChangeEvent();
        }
    }

    public PolarAxisLocation getAxisLocation() {
        return getAxisLocation(0);
    }

    public PolarAxisLocation getAxisLocation(int index) {
        PolarAxisLocation result = null;
        if (index < this.axisLocations.size()) {
            result = (PolarAxisLocation) this.axisLocations.get(index);
        }
        return result;
    }

    public void setAxisLocation(PolarAxisLocation location) {
        setAxisLocation(0, location, true);
    }

    public void setAxisLocation(PolarAxisLocation location, boolean notify) {
        setAxisLocation(0, location, notify);
    }

    public void setAxisLocation(int index, PolarAxisLocation location) {
        setAxisLocation(index, location, true);
    }

    public void setAxisLocation(int index, PolarAxisLocation location,
            boolean notify) {
        ParamChecks.nullNotPermitted(location, "location");
        this.axisLocations.set(index, location);
        if (notify) {
            fireChangeEvent();
        }
    }

    public int getAxisCount() {
        return this.axes.size();
    }

    public XYDataset getDataset() {
        return getDataset(0);
    }

    public XYDataset getDataset(int index) {
        XYDataset result = null;
        if (index < this.datasets.size()) {
            result = (XYDataset) this.datasets.get(index);
        }
        return result;
    }

    public void setDataset(XYDataset dataset) {
        setDataset(0, dataset);
    }

    public void setDataset(int index, XYDataset dataset) {
        XYDataset existing = getDataset(index);
        if (existing != null) {
            existing.removeChangeListener(this);
        }
        this.datasets.set(index, dataset);
        if (dataset != null) {
            dataset.addChangeListener(this);
        }

        DatasetChangeEvent event = new DatasetChangeEvent(this, dataset);
        datasetChanged(event);
    }

    public int getDatasetCount() {
        return this.datasets.size();
    }

    public int indexOf(XYDataset dataset) {
        int result = -1;
        for (int i = 0; i < this.datasets.size(); i++) {
            if (dataset == this.datasets.get(i)) {
                result = i;
                break;
            }
        }
        return result;
    }

    public PolarItemRenderer getRenderer() {
        return getRenderer(0);
    }

    public PolarItemRenderer getRenderer(int index) {
        PolarItemRenderer result = null;
        if (index < this.renderers.size()) {
            result = (PolarItemRenderer) this.renderers.get(index);
        }
        return result;
    }

    public void setRenderer(PolarItemRenderer renderer) {
        setRenderer(0, renderer);
    }

    public void setRenderer(int index, PolarItemRenderer renderer) {
        setRenderer(index, renderer, true);
    }

    public void setRenderer(int index, PolarItemRenderer renderer,
                            boolean notify) {
        PolarItemRenderer existing = getRenderer(index);
        if (existing != null) {
            existing.removeChangeListener(this);
        }
        this.renderers.set(index, renderer);
        if (renderer != null) {
            renderer.setPlot(this);
            renderer.addChangeListener(this);
        }
        if (notify) {
            fireChangeEvent();
        }
    }

    public TickUnit getAngleTickUnit() {
        return this.angleTickUnit;
    }

    public void setAngleTickUnit(TickUnit unit) {
        ParamChecks.nullNotPermitted(unit, "unit");
        this.angleTickUnit = unit;
        fireChangeEvent();
    }

    public double getAngleOffset() {
        return this.angleOffset;
    }

    public void setAngleOffset(double offset) {
        this.angleOffset = offset;
        fireChangeEvent();
    }

    public boolean isCounterClockwise() {
        return this.counterClockwise;
    }

    public void setCounterClockwise(boolean counterClockwise)
    {
        this.counterClockwise = counterClockwise;
    }

    public boolean isAngleLabelsVisible() {
        return this.angleLabelsVisible;
    }

    public void setAngleLabelsVisible(boolean visible) {
        if (this.angleLabelsVisible != visible) {
            this.angleLabelsVisible = visible;
            fireChangeEvent();
        }
    }

    public Font getAngleLabelFont() {
        return this.angleLabelFont;
    }

    public void setAngleLabelFont(Font font) {
        ParamChecks.nullNotPermitted(font, "font");
        this.angleLabelFont = font;
        fireChangeEvent();
    }

    public Paint getAngleLabelPaint() {
        return this.angleLabelPaint;
    }

    public void setAngleLabelPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.angleLabelPaint = paint;
        fireChangeEvent();
    }

    public boolean isAngleGridlinesVisible() {
        return this.angleGridlinesVisible;
    }

    public void setAngleGridlinesVisible(boolean visible) {
        if (this.angleGridlinesVisible != visible) {
            this.angleGridlinesVisible = visible;
            fireChangeEvent();
        }
    }

    public Stroke getAngleGridlineStroke() {
        return this.angleGridlineStroke;
    }

    public void setAngleGridlineStroke(Stroke stroke) {
        this.angleGridlineStroke = stroke;
        fireChangeEvent();
    }

    public Paint getAngleGridlinePaint() {
        return this.angleGridlinePaint;
    }

    public void setAngleGridlinePaint(Paint paint) {
        this.angleGridlinePaint = paint;
        fireChangeEvent();
    }

    public boolean isRadiusGridlinesVisible() {
        return this.radiusGridlinesVisible;
    }

    public void setRadiusGridlinesVisible(boolean visible) {
        if (this.radiusGridlinesVisible != visible) {
            this.radiusGridlinesVisible = visible;
            fireChangeEvent();
        }
    }

    public Stroke getRadiusGridlineStroke() {
        return this.radiusGridlineStroke;
    }

    public void setRadiusGridlineStroke(Stroke stroke) {
        this.radiusGridlineStroke = stroke;
        fireChangeEvent();
    }

    public Paint getRadiusGridlinePaint() {
        return this.radiusGridlinePaint;
    }

    public void setRadiusGridlinePaint(Paint paint) {
        this.radiusGridlinePaint = paint;
        fireChangeEvent();
    }

    public boolean isRadiusMinorGridlinesVisible() {
        return this.radiusMinorGridlinesVisible;
    }

    public void setRadiusMinorGridlinesVisible(boolean flag) {
        this.radiusMinorGridlinesVisible = flag;
        fireChangeEvent();
    }

    public int getMargin() {
        return this.margin;
    }

    public void setMargin(int margin) {
        this.margin = margin;
        fireChangeEvent();
    }

    public LegendItemCollection getFixedLegendItems() {
        return this.fixedLegendItems;
    }

    public void setFixedLegendItems(LegendItemCollection items) {
        this.fixedLegendItems = items;
        fireChangeEvent();
    }

    public void addCornerTextItem(String text) {
        ParamChecks.nullNotPermitted(text, "text");
        this.cornerTextItems.add(text);
        fireChangeEvent();
    }

    public void removeCornerTextItem(String text) {
        boolean removed = this.cornerTextItems.remove(text);
        if (removed) {
            fireChangeEvent();
        }
    }

    public void clearCornerTextItems() {
        if (this.cornerTextItems.size() > 0) {
            this.cornerTextItems.clear();
            fireChangeEvent();
        }
    }

    protected List refreshAngleTicks() {
        List ticks = new ArrayList();
        for (double currentTickVal = 0.0; currentTickVal < 360.0;
                currentTickVal += this.angleTickUnit.getSize()) {

            TextAnchor ta = calculateTextAnchor(currentTickVal);
            NumberTick tick = new NumberTick(new Double(currentTickVal),
                this.angleTickUnit.valueToString(currentTickVal),
                ta, TextAnchor.CENTER, 0.0);
            ticks.add(tick);
        }
        return ticks;
    }

    protected TextAnchor calculateTextAnchor(double angleDegrees) {
        TextAnchor ta = TextAnchor.CENTER;

        double offset = this.angleOffset;
        while (offset < 0.0) {
            offset += 360.0;
        }
        double normalizedAngle = (((this.counterClockwise ? -1 : 1)
                * angleDegrees) + offset) % 360;
        while (this.counterClockwise && (normalizedAngle < 0.0)) {
            normalizedAngle += 360.0;
        }

        if (normalizedAngle == 0.0) {
            ta = TextAnchor.CENTER_LEFT;
        }
        else if (normalizedAngle > 0.0 && normalizedAngle < 90.0) {
            ta = TextAnchor.TOP_LEFT;
        }
        else if (normalizedAngle == 90.0) {
            ta = TextAnchor.TOP_CENTER;
        }
        else if (normalizedAngle > 90.0 && normalizedAngle < 180.0) {
            ta = TextAnchor.TOP_RIGHT;
        }
        else if (normalizedAngle == 180) {
            ta = TextAnchor.CENTER_RIGHT;
        }
        else if (normalizedAngle > 180.0 && normalizedAngle < 270.0) {
            ta = TextAnchor.BOTTOM_RIGHT;
        }
        else if (normalizedAngle == 270) {
            ta = TextAnchor.BOTTOM_CENTER;
        }
        else if (normalizedAngle > 270.0 && normalizedAngle < 360.0) {
            ta = TextAnchor.BOTTOM_LEFT;
        }
        return ta;
    }

    public void mapDatasetToAxis(int index, int axisIndex) {
        List axisIndices = new java.util.ArrayList(1);
        axisIndices.add(new Integer(axisIndex));
        mapDatasetToAxes(index, axisIndices);
    }

    public void mapDatasetToAxes(int index, List axisIndices) {
        if (index < 0) {
            throw new IllegalArgumentException("Requires 'index' >= 0.");
        }
        checkAxisIndices(axisIndices);
        Integer key = new Integer(index);
        this.datasetToAxesMap.put(key, new ArrayList(axisIndices));
        datasetChanged(new DatasetChangeEvent(this, getDataset(index)));
    }

    private void checkAxisIndices(List indices) {
        if (indices == null) {
            return;
        }
        int count = indices.size();
        if (count == 0) {
            throw new IllegalArgumentException("Empty list not permitted.");
        }
        HashSet set = new HashSet();
        for (int i = 0; i < count; i++) {
            Object item = indices.get(i);
            if (!(item instanceof Integer)) {
                throw new IllegalArgumentException(
                        "Indices must be Integer instances.");
            }
            if (set.contains(item)) {
                throw new IllegalArgumentException("Indices must be unique.");
            }
            set.add(item);
        }
    }

    public ValueAxis getAxisForDataset(int index) {
        ValueAxis valueAxis;
        List axisIndices = (List) this.datasetToAxesMap.get(
                new Integer(index));
        if (axisIndices != null) {
            Integer axisIndex = (Integer) axisIndices.get(0);
            valueAxis = getAxis(axisIndex.intValue());
        }
        else {
            valueAxis = getAxis(0);
        }
        return valueAxis;
    }

    public int getAxisIndex(ValueAxis axis) {
        int result = this.axes.indexOf(axis);
        if (result < 0) {
            Plot parent = getParent();
            if (parent instanceof PolarPlot) {
                PolarPlot p = (PolarPlot) parent;
                result = p.getAxisIndex(axis);
            }
        }
        return result;
    }

    public int getIndexOf(PolarItemRenderer renderer) {
        return this.renderers.indexOf(renderer);
    }

    @Override
    public void draw(Graphics2D g2, Rectangle2D area, Point2D anchor,
            PlotState parentState, PlotRenderingInfo info) {

        boolean b1 = (area.getWidth() <= MINIMUM_WIDTH_TO_DRAW);
        boolean b2 = (area.getHeight() <= MINIMUM_HEIGHT_TO_DRAW);
        if (b1 || b2) {
            return;
        }

        if (info != null) {
            info.setPlotArea(area);
        }

        RectangleInsets insets = getInsets();
        insets.trim(area);

        Rectangle2D dataArea = area;
        if (info != null) {
            info.setDataArea(dataArea);
        }

        drawBackground(g2, dataArea);
        int axisCount = this.axes.size();
        AxisState state = null;
        for (int i = 0; i < axisCount; i++) {
            ValueAxis axis = getAxis(i);
            if (axis != null) {
                PolarAxisLocation location
                        = (PolarAxisLocation) this.axisLocations.get(i);
                AxisState s = this.drawAxis(axis, location, g2, dataArea);
                if (i == 0) {
                    state = s;
                }
            }
        }

        Shape originalClip = g2.getClip();
        Composite originalComposite = g2.getComposite();

        g2.clip(dataArea);
        g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER,
                getForegroundAlpha()));
        this.angleTicks = refreshAngleTicks();
        drawGridlines(g2, dataArea, this.angleTicks, state.getTicks());
        render(g2, dataArea, info);
        g2.setClip(originalClip);
        g2.setComposite(originalComposite);
        drawOutline(g2, dataArea);
        drawCornerTextItems(g2, dataArea);
    }

    protected void drawCornerTextItems(Graphics2D g2, Rectangle2D area) {
        if (this.cornerTextItems.isEmpty()) {
            return;
        }

        g2.setColor(Color.black);
        double width = 0.0;
        double height = 0.0;
        for (Iterator it = this.cornerTextItems.iterator(); it.hasNext();) {
            String msg = (String) it.next();
            FontMetrics fm = g2.getFontMetrics();
            Rectangle2D bounds = TextUtilities.getTextBounds(msg, g2, fm);
            width = Math.max(width, bounds.getWidth());
            height += bounds.getHeight();
        }

        double xadj = ANNOTATION_MARGIN * 2.0;
        double yadj = ANNOTATION_MARGIN;
        width += xadj;
        height += yadj;

        double x = area.getMaxX() - width;
        double y = area.getMaxY() - height;
        g2.drawRect((int) x, (int) y, (int) width, (int) height);
        x += ANNOTATION_MARGIN;
        for (Iterator it = this.cornerTextItems.iterator(); it.hasNext();) {
            String msg = (String) it.next();
            Rectangle2D bounds = TextUtilities.getTextBounds(msg, g2,
                    g2.getFontMetrics());
            y += bounds.getHeight();
            g2.drawString(msg, (int) x, (int) y);
        }
    }

    protected AxisState drawAxis(ValueAxis axis, PolarAxisLocation location,
            Graphics2D g2, Rectangle2D plotArea) {

        double centerX = plotArea.getCenterX();
        double centerY = plotArea.getCenterY();
        double r = Math.min(plotArea.getWidth() / 2.0,
                plotArea.getHeight() / 2.0) - this.margin;
        double x = centerX - r;
        double y = centerY - r;

        Rectangle2D dataArea = null;
        AxisState result = null;
        if (location == PolarAxisLocation.NORTH_RIGHT) {
            dataArea = new Rectangle2D.Double(x, y, r, r);
            result = axis.draw(g2, centerX, plotArea, dataArea,
                    RectangleEdge.RIGHT, null);
        }
        else if (location == PolarAxisLocation.NORTH_LEFT) {
            dataArea = new Rectangle2D.Double(centerX, y, r, r);
            result = axis.draw(g2, centerX, plotArea, dataArea,
                    RectangleEdge.LEFT, null);
        }
        else if (location == PolarAxisLocation.SOUTH_LEFT) {
            dataArea = new Rectangle2D.Double(centerX, centerY, r, r);
            result = axis.draw(g2, centerX, plotArea, dataArea,
                    RectangleEdge.LEFT, null);
        }
        else if (location == PolarAxisLocation.SOUTH_RIGHT) {
            dataArea = new Rectangle2D.Double(x, centerY, r, r);
            result = axis.draw(g2, centerX, plotArea, dataArea,
                    RectangleEdge.RIGHT, null);
        }
        else if (location == PolarAxisLocation.EAST_ABOVE) {
            dataArea = new Rectangle2D.Double(centerX, centerY, r, r);
            result = axis.draw(g2, centerY, plotArea, dataArea,
                    RectangleEdge.TOP, null);
        }
        else if (location == PolarAxisLocation.EAST_BELOW) {
            dataArea = new Rectangle2D.Double(centerX, y, r, r);
            result = axis.draw(g2, centerY, plotArea, dataArea,
                    RectangleEdge.BOTTOM, null);
        }
        else if (location == PolarAxisLocation.WEST_ABOVE) {
            dataArea = new Rectangle2D.Double(x, centerY, r, r);
            result = axis.draw(g2, centerY, plotArea, dataArea,
                    RectangleEdge.TOP, null);
        }
        else if (location == PolarAxisLocation.WEST_BELOW) {
            dataArea = new Rectangle2D.Double(x, y, r, r);
            result = axis.draw(g2, centerY, plotArea, dataArea,
                    RectangleEdge.BOTTOM, null);
        }

        return result;
    }

    protected void render(Graphics2D g2, Rectangle2D dataArea,
            PlotRenderingInfo info) {

        boolean hasData = false;
        int datasetCount = this.datasets.size();
        for (int i = datasetCount - 1; i >= 0; i--) {
            XYDataset dataset = getDataset(i);
            if (dataset == null) {
                continue;
            }
            PolarItemRenderer renderer = getRenderer(i);
            if (renderer == null) {
                continue;
            }
            if (!DatasetUtilities.isEmptyOrNull(dataset)) {
                hasData = true;
                int seriesCount = dataset.getSeriesCount();
                for (int series = 0; series < seriesCount; series++) {
                    renderer.drawSeries(g2, dataArea, info, this, dataset,
                            series);
                }
            }
        }
        if (!hasData) {
            drawNoDataMessage(g2, dataArea);
        }
    }

    protected void drawGridlines(Graphics2D g2, Rectangle2D dataArea,
                                 List angularTicks, List radialTicks) {

        PolarItemRenderer renderer = getRenderer();
        if (renderer == null) {
            return;
        }

        if (isAngleGridlinesVisible()) {
            Stroke gridStroke = getAngleGridlineStroke();
            Paint gridPaint = getAngleGridlinePaint();
            if ((gridStroke != null) && (gridPaint != null)) {
                renderer.drawAngularGridLines(g2, this, angularTicks,
                        dataArea);
            }
        }

        if (isRadiusGridlinesVisible()) {
            Stroke gridStroke = getRadiusGridlineStroke();
            Paint gridPaint = getRadiusGridlinePaint();
            if ((gridStroke != null) && (gridPaint != null)) {
                List ticks = buildRadialTicks(radialTicks);
                renderer.drawRadialGridLines(g2, this, getAxis(),
                        ticks, dataArea);
            }
        }
    }

    protected List buildRadialTicks(List allTicks)
    {
        List ticks = new ArrayList();
        Iterator it = allTicks.iterator();
        while (it.hasNext()) {
            ValueTick tick = (ValueTick) it.next();
            if (isRadiusMinorGridlinesVisible() ||
                    TickType.MAJOR.equals(tick.getTickType())) {
                ticks.add(tick);
            }
        }
        return ticks;
    }

    @Override
    public void zoom(double percent) {
        for (int axisIdx = 0; axisIdx < getAxisCount(); axisIdx++) {
            final ValueAxis axis = getAxis(axisIdx);
            if (axis != null) {
                if (percent > 0.0) {
                    double radius = axis.getUpperBound();
                    double scaledRadius = radius * percent;
                    axis.setUpperBound(scaledRadius);
                    axis.setAutoRange(false);
                }
                else {
                    axis.setAutoRange(true);
                }
            }
        }
    }

    private List getDatasetsMappedToAxis(Integer axisIndex) {
        ParamChecks.nullNotPermitted(axisIndex, "axisIndex");
        List result = new ArrayList();
        for (int i = 0; i < this.datasets.size(); i++) {
            List mappedAxes = (List) this.datasetToAxesMap.get(new Integer(i));
            if (mappedAxes == null) {
                if (axisIndex.equals(ZERO)) {
                    result.add(this.datasets.get(i));
                }
            }
            else {
                if (mappedAxes.contains(axisIndex)) {
                    result.add(this.datasets.get(i));
                }
            }
        }
        return result;
    }

    @Override
    public Range getDataRange(ValueAxis axis) {
        Range result = null;
        int axisIdx = getAxisIndex(axis);
        List mappedDatasets = new ArrayList();

        if (axisIdx >= 0) {
            mappedDatasets = getDatasetsMappedToAxis(new Integer(axisIdx));
        }

        Iterator iterator = mappedDatasets.iterator();
        int datasetIdx = -1;
        while (iterator.hasNext()) {
            datasetIdx++;
            XYDataset d = (XYDataset) iterator.next();
            if (d != null) {
                result = Range.combine(result,
                        DatasetUtilities.findRangeBounds(d));
            }
        }

        return result;
    }

    @Override
    public void datasetChanged(DatasetChangeEvent event) {
        for (int i = 0; i < this.axes.size(); i++) {
            final ValueAxis axis = (ValueAxis) this.axes.get(i);
            if (axis != null) {
                axis.configure();
            }
        }
        if (getParent() != null) {
            getParent().datasetChanged(event);
        }
        else {
            super.datasetChanged(event);
        }
    }

    @Override
    public void rendererChanged(RendererChangeEvent event) {
        fireChangeEvent();
    }

    @Override
    public LegendItemCollection getLegendItems() {
        if (this.fixedLegendItems != null) {
            return this.fixedLegendItems;
        }
        LegendItemCollection result = new LegendItemCollection();
        int count = this.datasets.size();
        for (int datasetIndex = 0; datasetIndex < count; datasetIndex++) {
            XYDataset dataset = getDataset(datasetIndex);
            PolarItemRenderer renderer = getRenderer(datasetIndex);
            if (dataset != null && renderer != null) {
                int seriesCount = dataset.getSeriesCount();
                for (int i = 0; i < seriesCount; i++) {
                    LegendItem item = renderer.getLegendItem(i);
                    result.add(item);
                }
            }
        }
        return result;
    }

    @Override
    public boolean equals(Object obj) {
        if (obj == this) {
            return true;
        }
        if (!(obj instanceof PolarPlot)) {
            return false;
        }
        PolarPlot that = (PolarPlot) obj;
        if (!this.axes.equals(that.axes)) {
            return false;
        }
        if (!this.axisLocations.equals(that.axisLocations)) {
            return false;
        }
        if (!this.renderers.equals(that.renderers)) {
            return false;
        }
        if (!this.angleTickUnit.equals(that.angleTickUnit)) {
            return false;
        }
        if (this.angleGridlinesVisible != that.angleGridlinesVisible) {
            return false;
        }
        if (this.angleOffset != that.angleOffset)
        {
            return false;
        }
        if (this.counterClockwise != that.counterClockwise)
        {
            return false;
        }
        if (this.angleLabelsVisible != that.angleLabelsVisible) {
            return false;
        }
        if (!this.angleLabelFont.equals(that.angleLabelFont)) {
            return false;
        }
        if (!PaintUtilities.equal(this.angleLabelPaint, that.angleLabelPaint)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.angleGridlineStroke,
                that.angleGridlineStroke)) {
            return false;
        }
        if (!PaintUtilities.equal(
            this.angleGridlinePaint, that.angleGridlinePaint
        )) {
            return false;
        }
        if (this.radiusGridlinesVisible != that.radiusGridlinesVisible) {
            return false;
        }
        if (!ObjectUtilities.equal(this.radiusGridlineStroke,
                that.radiusGridlineStroke)) {
            return false;
        }
        if (!PaintUtilities.equal(this.radiusGridlinePaint,
                that.radiusGridlinePaint)) {
            return false;
        }
        if (this.radiusMinorGridlinesVisible !=
            that.radiusMinorGridlinesVisible) {
            return false;
        }
        if (!this.cornerTextItems.equals(that.cornerTextItems)) {
            return false;
        }
        if (this.margin != that.margin) {
            return false;
        }
        if (!ObjectUtilities.equal(this.fixedLegendItems,
                that.fixedLegendItems)) {
            return false;
        }
        return super.equals(obj);
    }

    private void writeObject(ObjectOutputStream stream) throws IOException {
        stream.defaultWriteObject();
        SerialUtilities.writeStroke(this.angleGridlineStroke, stream);
        SerialUtilities.writePaint(this.angleGridlinePaint, stream);
        SerialUtilities.writeStroke(this.radiusGridlineStroke, stream);
        SerialUtilities.writePaint(this.radiusGridlinePaint, stream);
        SerialUtilities.writePaint(this.angleLabelPaint, stream);
    }

    private void readObject(ObjectInputStream stream)
        throws IOException, ClassNotFoundException {

        stream.defaultReadObject();
        this.angleGridlineStroke = SerialUtilities.readStroke(stream);
        this.angleGridlinePaint = SerialUtilities.readPaint(stream);
        this.radiusGridlineStroke = SerialUtilities.readStroke(stream);
        this.radiusGridlinePaint = SerialUtilities.readPaint(stream);
        this.angleLabelPaint = SerialUtilities.readPaint(stream);

        int rangeAxisCount = this.axes.size();
        for (int i = 0; i < rangeAxisCount; i++) {
            Axis axis = (Axis) this.axes.get(i);
            if (axis != null) {
                axis.setPlot(this);
                axis.addChangeListener(this);
            }
        }
        int datasetCount = this.datasets.size();
        for (int i = 0; i < datasetCount; i++) {
            Dataset dataset = (Dataset) this.datasets.get(i);
            if (dataset != null) {
                dataset.addChangeListener(this);
            }
        }
        int rendererCount = this.renderers.size();
        for (int i = 0; i < rendererCount; i++) {
            PolarItemRenderer renderer = (PolarItemRenderer) this.renderers.get(i);
            if (renderer != null) {
                renderer.addChangeListener(this);
            }
        }
    }

    @Override
    public void zoomDomainAxes(double factor, PlotRenderingInfo state,
                               Point2D source) {
        // do nothing
    }

    @Override
    public void zoomDomainAxes(double factor, PlotRenderingInfo state,
                               Point2D source, boolean useAnchor) {
        // do nothing
    }

    @Override
    public void zoomDomainAxes(double lowerPercent, double upperPercent,
                               PlotRenderingInfo state, Point2D source) {
        // do nothing
    }

    @Override
    public void zoomRangeAxes(double factor, PlotRenderingInfo state,
                              Point2D source) {
        zoom(factor);
    }

    @Override
    public void zoomRangeAxes(double factor, PlotRenderingInfo info,
                              Point2D source, boolean useAnchor) {
        final double sourceX = source.getX();

        for (int axisIdx = 0; axisIdx < getAxisCount(); axisIdx++) {
            final ValueAxis axis = getAxis(axisIdx);
            if (axis != null) {
                if (useAnchor) {
                    double anchorX = axis.java2DToValue(sourceX,
                            info.getDataArea(), RectangleEdge.BOTTOM);
                    axis.resizeRange(factor, anchorX);
                }
                else {
                    axis.resizeRange(factor);
                }
            }
        }
    }

    @Override
    public void zoomRangeAxes(double lowerPercent, double upperPercent,
                              PlotRenderingInfo state, Point2D source) {
        zoom((upperPercent + lowerPercent) / 2.0);
    }

    @Override
    public boolean isDomainZoomable() {
        return false;
    }

    @Override
    public boolean isRangeZoomable() {
        return true;
    }

    @Override
    public PlotOrientation getOrientation() {
        return PlotOrientation.HORIZONTAL;
    }

    public Point translateToJava2D(double angleDegrees, double radius,
            ValueAxis axis, Rectangle2D dataArea) {

        if (counterClockwise) {
            angleDegrees = -angleDegrees;
        }
        double radians = Math.toRadians(angleDegrees + this.angleOffset);

        double minx = dataArea.getMinX() + this.margin;
        double maxx = dataArea.getMaxX() - this.margin;
        double miny = dataArea.getMinY() + this.margin;
        double maxy = dataArea.getMaxY() - this.margin;

        double halfWidth = (maxx - minx) / 2.0;
        double halfHeight = (maxy - miny) / 2.0;

        double midX = minx + halfWidth;
        double midY = miny + halfHeight;

        double l = Math.min(halfWidth, halfHeight);
        Rectangle2D quadrant = new Rectangle2D.Double(midX, midY, l, l);

        double axisMin = axis.getLowerBound();
        double adjustedRadius = Math.max(radius, axisMin);

        double length = axis.valueToJava2D(adjustedRadius, quadrant, RectangleEdge.BOTTOM) - midX;
        float x = (float) (midX + Math.cos(radians) * length);
        float y = (float) (midY + Math.sin(radians) * length);

        int ix = Math.round(x);
        int iy = Math.round(y);

        return new Point(ix, iy);
    }

    public Point translateValueThetaRadiusToJava2D(double angleDegrees,
            double radius, Rectangle2D dataArea) {

        return translateToJava2D(angleDegrees, radius, getAxis(), dataArea);
    }

    public double getMaxRadius() {
        return getAxis().getUpperBound();
    }

    public int getSeriesCount() {
        int result = 0;
        XYDataset dataset = getDataset(0);
        if (dataset != null) {
            result = dataset.getSeriesCount();
        }
        return result;
    }

    protected AxisState drawAxis(Graphics2D g2, Rectangle2D plotArea,
                                 Rectangle2D dataArea) {
        return getAxis().draw(g2, dataArea.getMinY(), plotArea, dataArea,
                RectangleEdge.TOP, null);
    }

}