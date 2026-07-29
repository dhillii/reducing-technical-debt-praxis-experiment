package org.jfree.chart.plot;

import java.awt.AlphaComposite;
import java.awt.Composite;
import java.awt.Graphics2D;
import java.awt.Paint;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.Stroke;
import java.awt.geom.Ellipse2D;
import java.awt.geom.GeneralPath;
import java.awt.geom.Line2D;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.awt.geom.RectangularShape;
import java.beans.PropertyChangeEvent;
import java.beans.PropertyChangeListener;
import java.io.Serializable;
import java.util.Iterator;
import java.util.List;
import java.util.ResourceBundle;

import org.jfree.chart.ClipPath;
import org.jfree.chart.annotations.XYAnnotation;
import org.jfree.chart.axis.AxisSpace;
import org.jfree.chart.axis.ColorBar;
import org.jfree.chart.axis.NumberAxis;
import org.jfree.chart.axis.ValueAxis;
import org.jfree.chart.entity.ContourEntity;
import org.jfree.chart.entity.EntityCollection;
import org.jfree.chart.event.AxisChangeEvent;
import org.jfree.chart.event.PlotChangeEvent;
import org.jfree.chart.labels.ContourToolTipGenerator;
import org.jfree.chart.labels.StandardContourToolTipGenerator;
import org.jfree.chart.renderer.xy.XYBlockRenderer;
import org.jfree.chart.urls.XYURLGenerator;
import org.jfree.chart.util.ResourceBundleWrapper;
import org.jfree.data.Range;
import org.jfree.data.contour.ContourDataset;
import org.jfree.data.general.DatasetChangeEvent;
import org.jfree.data.general.DatasetUtilities;
import org.jfree.ui.RectangleEdge;
import org.jfree.ui.RectangleInsets;
import org.jfree.util.ObjectUtilities;

/**
 * A class for creating shaded contours.
 *
 * @deprecated This plot is no longer supported, please use {@link XYPlot} with
 *     an {@link XYBlockRenderer}.
 */
