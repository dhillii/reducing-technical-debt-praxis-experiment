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
        ValueAxisPlot, PropertyChangeListener, Serializable {

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
     * Copy constructor – creates a deep copy of the supplied {@code ContourPlot}.
     *
     * @param source  the plot to copy (must not be {@code null})
     */
    public ContourPlot(ContourPlot source) {
        super();

        // Primitive and immutable fields
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

        // Dataset (shallow copy – dataset is immutable for the plot)
        this.dataset = source.dataset;
        if (this.dataset != null) {
            this.dataset.addChangeListener(this);
        }

        // Axes – deep copy via their own clone implementations
        if (source.domainAxis != null) {
            this.domainAxis = (ValueAxis) source.domainAxis.clone();
            this.domainAxis.setPlot(this);
            this.domainAxis.addChangeListener(this);
        }
        if (source.rangeAxis != null) {
            this.rangeAxis = (ValueAxis) source.rangeAxis.clone();
            this.rangeAxis.setPlot(this);
            this.rangeAxis.addChangeListener(this);
        }

        // ColorBar – deep copy via clone
        if (source.colorBar != null) {
            this.colorBar = (ColorBar) source.colorBar.clone();
        }

        // Collections – deep clone using ObjectUtilities
        this.domainMarkers = (List) ObjectUtilities.deepClone(source.domainMarkers);
        this.rangeMarkers = (List) ObjectUtilities.deepClone(source.rangeMarkers);
        this.annotations = (List) ObjectUtilities.deepClone(source.annotations);

        // ClipPath
        if (source.clipPath != null) {
            this.clipPath = (ClipPath) source.clipPath.clone();
        }
    }

    /**
     * Creates a deep copy of this plot.
     *
     * @return a new {@code ContourPlot} instance that is a copy of this plot
     */
    public ContourPlot copy() {
        return new ContourPlot(this);
    }

    public RectangleEdge getColorBarLocation() {
        return this.colorBarLocation;
    }

    public void setColorBarLocation(RectangleEdge edge) {
        this.colorBarLocation = edge;
        fireChangeEvent();
    }

    public ContourDataset getDataset() {
        return this.dataset;
    }

    public void setDataset(ContourDataset dataset) {
        ContourDataset existing = this.dataset;
        if (existing != null) {
            existing.removeChangeListener(this);
        }
        this.dataset = dataset;
        if (dataset != null) {
            setDatasetGroup(dataset.getGroup());
            dataset.addChangeListener(this);
        }
        DatasetChangeEvent event = new DatasetChangeEvent(this, dataset);
        datasetChanged(event);
    }

    public ValueAxis getDomainAxis() {
        return this.domainAxis;
    }

    public void setDomainAxis(ValueAxis axis) {
        if (isCompatibleDomainAxis(axis)) {
            if (axis != null) {
                axis.setPlot(this);
                axis.addChangeListener(this);
            }
            if (this.domainAxis != null) {
                this.domainAxis.removeChangeListener(this);
            }
            this.domainAxis = axis;
            fireChangeEvent();
        }
    }

    public ValueAxis getRangeAxis() {
        return this.rangeAxis;
    }

    public void setRangeAxis(ValueAxis axis) {
        if (axis != null) {
            axis.setPlot(this);
            axis.addChangeListener(this);
        }
        if (this.rangeAxis != null) {
            this.rangeAxis.removeChangeListener(this);
        }
        this.rangeAxis = axis;
        fireChangeEvent();
    }

    public void setColorBarAxis(ColorBar axis) {
        this.colorBar = axis;
        fireChangeEvent();
    }

    public double getDataAreaRatio() {
        return this.dataAreaRatio;
    }

    public void setDataAreaRatio(double ratio) {
        this.dataAreaRatio = ratio;
    }

    public void addDomainMarker(Marker marker) {
        if (this.domainMarkers == null) {
            this.domainMarkers = new java.util.ArrayList();
        }
        this.domainMarkers.add(marker);
        fireChangeEvent();
    }

    public void clearDomainMarkers() {
        if (this.domainMarkers != null) {
            this.domainMarkers.clear();
            fireChangeEvent();
        }
    }

    public void addRangeMarker(Marker marker) {
        if (this.rangeMarkers == null) {
            this.rangeMarkers = new java.util.ArrayList();
        }
        this.rangeMarkers.add(marker);
        fireChangeEvent();
    }

    public void clearRangeMarkers() {
        if (this.rangeMarkers != null) {
            this.rangeMarkers.clear();
            fireChangeEvent();
        }
    }

    public void addAnnotation(XYAnnotation annotation) {
        if (this.annotations == null) {
            this.annotations = new java.util.ArrayList();
        }
        this.annotations.add(annotation);
        fireChangeEvent();
    }

    public void clearAnnotations() {
        if (this.annotations != null) {
            this.annotations.clear();
            fireChangeEvent();
        }
    }

    public boolean isCompatibleDomainAxis(ValueAxis axis) {
        return true;
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

        if (getDataAreaRatio() != 0.0) {
            double ratio = getDataAreaRatio();
            Rectangle2D tmpDataArea = (Rectangle2D) dataArea.clone();
            double h = tmpDataArea.getHeight();
            double w = tmpDataArea.getWidth();

            if (ratio > 0) {
                if (w * ratio <= h) {
                    h = ratio * w;
                } else {
                    w = h / ratio;
                }
            } else {
                ratio *= -1.0;
                double xLength = getDomainAxis().getRange().getLength();
                double yLength = getRangeAxis().getRange().getLength();
                double unitRatio = yLength / xLength;

                ratio = unitRatio * ratio;

                if (w * ratio <= h) {
                    h = ratio * w;
                } else {
                    w = h / ratio;
                }
            }

            dataArea.setRect(tmpDataArea.getX() + tmpDataArea.getWidth() / 2
                    - w / 2, tmpDataArea.getY(), w, h);
        }

        if (info != null) {
            info.setDataArea(dataArea);
        }

        CrosshairState crosshairState = new CrosshairState();
        crosshairState.setCrosshairDistance(Double.POSITIVE_INFINITY);

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

        g2.setClip(originalClip);
        g2.setComposite(originalComposite);
        drawOutline(g2, dataArea);
    }

    public void render(Graphics2D g2, Rectangle2D dataArea,
                       PlotRenderingInfo info, CrosshairState crosshairState) {

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

            if (this.renderAsPoints) {
                pointRenderer(g2, dataArea, info, this, this.domainAxis,
                        this.rangeAxis, zAxis, data, crosshairState);
            } else {
                contourRenderer(g2, dataArea, info, this, this.domainAxis,
                        this.rangeAxis, zAxis, data, crosshairState);
            }

            setDomainCrosshairValue(crosshairState.getCrosshairX(), false);
            if (isDomainCrosshairVisible()) {
                drawVerticalLine(g2, dataArea,
                                 getDomainCrosshairValue(),
                                 getDomainCrosshairStroke(),
                                 getDomainCrosshairPaint());
            }

            setRangeCrosshairValue(crosshairState.getCrosshairY(), false);
            if (isRangeCrosshairVisible()) {
                drawHorizontalLine(g2, dataArea,
                                   getRangeCrosshairValue(),
                                   getRangeCrosshairStroke(),
                                   getRangeCrosshairPaint());
            }

        } else if (this.clipPath != null) {
            getClipPath().draw(g2, dataArea, this.domainAxis, this.rangeAxis);
        }

    }

    public void contourRenderer(Graphics2D g2,
                                Rectangle2D dataArea,
                                PlotRenderingInfo info,
                                ContourPlot plot,
                                ValueAxis horizontalAxis,
                                ValueAxis verticalAxis,
                                ColorBar colorBar,
                                ContourDataset data,
                                CrosshairState crosshairState) {

        Rectangle2D.Double entityArea;
        EntityCollection entities = null;
        if (info != null) {
            entities = info.getOwner().getEntityCollection();
        }

        Rectangle2D.Double rect = new Rectangle2D.Double();

        Object antiAlias = g2.getRenderingHint(RenderingHints.KEY_ANTIALIASING);
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                RenderingHints.VALUE_ANTIALIAS_OFF);

        Number[] xNumber = data.getXValues();
        Number[] yNumber = data.getYValues();
        Number[] zNumber = data.getZValues();

        double[] x = new double[xNumber.length];
        double[] y = new double[yNumber.length];

        for (int i = 0; i < x.length; i++) {
            x[i] = xNumber[i].doubleValue();
            y[i] = yNumber[i].doubleValue();
        }

        int[] xIndex = data.indexX();
        int[] indexX = data.getXIndices();
        boolean vertInverted = ((NumberAxis) verticalAxis).isInverted();
        boolean horizInverted = false;
        if (horizontalAxis instanceof NumberAxis) {
            horizInverted = ((NumberAxis) horizontalAxis).isInverted();
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
            if (indexX[i] == k) {
                if (i == 0) {
                    transX = horizontalAxis.valueToJava2D(x[k], dataArea,
                            RectangleEdge.BOTTOM);
                    transXm1 = transX;
                    transXp1 = horizontalAxis.valueToJava2D(
                            x[indexX[i + 1]], dataArea, RectangleEdge.BOTTOM);
                    transDXm1 = Math.abs(0.5 * (transX - transXm1));
                    transDXp1 = Math.abs(0.5 * (transX - transXp1));
                } else if (i == iMax) {
                    transX = horizontalAxis.valueToJava2D(x[k], dataArea,
                            RectangleEdge.BOTTOM);
                    transXm1 = horizontalAxis.valueToJava2D(x[indexX[i - 1]],
                            dataArea, RectangleEdge.BOTTOM);
                    transXp1 = transX;
                    transDXm1 = Math.abs(0.5 * (transX - transXm1));
                    transDXp1 = Math.abs(0.5 * (transX - transXp1));
                } else {
                    transX = horizontalAxis.valueToJava2D(x[k], dataArea,
                            RectangleEdge.BOTTOM);
                    transXp1 = horizontalAxis.valueToJava2D(x[indexX[i + 1]],
                            dataArea, RectangleEdge.BOTTOM);
                    transDXm1 = transDXp1;
                    transDXp1 = Math.abs(0.5 * (transX - transXp1));
                }

                if (horizInverted) {
                    transX -= transDXp1;
                } else {
                    transX -= transDXm1;
                }

                transDX = transDXm1 + transDXp1;

                transY = verticalAxis.valueToJava2D(y[k], dataArea,
                        RectangleEdge.LEFT);
                transYm1 = transY;
                if (k + 1 == y.length) {
                    continue;
                }
                transYp1 = verticalAxis.valueToJava2D(y[k + 1], dataArea,
                        RectangleEdge.LEFT);
                transDYm1 = Math.abs(0.5 * (transY - transYm1));
                transDYp1 = Math.abs(0.5 * (transY - transYp1));
            } else if ((i < indexX.length - 1
                     && indexX[i + 1] - 1 == k) || k == x.length - 1) {
                transY = verticalAxis.valueToJava2D(y[k], dataArea,
                        RectangleEdge.LEFT);
                transYm1 = verticalAxis.valueToJava2D(y[k - 1], dataArea,
                        RectangleEdge.LEFT);
                transYp1 = transY;
                transDYm1 = Math.abs(0.5 * (transY - transYm1));
                transDYp1 = Math.abs(0.5 * (transY - transYp1));
            } else {
                transY = verticalAxis.valueToJava2D(y[k], dataArea,
                        RectangleEdge.LEFT);
                transYp1 = verticalAxis.valueToJava2D(y[k + 1], dataArea,
                        RectangleEdge.LEFT);
                transDYm1 = transDYp1;
                transDYp1 = Math.abs(0.5 * (transY - transYp1));
            }
            if (vertInverted) {
                transY -= transDYm1;
            } else {
                transY -= transDYp1;
            }

            transDY = transDYm1 + transDYp1;

            rect.setRect(transX, transY, transDX, transDY);
            if (zNumber[k] != null) {
                g2.setPaint(colorBar.getPaint(zNumber[k].doubleValue()));
                g2.fill(rect);
            } else if (this.missingPaint != null) {
                g2.setPaint(this.missingPaint);
                g2.fill(rect);
            }

            entityArea = rect;

            if (entities != null) {
                String tip = "";
                if (getToolTipGenerator() != null) {
                    tip = this.toolTipGenerator.generateToolTip(data, k);
                }
                String url = null;
                ContourEntity entity = new ContourEntity(
                        (Rectangle2D.Double) entityArea.clone(), tip, url);
                entity.setIndex(k);
                entities.add(entity);
            }

            if (plot.isDomainCrosshairLockedOnData()) {
                if (plot.isRangeCrosshairLockedOnData()) {
                    crosshairState.updateCrosshairPoint(x[k], y[k], transX,
                            transY, PlotOrientation.VERTICAL);
                } else {
                    crosshairState.updateCrosshairX(transX);
                }
            } else {
                if (plot.isRangeCrosshairLockedOnData()) {
                    crosshairState.updateCrosshairY(transY);
                }
            }
        }

        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, antiAlias);
    }

    public void pointRenderer(Graphics2D g2,
                              Rectangle2D dataArea,
                              PlotRenderingInfo info,
                              ContourPlot plot,
                              ValueAxis domainAxis,
                              ValueAxis rangeAxis,
                              ColorBar colorBar,
                              ContourDataset data,
                              CrosshairState crosshairState) {

        RectangularShape entityArea;
        EntityCollection entities = null;
        if (info != null) {
            entities = info.getOwner().getEntityCollection();
        }

        RectangularShape rect = new Ellipse2D.Double();

        Object antiAlias = g2.getRenderingHint(RenderingHints.KEY_ANTIALIASING);
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                RenderingHints.VALUE_ANTIALIAS_OFF);

        Number[] xNumber = data.getXValues();
        Number[] yNumber = data.getYValues();
        Number[] zNumber = data.getZValues();

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
        double size = dataArea.getWidth() * this.ptSizePct;
        for (int k = 0; k < x.length; k++) {

            transX = domainAxis.valueToJava2D(x[k], dataArea,
                    RectangleEdge.BOTTOM) - 0.5 * size;
            transY = rangeAxis.valueToJava2D(y[k], dataArea, RectangleEdge.LEFT)
                     - 0.5 * size;
            transDX = size;
            transDY = size;

            rect.setFrame(transX, transY, transDX, transDY);

            if (zNumber[k] != null) {
                g2.setPaint(colorBar.getPaint(zNumber[k].doubleValue()));
                g2.fill(rect);
            } else if (this.missingPaint != null) {
                g2.setPaint(this.missingPaint);
                g2.fill(rect);
            }

            entityArea = rect;

            if (entities != null) {
                String tip = null;
                if (getToolTipGenerator() != null) {
                    tip = this.toolTipGenerator.generateToolTip(data, k);
                }
                String url = null;
                ContourEntity entity = new ContourEntity(
                        (RectangularShape) entityArea.clone(), tip, url);
                entity.setIndex(k);
                entities.add(entity);
            }

            if (plot.isDomainCrosshairLockedOnData()) {
                if (plot.isRangeCrosshairLockedOnData()) {
                    crosshairState.updateCrosshairPoint(x[k], y[k], transX,
                            transY, PlotOrientation.VERTICAL);
                } else {
                    crosshairState.updateCrosshairX(transX);
                }
            } else {
                if (plot.isRangeCrosshairLockedOnData()) {
                    crosshairState.updateCrosshairY(transY);
                }
            }
        }

        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, antiAlias);
    }

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

    @Override
    public void handleClick(int x, int y, PlotRenderingInfo info) {
        // No implementation required.
    }

    @Override
    public void zoom(double percent) {
        if (percent > 0) {
            // Zoom logic not implemented.
        } else {
            getRangeAxis().setAutoRange(true);
            getDomainAxis().setAutoRange(true);
        }
    }

    @Override
    public String getPlotType() {
        return localizationResources.getString("Contour_Plot");
    }

    @Override
    public Range getDataRange(ValueAxis axis) {
        if (this.dataset == null) {
            return null;
        }

        Range result = null;

        if (axis == getDomainAxis()) {
            result = DatasetUtilities.findDomainBounds(this.dataset);
        } else if (axis == getRangeAxis()) {
            result = DatasetUtilities.findRangeBounds(this.dataset);
        }
        return result;
    }

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

    @Override
    public void propertyChange(PropertyChangeEvent event) {
        fireChangeEvent();
    }

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

    public ColorBar getColorBar() {
        return this.colorBar;
    }

    public boolean isDomainCrosshairVisible() {
        return this.domainCrosshairVisible;
    }

    public void setDomainCrosshairVisible(boolean flag) {
        if (this.domainCrosshairVisible != flag) {
            this.domainCrosshairVisible = flag;
            fireChangeEvent();
        }
    }

    public boolean isDomainCrosshairLockedOnData() {
        return this.domainCrosshairLockedOnData;
    }

    public void setDomainCrosshairLockedOnData(boolean flag) {
        if (this.domainCrosshairLockedOnData != flag) {
            this.domainCrosshairLockedOnData = flag;
            fireChangeEvent();
        }
    }

    public double getDomainCrosshairValue() {
        return this.domainCrosshairValue;
    }

    public void setDomainCrosshairValue(double value) {
        setDomainCrosshairValue(value, true);
    }

    public void setDomainCrosshairValue(double value, boolean notify) {
        this.domainCrosshairValue = value;
        if (isDomainCrosshairVisible() && notify) {
            fireChangeEvent();
        }
    }

    public Stroke getDomainCrosshairStroke() {
        return this.domainCrosshairStroke;
    }

    public void setDomainCrosshairStroke(Stroke stroke) {
        this.domainCrosshairStroke = stroke;
        fireChangeEvent();
    }

    public Paint getDomainCrosshairPaint() {
        return this.domainCrosshairPaint;
    }

    public void setDomainCrosshairPaint(Paint paint) {
        this.domainCrosshairPaint = paint;
        fireChangeEvent();
    }

    public boolean isRangeCrosshairVisible() {
        return this.rangeCrosshairVisible;
    }

    public void setRangeCrosshairVisible(boolean flag) {
        if (this.rangeCrosshairVisible != flag) {
            this.rangeCrosshairVisible = flag;
            fireChangeEvent();
        }
    }

    public boolean isRangeCrosshairLockedOnData() {
        return this.rangeCrosshairLockedOnData;
    }

    public void setRangeCrosshairLockedOnData(boolean flag) {
        if (this.rangeCrosshairLockedOnData != flag) {
            this.rangeCrosshairLockedOnData = flag;
            fireChangeEvent();
        }
    }

    public double getRangeCrosshairValue() {
        return this.rangeCrosshairValue;
    }

    public void setRangeCrosshairValue(double value) {
        setRangeCrosshairValue(value, true);
    }

    public void setRangeCrosshairValue(double value, boolean notify) {
        this.rangeCrosshairValue = value;
        if (isRangeCrosshairVisible() && notify) {
            fireChangeEvent();
        }
    }

    public Stroke getRangeCrosshairStroke() {
        return this.rangeCrosshairStroke;
    }

    public void setRangeCrosshairStroke(Stroke stroke) {
        this.rangeCrosshairStroke = stroke;
        fireChangeEvent();
    }

    public Paint getRangeCrosshairPaint() {
        return this.rangeCrosshairPaint;
    }

    public void setRangeCrosshairPaint(Paint paint) {
        this.rangeCrosshairPaint = paint;
        fireChangeEvent();
    }

    public ContourToolTipGenerator getToolTipGenerator() {
        return this.toolTipGenerator;
    }

    public void setToolTipGenerator(ContourToolTipGenerator generator) {
        this.toolTipGenerator = generator;
    }

    public XYURLGenerator getURLGenerator() {
        return this.urlGenerator;
    }

    public void setURLGenerator(XYURLGenerator urlGenerator) {
        this.urlGenerator = urlGenerator;
    }

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

    public ClipPath getClipPath() {
        return this.clipPath;
    }

    public void setClipPath(ClipPath clipPath) {
        this.clipPath = clipPath;
    }

    public double getPtSizePct() {
        return this.ptSizePct;
    }

    public boolean isRenderAsPoints() {
        return this.renderAsPoints;
    }

    public void setPtSizePct(double ptSizePct) {
        this.ptSizePct = ptSizePct;
    }

    public void setRenderAsPoints(boolean renderAsPoints) {
        this.renderAsPoints = renderAsPoints;
    }

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

    public Range visibleRange(ContourDataset data, Range x, Range y) {
        return data.getZValueRange(x, y);
    }

    public Paint getMissingPaint() {
        return this.missingPaint;
    }

    public void setMissingPaint(Paint paint) {
        this.missingPaint = paint;
    }

    public void zoomDomainAxes(double x, double y, double factor) {
        // TODO: to be implemented
    }

    public void zoomDomainAxes(double x, double y, double lowerPercent,
                               double upperPercent) {
        // TODO: to be implemented
    }

    public void zoomRangeAxes(double x, double y, double factor) {
        // TODO: to be implemented
    }

    public void zoomRangeAxes(double x, double y, double lowerPercent,
                              double upperPercent) {
        // TODO: to be implemented
    }

    public boolean isDomainZoomable() {
        return false;
    }

    public boolean isRangeZoomable() {
        return false;
    }
}