public class ContourPlot extends Plot implements ContourValuePlot,
        ValueAxisPlot, PropertyChangeListener, Serializable, Cloneable {

    /** For serialization. */
    private static final long serialVersionUID = 7861072556590502247L;

    /** The default insets. */
    protected static final RectangleInsets DEFAULT_INSETS
            = new RectangleInsets(2.0, 2.0, 100.0, 10.0);

    /** The domain axis (used for the x-values). */
    private ValueAxis domainAxis;

    /** The range axis (used for the y-values). */
    private ValueAxis rangeAxis;

    /** The dataset. */
    private ContourDataset dataset;

    /** The colorbar axis (used for the z-values). */
    private ColorBar colorBar = null;

    /** The color bar location. */
    private RectangleEdge colorBarLocation;

    /** A flag that controls whether or not a domain crosshair is drawn..*/
    private boolean domainCrosshairVisible;

    /** The domain crosshair value. */
    private double domainCrosshairValue;

    /** The pen/brush used to draw the crosshair (if any). */
    private transient Stroke domainCrosshairStroke;

    /** The color used to draw the crosshair (if any). */
    private transient Paint domainCrosshairPaint;

    /**
     * A flag that controls whether or not the crosshair locks onto actual data
     * points.
     */
    private boolean domainCrosshairLockedOnData = true;

    /** A flag that controls whether or not a range crosshair is drawn..*/
    private boolean rangeCrosshairVisible;

    /** The range crosshair value. */
    private double rangeCrosshairValue;

    /** The pen/brush used to draw the crosshair (if any). */
    private transient Stroke rangeCrosshairStroke;

    /** The color used to draw the crosshair (if any). */
    private transient Paint rangeCrosshairPaint;

    /**
     * A flag that controls whether or not the crosshair locks onto actual data
     * points.
     */
    private boolean rangeCrosshairLockedOnData = true;

    /**
     * Defines dataArea rectangle as the ratio formed from dividing height by
     * width (of the dataArea).  Modifies plot area calculations.
     * ratio &gt; 0 will attempt to layout the plot so that the
     * dataArea.height/dataArea.width = ratio.
     * ratio &lt; 0 will attempt to layout the plot so that the
     * dataArea.height/dataArea.width in plot units (not java2D units as when
     * ratio &gt; 0) = -1.*ratio.
     */         //dmo
    private double dataAreaRatio = 0.0;  //zero when the parameter is not set

    /** A list of markers (optional) for the domain axis. */
    private List domainMarkers;

    /** A list of markers (optional) for the range axis. */
    private List rangeMarkers;

    /** A list of annotations (optional) for the plot. */
    private List annotations;

    /** The tool tip generator. */
    private ContourToolTipGenerator toolTipGenerator;

    /** The URL text generator. */
    private XYURLGenerator urlGenerator;

    /**
     * Controls whether data are render as filled rectangles or rendered as
     * points
     */
    private boolean renderAsPoints = false;

    /**
     * Size of points rendered when renderAsPoints = true.  Size is relative to
     * dataArea
     */
    private double ptSizePct = 0.05;

    /** Contains the a ClipPath to "trim" the contours. */
    private transient ClipPath clipPath = null;

    /** Set to Paint to represent missing values. */
    private transient Paint missingPaint = null;

    /** The resourceBundle for the localization. */
    protected static ResourceBundle localizationResources
            = ResourceBundleWrapper.getBundle(
                    "org.jfree.chart.plot.LocalizationBundle");

    /**
     * Creates a new plot with no dataset or axes.
     */
    public ContourPlot() {
        this(null, null, null, null);
    }

    /**
     * Constructs a contour plot with the specified axes (other attributes take
     * default values).
     *
     * @param dataset  The dataset.
     * @param domainAxis  The domain axis.
     * @param rangeAxis  The range axis.
     * @param colorBar  The z-axis axis.
    */
    public ContourPlot(ContourDataset dataset,
                       ValueAxis domainAxis, ValueAxis rangeAxis,
                       ColorBar colorBar) {

        super();

        this.dataset = dataset;
        if (dataset != null) {
            dataset.addChangeListener(this);
        }

        this.domainAxis = domainAxis;
        if (domainAxis != null) {
            domainAxis.setPlot(this);
            domainAxis.addChangeListener(this);
        }

        this.rangeAxis = rangeAxis;
        if (rangeAxis != null) {
            rangeAxis.setPlot(this);
            rangeAxis.addChangeListener(this);
        }

        this.colorBar = colorBar;
        if (colorBar != null) {
            colorBar.getAxis().setPlot(this);
            colorBar.getAxis().addChangeListener(this);
            colorBar.configure(this);
        }
        this.colorBarLocation = RectangleEdge.LEFT;

        this.toolTipGenerator = new StandardContourToolTipGenerator();

    }

    /**
     * Copy constructor for ContourPlot.
     * @param source the source plot to copy from
     */
    private ContourPlot(ContourPlot source) {
        super(source);
        this.dataset = source.dataset;
        this.colorBarLocation = source.colorBarLocation;
        this.domainCrosshairVisible = source.domainCrosshairVisible;
        this.domainCrosshairValue = source.domainCrosshairValue;
        this.domainCrosshairStroke = source.domainCrosshairStroke;
        this.domainCrosshairPaint = source.domainCrosshairPaint;
        this.domainCrosshairLockedOnData = source.domainCrosshairLockedOnData;
        this.rangeCrosshairVisible = source.rangeCrosshairVisible;
        this.rangeCrosshairValue = source.rangeCrosshairValue;
        this.rangeCrosshairStroke = source.rangeCrosshairStroke;
        this.rangeCrosshairPaint = source.rangeCrosshairPaint;
        this.rangeCrosshairLockedOnData = source.rangeCrosshairLockedOnData;
        this.dataAreaRatio = source.dataAreaRatio;
        this.renderAsPoints = source.renderAsPoints;
        this.ptSizePct = source.ptSizePct;
        this.missingPaint = source.missingPaint;
        this.toolTipGenerator = source.toolTipGenerator;
        this.urlGenerator = source.urlGenerator;
    }

    /**
     * Returns the color bar location.
     *
     * @return The color bar location.
     */
    public RectangleEdge getColorBarLocation() {
        return this.colorBarLocation;
    }

    /**
     * Sets the color bar location and sends a {@link PlotChangeEvent} to all
     * registered listeners.
     *
     * @param edge  the location.
     */
    public void setColorBarLocation(RectangleEdge edge) {
        this.colorBarLocation = edge;
        fireChangeEvent();
    }

    /**
     * Returns the primary dataset for the plot.
     *
     * @return The primary dataset (possibly <code>null</code>).
     */
    public ContourDataset getDataset() {
        return this.dataset;
    }

    /**
     * Sets the dataset for the plot, replacing the existing dataset if there
     * is one.
     *
     * @param dataset  the dataset (<code>null</code> permitted).
     */
    public void setDataset(ContourDataset dataset) {

        // if there is an existing dataset, remove the plot from the list of
        // change listeners...
        ContourDataset existing = this.dataset;
        if (existing != null) {
            existing.removeChangeListener(this);
        }

        // set the new dataset, and register the chart as a change listener...
        this.dataset = dataset;
        if (dataset != null) {
            setDatasetGroup(dataset.getGroup());
            dataset.addChangeListener(this);
        }

        // send a dataset change event to self...
        DatasetChangeEvent event = new DatasetChangeEvent(this, dataset);
        datasetChanged(event);

    }

    /**
     * Returns the domain axis for the plot.
     *
     * @return The domain axis.
     */
    public ValueAxis getDomainAxis() {

        ValueAxis result = this.domainAxis;

        return result;

    }

    /**
     * Sets the domain axis for the plot (this must be compatible with the plot
     * type or an exception is thrown).
     *
     * @param axis The new axis.
     */
    public void setDomainAxis(ValueAxis axis) {

        if (isCompatibleDomainAxis(axis)) {

            if (axis != null) {
                axis.setPlot(this);
                axis.addChangeListener(this);
            }

            // plot is likely registered as a listener with the existing axis...
            if (this.domainAxis != null) {
                this.domainAxis.removeChangeListener(this);
            }

            this.domainAxis = axis;
            fireChangeEvent();

        }

    }

    /**
     * Returns the range axis for the plot.
     *
     * @return The range axis.
     */
    public ValueAxis getRangeAxis() {

        ValueAxis result = this.rangeAxis;

        return result;

    }

    /**
     * Sets the range axis for the plot.
     * <P>
     * An exception is thrown if the new axis and the plot are not mutually
     * compatible.
     *
     * @param axis The new axis (null permitted).
     */
    public void setRangeAxis(ValueAxis axis) {

        if (axis != null) {
            axis.setPlot(this);
            axis.addChangeListener(this);
        }

        // plot is likely registered as a listener with the existing axis...
        if (this.rangeAxis != null) {
            this.rangeAxis.removeChangeListener(this);
        }

        this.rangeAxis = axis;
        fireChangeEvent();

    }

    /**
     * Sets the colorbar for the plot.
     *
     * @param axis The new axis (null permitted).
     */
    public void setColorBarAxis(ColorBar axis) {

        this.colorBar = axis;
        fireChangeEvent();

    }

    /**
     * Returns the data area ratio.
     *
     * @return The ratio.
     */
    public double getDataAreaRatio() {
        return this.dataAreaRatio;
    }

    /**
     * Sets the data area ratio.
     *
     * @param ratio  the ratio.
     */
    public void setDataAreaRatio(double ratio) {
        this.dataAreaRatio = ratio;
    }

    /**
     * Adds a marker for the domain axis.
     * <P>
     * Typically a marker will be drawn by the renderer as a line perpendicular
     * to the range axis, however this is entirely up to the renderer.
     *
     * @param marker the marker.
     */
    public void addDomainMarker(Marker marker) {

        if (this.domainMarkers == null) {
            this.domainMarkers = new java.util.ArrayList();
        }
        this.domainMarkers.add(marker);
        fireChangeEvent();

    }

    /**
     * Clears all the domain markers.
     */
    public void clearDomainMarkers() {
        if (this.domainMarkers != null) {
            this.domainMarkers.clear();
            fireChangeEvent();
        }
    }

    /**
     * Adds a marker for the range axis.
     * <P>
     * Typically a marker will be drawn by the renderer as a line perpendicular
     * to the range axis, however this is entirely up to the renderer.
     *
     * @param marker The marker.
     */
    public void addRangeMarker(Marker marker) {

        if (this.rangeMarkers == null) {
            this.rangeMarkers = new java.util.ArrayList();
        }
        this.rangeMarkers.add(marker);
        fireChangeEvent();

    }

    /**
     * Clears all the range markers.
     */
    public void clearRangeMarkers() {
        if (this.rangeMarkers != null) {
            this.rangeMarkers.clear();
            fireChangeEvent();
        }
    }

    /**
     * Adds an annotation to the plot.
     *
     * @param annotation  the annotation.
     */
    public void addAnnotation(XYAnnotation annotation) {

        if (this.annotations == null) {
            this.annotations = new java.util.ArrayList();
        }
        this.annotations.add(annotation);
        fireChangeEvent();

    }

    /**
     * Clears all the annotations.
     */
    public void clearAnnotations() {
        if (this.annotations != null) {
            this.annotations.clear();
            fireChangeEvent();
        }
    }

    /**
     * Checks the compatibility of a domain axis, returning true if the axis is
     * compatible with the plot, and false otherwise.
     *
     * @param axis The proposed axis.
     *
     * @return <code>true</code> if the axis is compatible with the plot.
     */
    public boolean isCompatibleDomainAxis(ValueAxis axis) {

        return true;

    }

    /**
     * Draws the plot on a Java 2D graphics device (such as the screen or a
     * printer).
     * <P>
     * The optional <code>info</code> argument collects information about the
     * rendering of the plot (dimensions, tooltip information etc).  Just pass
     * in <code>null</code> if you do not need this information.
     *
     * @param g2  the graphics device.
     * @param area  the area within which the plot (including axis labels)
     *              should be drawn.
     * @param anchor  the anchor point (<code>null</code> permitted).
     * @param parentState  the state from the parent plot, if there is one.
     * @param info  collects chart drawing information (<code>null</code>
     *              permitted).
     */
    @Override
    public void draw(Graphics2D g2, Rectangle2D area, Point2D anchor,
                     PlotState parentState, PlotRenderingInfo info) {

        // if the plot area is too small, just return...
        boolean b1 = (area.getWidth() <= MINIMUM_WIDTH_TO_DRAW);
        boolean b2 = (area.getHeight() <= MINIMUM_HEIGHT_TO_DRAW);
        if (b1 || b2) {
            return;
        }

        // record the plot area...
        if (info != null) {
            info.setPlotArea(area);
        }

        // adjust the drawing area for plot insets (if any)...
        RectangleInsets insets = getInsets();
        insets.trim(area);

        AxisSpace space = new AxisSpace();

        space = this.domainAxis.reserveSpace(g2, this, area,
                RectangleEdge.BOTTOM, space);
        space = this.rangeAxis.reserveSpace(g2, this, area,
                RectangleEdge.LEFT, space);

        Rectangle2D estimatedDataArea = space.shrink(area, null);

        AxisSpace space2 = new AxisSpace();
        space2 = this.colorBar.reserveSpace(g2, this, area, estimatedDataArea,
                this.colorBarLocation, space2);
        Rectangle2D adjustedPlotArea = space2.shrink(area, null);

        Rectangle2D dataArea = space.shrink(adjustedPlotArea, null);

        Rectangle2D colorBarArea = space2.reserved(area, this.colorBarLocation);

        // additional dataArea modifications
        if (getDataAreaRatio() != 0.0) { //check whether modification is
            dataArea = adjustDataAreaForRatio(dataArea);
        }

        if (info != null) {
            info.setDataArea(dataArea);
        }

        CrosshairState crosshairState = new CrosshairState();
        crosshairState.setCrosshairDistance(Double.POSITIVE_INFINITY);

        // draw the plot background...
        drawBackground(g2, dataArea);

        double cursor = dataArea.getMaxY();
        if (this.domainAxis != null) {
            this.domainAxis.draw(g2, cursor, adjustedPlotArea, dataArea,
                    RectangleEdge.BOTTOM, info);
        }

        if (this.rangeAxis != null) {
            cursor = dataArea.getMinX();
            this.rangeAxis.draw(g2, cursor, adjustedPlotArea, dataArea,
                    RectangleEdge.LEFT, info);
        }

        if (this.colorBar != null) {
            cursor = 0.0;
            this.colorBar.draw(g2, cursor, adjustedPlotArea, dataArea,
                    colorBarArea, this.colorBarLocation);
        }
        Shape originalClip = g2.getClip();
        Composite originalComposite = g2.getComposite();

        g2.clip(dataArea);
        g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER,
                getForegroundAlpha()));
        render(g2, dataArea, info, crosshairState);

        if (this.domainMarkers != null) {
            Iterator iterator = this.domainMarkers.iterator();
            while (iterator.hasNext()) {
                Marker marker = (Marker) iterator.next();
                drawDomainMarker(g2, this, getDomainAxis(), marker, dataArea);
            }
        }

        if (this.rangeMarkers != null) {
            Iterator iterator = this.rangeMarkers.iterator();
            while (iterator.hasNext()) {
                Marker marker = (Marker) iterator.next();
                drawRangeMarker(g2, this, getRangeAxis(), marker, dataArea);
            }
        }

// TO DO:  these annotations only work with XYPlot, see if it is possible to
// make ContourPlot a subclass of XYPlot (DG);

//        // draw the annotations...
//        if (this.annotations != null) {
//            Iterator iterator = this.annotations.iterator();
//            while (iterator.hasNext()) {
//                Annotation annotation = (Annotation) iterator.next();
//                if (annotation instanceof XYAnnotation) {
//                    XYAnnotation xya = (XYAnnotation) annotation;
//                    // get the annotation to draw itself...
//                    xya.draw(g2, this, dataArea, getDomainAxis(),
//                             getRangeAxis());
//                }
//            }
//        }

        g2.setClip(originalClip);
        g2.setComposite(originalComposite);
        drawOutline(g2, dataArea);

    }

    /**
     * Adjusts the data area for the specified ratio.
     * @param dataArea the data area to adjust
     * @return the adjusted data area
     */
    private Rectangle2D adjustDataAreaForRatio(Rectangle2D dataArea) {
        double ratio = getDataAreaRatio();
        Rectangle2D tmpDataArea = (Rectangle2D) dataArea.clone();
        double h = tmpDataArea.getHeight();
        double w = tmpDataArea.getWidth();

        if (ratio > 0) { // ratio represents pixels
            if (w * ratio <= h) {
                h = ratio * w;
            }
            else {
                w = h / ratio;
            }
        }
        else {  // ratio represents axis units
            ratio *= -1.0;
            double xLength = getDomainAxis().getRange().getLength();
            double yLength = getRangeAxis().getRange().getLength();
            double unitRatio = yLength / xLength;

            ratio = unitRatio * ratio;

            if (w * ratio <= h) {
                h = ratio * w;
            }
            else {
                w = h / ratio;
            }
        }

        dataArea.setRect(tmpDataArea.getX() + tmpDataArea.getWidth() / 2
                - w / 2, tmpDataArea.getY(), w, h);
        return dataArea;
    }

    /**
     * Draws a representation of the data within the dataArea region, using the
     * current renderer.
     * <P>
     * The <code>info</code> and <code>crosshairState</code> arguments may be
     * <code>null</code>.
     *
     * @param g2  the graphics device.
     * @param dataArea  the region in which the data is to be drawn.
     * @param info  an optional object for collection dimension information.
     * @param crosshairState  an optional object for collecting crosshair info.
     */
    public void render(Graphics2D g2, Rectangle2D dataArea,
                       PlotRenderingInfo info, CrosshairState crosshairState) {

        // now get the data and plot it (the visual representation will depend
        // on the renderer that has been set)...
        ContourDataset data = getDataset();
        if (data != null) {

            ColorBar zAxis = getColorBar();

            if (this.clipPath != null) {
                GeneralPath clipper = getClipPath().draw(g2, dataArea,
                        this.domainAxis, this.rangeAxis);
                if (this.clipPath.isClip()) {
                    g2.clip(clipper);
                }
            }

            RendererContext context = new RendererContext(g2, dataArea, info,
                    this, this.domainAxis, this.rangeAxis, zAxis, data,
                    crosshairState);

            if (this.renderAsPoints) {
                pointRenderer(context);
            }
            else {
                contourRenderer(context);
            }

            // draw vertical crosshair if required...
            setDomainCrosshairValue(crosshairState.getCrosshairX(), false);
            if (isDomainCrosshairVisible()) {
                drawVerticalLine(g2, dataArea,
                                 getDomainCrosshairValue(),
                                 getDomainCrosshairStroke(),
                                 getDomainCrosshairPaint());
            }

            // draw horizontal crosshair if required...
            setRangeCrosshairValue(crosshairState.getCrosshairY(), false);
            if (isRangeCrosshairVisible()) {
                drawHorizontalLine(g2, dataArea,
                                   getRangeCrosshairValue(),
                                   getRangeCrosshairStroke(),
                                   getRangeCrosshairPaint());
            }

        }
        else if (this.clipPath != null) {
            getClipPath().draw(g2, dataArea, this.domainAxis, this.rangeAxis);
        }

    }

    /**
     * Parameter object for renderer context.
     */
    private static class RendererContext {
        final Graphics2D g2;
        final Rectangle2D dataArea;
        final PlotRenderingInfo info;
        final ContourPlot plot;
        final ValueAxis horizontalAxis;
        final ValueAxis verticalAxis;
        final ColorBar colorBar;
        final ContourDataset data;
        final CrosshairState crosshairState;

        RendererContext(Graphics2D g2, Rectangle2D dataArea,
                       PlotRenderingInfo info, ContourPlot plot,
                       ValueAxis horizontalAxis, ValueAxis verticalAxis,
                       ColorBar colorBar, ContourDataset data,
                       CrosshairState crosshairState) {
            this.g2 = g2;
            this.dataArea = dataArea;
            this.info = info;
            this.plot = plot;
            this.horizontalAxis = horizontalAxis;
            this.verticalAxis = verticalAxis;
            this.colorBar = colorBar;
            this.data = data;
            this.crosshairState = crosshairState;
        }
    }

    /**
     * Fills the plot.
     *
     * @param context the renderer context containing all necessary parameters
     */
    public void contourRenderer(RendererContext context) {

        // setup for collecting optional entity info...
        Rectangle2D.Double entityArea;
        EntityCollection entities = null;
        if (context.info != null) {
            entities = context.info.getOwner().getEntityCollection();
        }

        Rectangle2D.Double rect;
        rect = new Rectangle2D.Double();

        //turn off anti-aliasing when filling rectangles
        Object antiAlias = context.g2.getRenderingHint(RenderingHints.KEY_ANTIALIASING);
        context.g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                RenderingHints.VALUE_ANTIALIAS_OFF);

        // get the data points
        Number[] xNumber = context.data.getXValues();
        Number[] yNumber = context.data.getYValues();
        Number[] zNumber = context.data.getZValues();

        double[] x = new double[xNumber.length];
        double[] y = new double[yNumber.length];

        for (int i = 0; i < x.length; i++) {
            x[i] = xNumber[i].doubleValue();
            y[i] = yNumber[i].doubleValue();
        }

        int[] xIndex = context.data.indexX();
        int[] indexX = context.data.getXIndices();
        boolean vertInverted = ((NumberAxis) context.verticalAxis).isInverted();
        boolean horizInverted = false;
        if (context.horizontalAxis instanceof NumberAxis) {
            horizInverted = ((NumberAxis) context.horizontalAxis).isInverted();
        }
        double transX = 0.0;
        double transXm1;
        double transXp1;
        double transDXm1;
        double transDXp1 = 0.0;
        double transDX = 0.0;
        double transY;
        double transYm1;
        double transYp1;
        double transDYm1;
        double transDYp1 = 0.0;
        double transDY;
        int iMax = xIndex[xIndex.length - 1];
        for (int k = 0; k < x.length; k++) {
            int i = xIndex[k];
            if (indexX[i] == k) { // this is a new column
                if (i == 0) {
                    transX = context.horizontalAxis.valueToJava2D(x[k], context.dataArea,
                            RectangleEdge.BOTTOM);
                    transXm1 = transX;
                    transXp1 = context.horizontalAxis.valueToJava2D(
                            x[indexX[i + 1]], context.dataArea, RectangleEdge.BOTTOM);
                    transDXm1 = Math.abs(0.5 * (transX - transXm1));
                    transDXp1 = Math.abs(0.5 * (transX - transXp1));
                }
                else if (i == iMax) {
                    transX = context.horizontalAxis.valueToJava2D(x[k], context.dataArea,
                            RectangleEdge.BOTTOM);
                    transXm1 = context.horizontalAxis.valueToJava2D(x[indexX[i - 1]],
                            context.dataArea, RectangleEdge.BOTTOM);
                    transXp1 = transX;
                    transDXm1 = Math.abs(0.5 * (transX - transXm1));
                    transDXp1 = Math.abs(0.5 * (transX - transXp1));
                }
                else {
                    transX = context.horizontalAxis.valueToJava2D(x[k], context.dataArea,
                            RectangleEdge.BOTTOM);
                    transXp1 = context.horizontalAxis.valueToJava2D(x[indexX[i + 1]],
                            context.dataArea, RectangleEdge.BOTTOM);
                    transDXm1 = transDXp1;
                    transDXp1 = Math.abs(0.5 * (transX - transXp1));
                }

                if (horizInverted) {
                    transX -= transDXp1;
                }
                else {
                    transX -= transDXm1;
                }

                transDX = transDXm1 + transDXp1;

                transY = context.verticalAxis.valueToJava2D(y[k], context.dataArea,
                        RectangleEdge.LEFT);
                transYm1 = transY;
                if (k + 1 == y.length) {
                    continue;
                }
                transYp1 = context.verticalAxis.valueToJava2D(y[k + 1], context.dataArea,
                        RectangleEdge.LEFT);
                transDYm1 = Math.abs(0.5 * (transY - transYm1));
                transDYp1 = Math.abs(0.5 * (transY - transYp1));
            }
            else if ((i < indexX.length - 1
                     && indexX[i + 1] - 1 == k) || k == x.length - 1) {
                // end of column
                transY = context.verticalAxis.valueToJava2D(y[k], context.dataArea,
                        RectangleEdge.LEFT);
                transYm1 = context.verticalAxis.valueToJava2D(y[k - 1], context.dataArea,
                        RectangleEdge.LEFT);
                transYp1 = transY;
                transDYm1 = Math.abs(0.5 * (transY - transYm1));
                transDYp1 = Math.abs(0.5 * (transY - transYp1));
            }
            else {
                transY = context.verticalAxis.valueToJava2D(y[k], context.dataArea,
                        RectangleEdge.LEFT);
                transYp1 = context.verticalAxis.valueToJava2D(y[k + 1], context.dataArea,
                        RectangleEdge.LEFT);
                transDYm1 = transDYp1;
                transDYp1 = Math.abs(0.5 * (transY - transYp1));
            }
            if (vertInverted) {
                transY -= transDYm1;
            }
            else {
                transY -= transDYp1;
            }

            transDY = transDYm1 + transDYp1;

            rect.setRect(transX, transY, transDX, transDY);
            if (zNumber[k] != null) {
                context.g2.setPaint(context.colorBar.getPaint(zNumber[k].doubleValue()));
                context.g2.fill(rect);
            }
            else if (this.missingPaint != null) {
                context.g2.setPaint(this.missingPaint);
                context.g2.fill(rect);
            }

            entityArea = rect;

            // add an entity for the item...
            if (entities != null) {
                String tip = "";
                if (getToolTipGenerator() != null) {
                    tip = this.toolTipGenerator.generateToolTip(context.data, k);
                }
                String url = null;
                ContourEntity entity = new ContourEntity(
                        (Rectangle2D.Double) entityArea.clone(), tip, url);
                entity.setIndex(k);
                entities.add(entity);
            }

            // do we need to update the crosshair values?
            if (context.plot.isDomainCrosshairLockedOnData()) {
                if (context.plot.isRangeCrosshairLockedOnData()) {
                    // both axes
                    context.crosshairState.updateCrosshairPoint(x[k], y[k], transX,
                            transY, PlotOrientation.VERTICAL);
                }
                else {
                    // just the horizontal axis...
                    context.crosshairState.updateCrosshairX(transX);
                }
            }
            else {
                if (context.plot.isRangeCrosshairLockedOnData()) {
                    // just the vertical axis...
                    context.crosshairState.updateCrosshairY(transY);
                }
            }
        }

        context.g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, antiAlias);

    }

    /**
     * Draws the visual representation of a single data item.
     *
     * @param context the renderer context containing all necessary parameters
     */
    public void pointRenderer(RendererContext context) {

        // setup for collecting optional entity info...
        RectangularShape entityArea;
        EntityCollection entities = null;
        if (context.info != null) {
            entities = context.info.getOwner().getEntityCollection();
        }

        RectangularShape rect = new Ellipse2D.Double();

        //turn off anti-aliasing when filling rectangles
        Object antiAlias = context.g2.getRenderingHint(RenderingHints.KEY_ANTIALIASING);
        context.g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                RenderingHints.VALUE_ANTIALIAS_OFF);

        // get the data points
        Number[] xNumber = context.data.getXValues();
        Number[] yNumber = context.data.getYValues();
        Number[] zNumber = context.data.getZValues();

        double[] x = new double[xNumber.length];
        double[] y = new double[yNumber.length];

        for (int i = 0; i < x.length; i++) {
            x[i] = xNumber[i].doubleValue();
            y[i] = yNumber[i].doubleValue();
        }

        double transX;
        double transDX;
        double transY;
        double transDY;
        double size = context.dataArea.getWidth() * this.ptSizePct;
        for (int k = 0; k < x.length; k++) {

            transX = context.domainAxis.valueToJava2D(x[k], context.dataArea,
                    RectangleEdge.BOTTOM) - 0.5 * size;
            transY = context.rangeAxis.valueToJava2D(y[k], context.dataArea, RectangleEdge.LEFT)
                     - 0.5 * size;
            transDX = size;
            transDY = size;

            rect.setFrame(transX, transY, transDX, transDY);

            if (zNumber[k] != null) {
                context.g2.setPaint(context.colorBar.getPaint(zNumber[k].doubleValue()));
                context.g2.fill(rect);
            }
            else if (this.missingPaint != null) {
                context.g2.setPaint(this.missingPaint);
                context.g2.fill(rect);
            }

            entityArea = rect;

            // add an entity for the item...
            if (entities != null) {
                String tip = null;
                if (getToolTipGenerator() != null) {
                    tip = this.toolTipGenerator.generateToolTip(context.data, k);
                }
                String url = null;
                ContourEntity entity = new ContourEntity(
                        (RectangularShape) entityArea.clone(), tip, url);
                entity.setIndex(k);
                entities.add(entity);
            }

            // do we need to update the crosshair values?
            if (context.plot.isDomainCrosshairLockedOnData()) {
                if (context.plot.isRangeCrosshairLockedOnData()) {
                    // both axes
                    context.crosshairState.updateCrosshairPoint(x[k], y[k], transX,
                            transY, PlotOrientation.VERTICAL);
                }
                else {
                    // just the horizontal axis...
                    context.crosshairState.updateCrosshairX(transX);
                }
            }
            else {
                if (context.plot.isRangeCrosshairLockedOnData()) {
                    // just the vertical axis...
                    context.crosshairState.updateCrosshairY(transY);
                }
            }
        }

        context.g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, antiAlias);

    }

    /**
     * Utility method for drawing a crosshair on the chart (if required).
     *
     * @param g2  The graphics device.
     * @param dataArea  The data area.
     * @param value  The coordinate, where to draw the line.
     * @param stroke  The stroke to use.
     * @param paint  The paint to use.
     */
    protected void drawVerticalLine(Graphics2D g2, Rectangle2D dataArea,
                                    double value, Stroke stroke, Paint paint) {

        double xx = getDomainAxis().valueToJava2D(value, dataArea,
                RectangleEdge.BOTTOM);
        Line2D line = new Line2D.Double(xx, dataArea.getMinY(), xx,
                dataArea.getMaxY());
        g2.setStroke(stroke);
        g2.setPaint(paint);
        g2.draw(line);

    }

    /**
     * Utility method for drawing a crosshair on the chart (if required).
     *
     * @param g2  The graphics device.
     * @param dataArea  The data area.
     * @param value  The coordinate, where to draw the line.
     * @param stroke  The stroke to use.
     * @param paint  The paint to use.
     */
    protected void drawHorizontalLine(Graphics2D g2, Rectangle2D dataArea,
                                      double value, Stroke stroke,
                                      Paint paint) {

        double yy = getRangeAxis().valueToJava2D(value, dataArea,
                RectangleEdge.LEFT);
        Line2D line = new Line2D.Double(dataArea.getMinX(), yy,
                dataArea.getMaxX(), yy);
        g2.setStroke(stroke);
        g2.setPaint(paint);
        g2.draw(line);

    }

    /**
     * Handles a 'click' on the plot by updating the anchor values...
     *
     * @param x  x-coordinate, where the click occured.
     * @param y  y-coordinate, where the click occured.
     * @param info  An object for collection dimension information.
     */
    @Override
    public void handleClick(int x, int y, PlotRenderingInfo info) {

/*        // set the anchor value for the horizontal axis...
        ValueAxis hva = getDomainAxis();
        if (hva != null) {
            double hvalue = hva.translateJava2DtoValue(
                (float) x, info.getDataArea()
            );

            hva.setAnchorValue(hvalue);
            setDomainCrosshairValue(hvalue);
        }

        // set the anchor value for the vertical axis...
        ValueAxis vva = getRangeAxis();
        if (vva != null) {
            double vvalue = vva.translateJava2DtoValue(
                (float) y, info.getDataArea()
            );
            vva.setAnchorValue(vvalue);
            setRangeCrosshairValue(vvalue);
        }
*/
    }

    /**
     * Zooms the axis ranges by the specified percentage about the anchor point.
     *
     * @param percent  The amount of the zoom.
     */
    @Override
    public void zoom(double percent) {

        if (percent > 0) {
          //  double range = this.domainAxis.getRange().getLength();
          //  double scaledRange = range * percent;
          //  domainAxis.setAnchoredRange(scaledRange);

          //  range = this.rangeAxis.getRange().getLength();
         //  scaledRange = range * percent;
         //   rangeAxis.setAnchoredRange(scaledRange);
        }
        else {
            getRangeAxis().setAutoRange(true);
            getDomainAxis().setAutoRange(true);
        }

    }

    /**
     * Returns the plot type as a string.
     *
     * @return A short string describing the type of plot.
     */
    @Override
    public String getPlotType() {
        return localizationResources.getString("Contour_Plot");
    }

    /**
     * Returns the range for an axis.
     *
     * @param axis  the axis.
     *
     * @return The range for an axis.
     */
    @Override
    public Range getDataRange(ValueAxis axis) {

        if (this.dataset == null) {
            return null;
        }

        Range result = null;

        if (axis == getDomainAxis()) {
            result = DatasetUtilities.findDomainBounds(this.dataset);
        }
        else if (axis == getRangeAxis()) {
            result = DatasetUtilities.findRangeBounds(this.dataset);
        }
        return result;
    }

    /**
     * Returns the range for the Contours.
     *
     * @return The range for the Contours (z-axis).
     */
    @Override
    public Range getContourDataRange() {
        Range result = null;
        ContourDataset data = getDataset();
        if (data != null) {
            Range h = getDomainAxis().getRange();
            Range v = getRangeAxis().getRange();
            result = this.visibleRange(data, h, v);
        }
        return result;
    }

    /**
     * Notifies all registered listeners of a property change.
     * <P>
     * One source of property change events is the plot's renderer.
     *
     * @param event  Information about the property change.
     */
    @Override
    public void propertyChange(PropertyChangeEvent event) {
        fireChangeEvent();
    }

    /**
     * Receives notification of a change to the plot's dataset.
     * <P>
     * The chart reacts by passing on a chart change event to all registered
     * listeners.
     *
     * @param event  Information about the event (not used here).
     */
    @Override
    public void datasetChanged(DatasetChangeEvent event) {
        if (this.domainAxis != null) {
            this.domainAxis.configure();
        }
        if (this.rangeAxis != null) {
            this.rangeAxis.configure();
        }
        if (this.colorBar != null) {
            this.colorBar.configure(this);
        }
        super.datasetChanged(event);
    }

    /**
     * Returns the colorbar.
     *
     * @return The colorbar.
     */
    public ColorBar getColorBar() {
        return this.colorBar;
    }

    /**
     * Returns a flag indicating whether or not the domain crosshair is visible.
     *
     * @return The flag.
     */
    public boolean isDomainCrosshairVisible() {
        return this.domainCrosshairVisible;
    }

    /**
     * Sets the flag indicating whether or not the domain crosshair is visible.
     *
     * @param flag  the new value of the flag.
     */
    public void setDomainCrosshairVisible(boolean flag) {

        if (this.domainCrosshairVisible != flag) {
            this.domainCrosshairVisible = flag;
            fireChangeEvent();
        }

    }

    /**
     * Returns a flag indicating whether or not the crosshair should "lock-on"
     * to actual data values.
     *
     * @return The flag.
     */
    public boolean isDomainCrosshairLockedOnData() {
        return this.domainCrosshairLockedOnData;
    }

    /**
     * Sets the flag indicating whether or not the domain crosshair should
     * "lock-on" to actual data values.
     *
     * @param flag  the flag.
     */
    public void setDomainCrosshairLockedOnData(boolean flag) {
        if (this.domainCrosshairLockedOnData != flag) {
            this.domainCrosshairLockedOnData = flag;
            fireChangeEvent();
        }
    }

    /**
     * Returns the domain crosshair value.
     *
     * @return The value.
     */
    public double getDomainCrosshairValue() {
        return this.domainCrosshairValue;
    }

    /**
     * Sets the domain crosshair value.
     * <P>
     * Registered listeners are notified that the plot has been modified, but
     * only if the crosshair is visible.
     *
     * @param value  the new value.
     */
    public void setDomainCrosshairValue(double value) {
        setDomainCrosshairValue(value, true);
    }

    /**
     * Sets the domain crosshair value.
     * <P>
     * Registered listeners are notified that the axis has been modified, but
     * only if the crosshair is visible.
     *
     * @param value  the new value.
     * @param notify  a flag that controls whether or not listeners are
     *                notified.
     */
    public void setDomainCrosshairValue(double value, boolean notify) {
        this.domainCrosshairValue = value;
        if (isDomainCrosshairVisible() && notify) {
            fireChangeEvent();
        }
    }

    /**
     * Returns the Stroke used to draw the crosshair (if visible).
     *
     * @return The crosshair stroke.
     */
    public Stroke getDomainCrosshairStroke() {
        return this.domainCrosshairStroke;
    }

    /**
     * Sets the Stroke used to draw the crosshairs (if visible) and notifies
     * registered listeners that the axis has been modified.
     *
     * @param stroke  the new crosshair stroke.
     */
    public void setDomainCrosshairStroke(Stroke stroke) {
        this.domainCrosshairStroke = stroke;
        fireChangeEvent();
    }

    /**
     * Returns the domain crosshair color.
     *
     * @return The crosshair color.
     */
    public Paint getDomainCrosshairPaint() {
        return this.domainCrosshairPaint;
    }

    /**
     * Sets the Paint used to color the crosshairs (if visible) and notifies
     * registered listeners that the axis has been modified.
     *
     * @param paint the new crosshair paint.
     */
    public void setDomainCrosshairPaint(Paint paint) {
        this.domainCrosshairPaint = paint;
        fireChangeEvent();
    }

    /**
     * Returns a flag indicating whether or not the range crosshair is visible.
     *
     * @return The flag.
     */
    public boolean isRangeCrosshairVisible() {
        return this.rangeCrosshairVisible;
    }

    /**
     * Sets the flag indicating whether or not the range crosshair is visible.
     *
     * @param flag  the new value of the flag.
     */
    public void setRangeCrosshairVisible(boolean flag) {
        if (this.rangeCrosshairVisible != flag) {
            this.rangeCrosshairVisible = flag;
            fireChangeEvent();
        }
    }

    /**
     * Returns a flag indicating whether or not the crosshair should "lock-on"
     * to actual data values.
     *
     * @return The flag.
     */
    public boolean isRangeCrosshairLockedOnData() {
        return this.rangeCrosshairLockedOnData;
    }

    /**
     * Sets the flag indicating whether or not the range crosshair should
     * "lock-on" to actual data values.
     *
     * @param flag  the flag.
     */
    public void setRangeCrosshairLockedOnData(boolean flag) {
        if (this.rangeCrosshairLockedOnData != flag) {
            this.rangeCrosshairLockedOnData = flag;
            fireChangeEvent();
        }
    }

    /**
     * Returns the range crosshair value.
     *
     * @return The value.
     */
    public double getRangeCrosshairValue() {
        return this.rangeCrosshairValue;
    }

    /**
     * Sets the domain crosshair value.
     * <P>
     * Registered listeners are notified that the plot has been modified, but
     * only if the crosshair is visible.
     *
     * @param value  the new value.
     */
    public void setRangeCrosshairValue(double value) {
        setRangeCrosshairValue(value, true);
    }

    /**
     * Sets the range crosshair value.
     * <P>
     * Registered listeners are notified that the axis has been modified, but
     * only if the crosshair is visible.
     *
     * @param value  the new value.
     * @param notify  a flag that controls whether or not listeners are
     *                notified.
     */
    public void setRangeCrosshairValue(double value, boolean notify) {
        this.rangeCrosshairValue = value;
        if (isRangeCrosshairVisible() && notify) {
            fireChangeEvent();
        }
    }

    /**
     * Returns the Stroke used to draw the crosshair (if visible).
     *
     * @return The crosshair stroke.
     */
    public Stroke getRangeCrosshairStroke() {
        return this.rangeCrosshairStroke;
    }

    /**
     * Sets the Stroke used to draw the crosshairs (if visible) and notifies
     * registered listeners that the axis has been modified.
     *
     * @param stroke  the new crosshair stroke.
     */
    public void setRangeCrosshairStroke(Stroke stroke) {
        this.rangeCrosshairStroke = stroke;
        fireChangeEvent();
    }

    /**
     * Returns the range crosshair color.
     *
     * @return The crosshair color.
     */
    public Paint getRangeCrosshairPaint() {
        return this.rangeCrosshairPaint;
    }

    /**
     * Sets the Paint used to color the crosshairs (if visible) and notifies
     * registered listeners that the axis has been modified.
     *
     * @param paint the new crosshair paint.
     */
    public void setRangeCrosshairPaint(Paint paint) {
        this.rangeCrosshairPaint = paint;
        fireChangeEvent();
    }

    /**
     * Returns the tool tip generator.
     *
     * @return The tool tip generator (possibly null).
     */
    public ContourToolTipGenerator getToolTipGenerator() {
        return this.toolTipGenerator;
    }

    /**
     * Sets the tool tip generator.
     *
     * @param generator  the tool tip generator (null permitted).
     */
    public void setToolTipGenerator(ContourToolTipGenerator generator) {
        //Object oldValue = this.toolTipGenerator;
        this.toolTipGenerator = generator;
    }

    /**
     * Returns the URL generator for HTML image maps.
     *
     * @return The URL generator (possibly null).
     */
    public XYURLGenerator getURLGenerator() {
        return this.urlGenerator;
    }

    /**
     * Sets the URL generator for HTML image maps.
     *
     * @param urlGenerator  the URL generator (null permitted).
     */
    public void setURLGenerator(XYURLGenerator urlGenerator) {
        //Object oldValue = this.urlGenerator;
        this.urlGenerator = urlGenerator;
    }

    /**
     * Draws a vertical line on the chart to represent a 'range marker'.
     *
     * @param g2  the graphics device.
     * @param plot  the plot.
     * @param domainAxis  the domain axis.
     * @param marker  the marker line.
     * @param dataArea  the axis data area.
     */
    public void drawDomainMarker(Graphics2D g2,
                                 ContourPlot plot,
                                 ValueAxis domainAxis,
                                 Marker marker,
                                 Rectangle2D dataArea) {

        if (marker instanceof ValueMarker) {
            ValueMarker vm = (ValueMarker) marker;
            double value = vm.getValue();
            Range range = domainAxis.getRange();
            if (!range.contains(value)) {
                return;
            }

            double x = domainAxis.valueToJava2D(value, dataArea,
                    RectangleEdge.BOTTOM);
            Line2D line = new Line2D.Double(x, dataArea.getMinY(), x,
                    dataArea.getMaxY());
            Paint paint = marker.getOutlinePaint();
            Stroke stroke = marker.getOutlineStroke();
            g2.setPaint(paint != null ? paint : Plot.DEFAULT_OUTLINE_PAINT);
            g2.setStroke(stroke != null ? stroke : Plot.DEFAULT_OUTLINE_STROKE);
            g2.draw(line);
        }

    }

    /**
     * Draws a horizontal line across the chart to represent a 'range marker'.
     *
     * @param g2  the graphics device.
     * @param plot  the plot.
     * @param rangeAxis  the range axis.
     * @param marker  the marker line.
     * @param dataArea  the axis data area.
     */
    public void drawRangeMarker(Graphics2D g2,
                                ContourPlot plot,
                                ValueAxis rangeAxis,
                                Marker marker,
                                Rectangle2D dataArea) {

        if (marker instanceof ValueMarker) {
            ValueMarker vm = (ValueMarker) marker;
            double value = vm.getValue();
            Range range = rangeAxis.getRange();
            if (!range.contains(value)) {
                return;
            }

            double y = rangeAxis.valueToJava2D(value, dataArea,
                    RectangleEdge.LEFT);
            Line2D line = new Line2D.Double(dataArea.getMinX(), y,
                    dataArea.getMaxX(), y);
            Paint paint = marker.getOutlinePaint();
            Stroke stroke = marker.getOutlineStroke();
            g2.setPaint(paint != null ? paint : Plot.DEFAULT_OUTLINE_PAINT);
            g2.setStroke(stroke != null ? stroke : Plot.DEFAULT_OUTLINE_STROKE);
            g2.draw(line);
        }

    }

    /**
     * Returns the clipPath.
     * @return ClipPath
     */
    public ClipPath getClipPath() {
        return this.clipPath;
    }

    /**
     * Sets the clipPath.
     * @param clipPath The clipPath to set
     */
    public void setClipPath(ClipPath clipPath) {
        this.clipPath = clipPath;
    }

    /**
     * Returns the ptSizePct.
     * @return double
     */
    public double getPtSizePct() {
        return this.ptSizePct;
    }

    /**
     * Returns the renderAsPoints.
     * @return boolean
     */
    public boolean isRenderAsPoints() {
        return this.renderAsPoints;
    }

    /**
     * Sets the ptSizePct.
     * @param ptSizePct The ptSizePct to set
     */
    public void setPtSizePct(double ptSizePct) {
        this.ptSizePct = ptSizePct;
    }

    /**
     * Sets the renderAsPoints.
     * @param renderAsPoints The renderAsPoints to set
     */
    public void setRenderAsPoints(boolean renderAsPoints) {
        this.renderAsPoints = renderAsPoints;
    }

    /**
     * Receives notification of a change to one of the plot's axes.
     *
     * @param event  information about the event.
     */
    @Override
    public void axisChanged(AxisChangeEvent event) {
        Object source = event.getSource();
        if (source.equals(this.rangeAxis) || source.equals(this.domainAxis)) {
            ColorBar cba = this.colorBar;
            if (this.colorBar.getAxis().isAutoRange()) {
                cba.getAxis().configure();
            }

        }
        super.axisChanged(event);
    }

    /**
     * Returns the visible z-range.
     *
     * @param data  the dataset.
     * @param x  the x range.
     * @param y  the y range.
     *
     * @return The range.
     */
    public Range visibleRange(ContourDataset data, Range x, Range y) {
        Range range = data.getZValueRange(x, y);
        return range;
    }

    /**
     * Returns the missingPaint.
     * @return Paint
     */
    public Paint getMissingPaint() {
        return this.missingPaint;
    }

    /**
     * Sets the missingPaint.
     *
     * @param paint  the missingPaint to set.
     */
    public void setMissingPaint(Paint paint) {
        this.missingPaint = paint;
    }

    /**
     * Multiplies the range on the domain axis/axes by the specified factor
     * (to be implemented).
     *
     * @param x  the x-coordinate (in Java2D space).
     * @param y  the y-coordinate (in Java2D space).
     * @param factor  the zoom factor.
     */
    public void zoomDomainAxes(double x, double y, double factor) {
        // TODO: to be implemented
    }

    /**
     * Zooms the domain axes (not yet implemented).
     *
     * @param x  the x-coordinate (in Java2D space).
     * @param y  the y-coordinate (in Java2D space).
     * @param lowerPercent  the new lower bound.
     * @param upperPercent  the new upper bound.
     */
    public void zoomDomainAxes(double x, double y, double lowerPercent,
                               double upperPercent) {
        // TODO: to be implemented
    }

    /**
     * Multiplies the range on the range axis/axes by the specified factor.
     *
     * @param x  the x-coordinate (in Java2D space).
     * @param y  the y-coordinate (in Java2D space).
     * @param factor  the zoom factor.
     */
    public void zoomRangeAxes(double x, double y, double factor) {
        // TODO: to be implemented
    }

    /**
     * Zooms the range axes (not yet implemented).
     *
     * @param x  the x-coordinate (in Java2D space).
     * @param y  the y-coordinate (in Java2D space).
     * @param lowerPercent  the new lower bound.
     * @param upperPercent  the new upper bound.
     */
    public void zoomRangeAxes(double x, double y, double lowerPercent,
                              double upperPercent) {
        // TODO: to be implemented
    }

    /**
     * Returns <code>false</code>.
     *
     * @return A boolean.
     */
    public boolean isDomainZoomable() {
        return false;
    }

    /**
     * Returns <code>false</code>.
     *
     * @return A boolean.
     */
    public boolean isRangeZoomable() {
        return false;
    }

    /**
     * Creates a copy of this plot using a copy constructor.
     * @return a copy of this plot
     * @throws CloneNotSupportedException if cloning is not supported
     */
    @Override
    public Object clone() throws CloneNotSupportedException {
        ContourPlot clone = new ContourPlot(this);

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

        clone.domainMarkers = (List) ObjectUtilities.deepClone(
                this.domainMarkers);
        clone.rangeMarkers = (List) ObjectUtilities.deepClone(
                this.rangeMarkers);
        clone.annotations = (List) ObjectUtilities.deepClone(this.annotations);

        if (this.clipPath != null) {
            clone.clipPath = (ClipPath) this.clipPath.clone();
        }

        return clone;
    }

}