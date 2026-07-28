/* ===========================================================
 * JFreeChart : a free chart library for the Java(tm) platform
 * ===========================================================
 *
 * (C) Copyright 2000-2014, by Object Refinery Limited and Contributors.
 *
 * Project Info:  http://www.jfree.org/jfreechart/index.html
 *
 * This library is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public
 * License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301,
 * USA.
 *
 * [Oracle and Java are registered trademarks of Oracle and/or its affiliates. 
 * Other names may be trademarks of their respective owners.]
 *
 * ----------------
 * ContourPlot.java
 * ----------------
 * (C) Copyright 2002-2014, by David M. O'Donnell and Contributors.
 *
 * Original Author:  David M. O'Donnell;
 * Contributor(s):   David Gilbert (for Object Refinery Limited);
 *                   Arnaud Lelievre;
 *                   Nicolas Brodu;
 *
 * Changes
 * -------
 * 26-Nov-2002 : Version 1 contributed by David M. O'Donnell (DG);
 * 14-Jan-2003 : Added crosshair attributes (DG);
 * 23-Jan-2003 : Removed two constructors (DG);
 * 21-Mar-2003 : Bug fix 701744 (DG);
 * 26-Mar-2003 : Implemented Serializable (DG);
 * 09-Jul-2003 : Changed ColorBar from extending axis classes to enclosing
 *               them (DG);
 * 05-Aug-2003 : Applied changes in bug report 780298 (DG);
 * 08-Sep-2003 : Added internationalization via use of properties
 *               resourceBundle (RFE 690236) (AL);
 * 11-Sep-2003 : Cloning support (NB);
 * 16-Sep-2003 : Changed ChartRenderingInfo --> PlotRenderingInfo (DG);
 * 17-Jan-2004 : Removed references to DefaultContourDataset class, replaced
 *               with ContourDataset interface (with changes to the interface).
 *               See bug 741048 (DG);
 * 21-Jan-2004 : Update for renamed method in ValueAxis (DG);
 * 25-Feb-2004 : Replaced CrosshairInfo with CrosshairState (DG);
 * 06-Oct-2004 : Updated for changes in DatasetUtilities class (DG);
 * 11-Nov-2004 : Renamed zoom methods to match ValueAxisPlot interface (DG);
 * 25-Nov-2004 : Small update to clone() implementation (DG);
 * 11-Jan-2005 : Removed deprecated code in preparation for 1.0.0 release (DG);
 * 05-May-2005 : Updated draw() method parameters (DG);
 * 16-Jun-2005 : Added default constructor (DG);
 * 01-Sep-2005 : Moved dataAreaRatio from Plot to here (DG);
 * ------------- JFREECHART 1.0.x ---------------------------------------------
 * 31-Jan-2007 : Deprecated (DG);
 * 18-Dec-2008 : Use ResourceBundleWrapper - see patch 1607918 by
 *               Jess Thrysoee (DG);
 * 19-May-2009 : Fixed FindBugs warnings, patch by Michal Wozniak (DG);
 * 02-Jul-2013 : Fix NB warnings (DG);
 *
 */

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
     * Copy constructor used by {@link #clone()}.
     *
     * @param source  the source plot to copy.
     */
    public ContourPlot(ContourPlot source) {
        super();

        // simple fields
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
        this.toolTipGenerator = source.toolTipGenerator;
        this.urlGenerator = source.urlGenerator;
        this.missingPaint = source.missingPaint;
        this.colorBarLocation = source.colorBarLocation;

        // axes
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

        // dataset
        this.dataset = source.dataset;
        if (this.dataset != null) {
            this.dataset.addChangeListener(this);
        }

        // color bar
        if (source.colorBar != null) {
            this.colorBar = (ColorBar) source.colorBar.clone();
        }

        // collections
        this.domainMarkers = (List) ObjectUtilities.deepClone(source.domainMarkers);
        this.rangeMarkers = (List) ObjectUtilities.deepClone(source.rangeMarkers);
        this.annotations = (List) ObjectUtilities.deepClone(source.annotations);

        // clip path
        if (source.clipPath != null) {
            this.clipPath = (ClipPath) source.clipPath.clone();
        }
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

        if (isTooSmall(area)) {
            return;
        }

        recordPlotArea(info, area);
        Rectangle2D dataArea = calculateDataArea(g2, area);
        adjustDataAreaRatioIfNeeded(dataArea);
        if (info != null) {
            info.setDataArea(dataArea);
        }

        CrosshairState crosshairState = createCrosshairState();
        drawBackground(g2, dataArea);
        drawAxes(g2, dataArea, info);
        renderAndClip(g2, dataArea, info, crosshairState);
        drawMarkers(g2, dataArea);
        restoreClipAndComposite(g2);
        drawOutline(g2, dataArea);
    }

    /** Checks whether the supplied area is too small to draw. */
    private boolean isTooSmall(Rectangle2D area) {
        return (area.getWidth() <= MINIMUM_WIDTH_TO_DRAW)
                || (area.getHeight() <= MINIMUM_HEIGHT_TO_DRAW);
    }

    /** Records the plot area in the supplied info object. */
    private void recordPlotArea(PlotRenderingInfo info, Rectangle2D area) {
        if (info != null) {
            info.setPlotArea(area);
        }
    }

    /** Calculates the data area after reserving space for axes and color bar. */
    private Rectangle2D calculateDataArea(Graphics2D g2, Rectangle2D area) {
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
        return dataArea;
    }

    /** Adjusts the data area according to the dataAreaRatio property. */
    private void adjustDataAreaRatioIfNeeded(Rectangle2D dataArea) {
        if (getDataAreaRatio() == 0.0) {
            return;
        }
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

    /** Creates a new CrosshairState with infinite distance. */
    private CrosshairState createCrosshairState() {
        CrosshairState state = new CrosshairState();
        state.setCrosshairDistance(Double.POSITIVE_INFINITY);
        return state;
    }

    /** Draws the domain, range and color bar axes. */
    private void drawAxes(Graphics2D g2, Rectangle2D dataArea,
                          PlotRenderingInfo info) {
        double cursor = dataArea.getMaxY();
        if (this.domainAxis != null) {
            this.domainAxis.draw(g2, cursor, dataArea, dataArea,
                    RectangleEdge.BOTTOM, info);
        }
        if (this.rangeAxis != null) {
            cursor = dataArea.getMinX();
            this.rangeAxis.draw(g2, cursor, dataArea, dataArea,
                    RectangleEdge.LEFT, info);
        }
        if (this.colorBar != null) {
            this.colorBar.draw(g2, 0.0, dataArea, dataArea,
                    this.colorBar.getAxis().getRange(), this.colorBarLocation);
        }
    }

    /** Renders the data and applies clipping if required. */
    private void renderAndClip(Graphics2D g2, Rectangle2D dataArea,
                               PlotRenderingInfo info,
                               CrosshairState crosshairState) {
        Shape originalClip = g2.getClip();
        Composite originalComposite = g2.getComposite();

        g2.clip(dataArea);
        g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER,
                getForegroundAlpha()));
        render(g2, dataArea, info, crosshairState);

        g2.setClip(originalClip);
        g2.setComposite(originalComposite);
    }

    /** Draws domain and range markers. */
    private void drawMarkers(Graphics2D g2, Rectangle2D dataArea) {
        if (this.domainMarkers != null) {
            for (Object obj : this.domainMarkers) {
                drawDomainMarker(g2, this, getDomainAxis(),
                        (Marker) obj, dataArea);
            }
        }
        if (this.rangeMarkers != null) {
            for (Object obj : this.rangeMarkers) {
                drawRangeMarker(g2, this, getRangeAxis(),
                        (Marker) obj, dataArea);
            }
        }
    }

    /** Restores the original clip and composite after rendering. */
    private void restoreClipAndComposite(Graphics2D g2) {
        // No action needed; the clip and composite are restored in renderAndClip.
    }

    /**
     * Draws a representation of the data within the dataArea region, using the
     * current renderer.
     *
     * @param g2  the graphics device.
     * @param dataArea  the region in which the data is to be drawn.
     * @param info  an optional object for collection dimension information.
     * @param crosshairState  an optional object for collecting crosshair info.
     */
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

    /**
     * Fills the plot.
     *
     * @param g2  the graphics device.
     * @param dataArea  the area within which the data is being drawn.
     * @param info  collects information about the drawing.
     * @param plot  the plot (can be used to obtain standard color
     *              information etc).
     * @param horizontalAxis  the domain (horizontal) axis.
     * @param verticalAxis  the range (vertical) axis.
     * @param colorBar  the color bar axis.
     * @param data  the dataset.
     * @param crosshairState  information about crosshairs on a plot.
     */
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

        for (int k = 0; k < x.length; k++) {
            processContourCell(g2, dataArea, plot, horizontalAxis, verticalAxis,
                    colorBar, data, crosshairState, entities, rect,
                    x, y, zNumber, xIndex, indexX, vertInverted,
                    horizInverted, k);
        }

        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, antiAlias);
    }

    /** Processes a single cell in the contour renderer. */
    private void processContourCell(Graphics2D g2,
                                    Rectangle2D dataArea,
                                    ContourPlot plot,
                                    ValueAxis horizontalAxis,
                                    ValueAxis verticalAxis,
                                    ColorBar colorBar,
                                    ContourDataset data,
                                    CrosshairState crosshairState,
                                    EntityCollection entities,
                                    Rectangle2D.Double rect,
                                    double[] x,
                                    double[] y,
                                    Number[] zNumber,
                                    int[] xIndex,
                                    int[] indexX,
                                    boolean vertInverted,
                                    boolean horizInverted,
                                    int k) {

        double transX, transY, transDX, transDY;
        double transXm1, transXp1, transDXm1, transDXp1 = 0.0;
        double transYm1, transYp1, transDYm1, transDYp1 = 0.0;
        int i = xIndex[k];
        int iMax = xIndex[xIndex.length - 1];

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

            transX -= horizInverted ? transDXp1 : transDXm1;
            transDX = transDXm1 + transDXp1;

            transY = verticalAxis.valueToJava2D(y[k], dataArea,
                    RectangleEdge.LEFT);
            transYm1 = transY;
            if (k + 1 < y.length) {
                transYp1 = verticalAxis.valueToJava2D(y[k + 1], dataArea,
                        RectangleEdge.LEFT);
                transDYm1 = Math.abs(0.5 * (transY - transYm1));
                transDYp1 = Math.abs(0.5 * (transY - transYp1));
            }
        } else if ((i < indexX.length - 1 && indexX[i + 1] - 1 == k)
                || k == x.length - 1) {
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

        transY -= vertInverted ? transDYm1 : transDYp1;
        transDY = transDYm1 + transDYp1;

        rect.setRect(transX, transY, transDX, transDY);
        if (zNumber[k] != null) {
            g2.setPaint(colorBar.getPaint(zNumber[k].doubleValue()));
            g2.fill(rect);
        } else if (this.missingPaint != null) {
            g2.setPaint(this.missingPaint);
            g2.fill(rect);
        }

        if (entities != null) {
            String tip = "";
            if (getToolTipGenerator() != null) {
                tip = this.toolTipGenerator.generateToolTip(data, k);
            }
            ContourEntity entity = new ContourEntity(
                    (Rectangle2D.Double) rect.clone(), tip, null);
            entity.setIndex(k);
            entities.add(entity);
        }

        updateCrosshairForCell(plot, crosshairState, x, y, transX, transY, k);
    }

    /** Updates crosshair state based on the current cell. */
    private void updateCrosshairForCell(ContourPlot plot,
                                        CrosshairState crosshairState,
                                        double[] x, double[] y,
                                        double transX, double transY,
                                        int k) {
        if (plot.isDomainCrosshairLockedOnData()) {
            if (plot.isRangeCrosshairLockedOnData()) {
                crosshairState.updateCrosshairPoint(x[k], y[k], transX,
                        transY, PlotOrientation.VERTICAL);
            } else {
                crosshairState.updateCrosshairX(transX);
            }
        } else if (plot.isRangeCrosshairLockedOnData()) {
            crosshairState.updateCrosshairY(transY);
        }
    }

    /**
     * Draws the visual representation of a single data item.
     *
     * @param g2  the graphics device.
     * @param dataArea  the area within which the data is being drawn.
     * @param info  collects information about the drawing.
     * @param plot  the plot (can be used to obtain standard color
     *              information etc).
     * @param domainAxis  the domain (horizontal) axis.
     * @param rangeAxis  the range (vertical) axis.
     * @param colorBar  the color bar axis.
     * @param data  the dataset.
     * @param crosshairState  information about crosshairs on a plot.
     */
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

        double size = dataArea.getWidth() * this.ptSizePct;
        for (int k = 0; k < x.length; k++) {
            double transX = domainAxis.valueToJava2D(x[k], dataArea,
                    RectangleEdge.BOTTOM) - 0.5 * size;
            double transY = rangeAxis.valueToJava2D(y[k], dataArea,
                    RectangleEdge.LEFT) - 0.5 * size;
            rect.setFrame(transX, transY, size, size);

            if (zNumber[k] != null) {
                g2.setPaint(colorBar.getPaint(zNumber[k].doubleValue()));
                g2.fill(rect);
            } else if (this.missingPaint != null) {
                g2.setPaint(this.missingPaint);
                g2.fill(rect);
            }

            if (entities != null) {
                String tip = null;
                if (getToolTipGenerator() != null) {
                    tip = this.toolTipGenerator.generateToolTip(data, k);
                }
                ContourEntity entity = new ContourEntity(
                        (RectangularShape) rect.clone(), tip, null);
                entity.setIndex(k);
                entities.add(entity);
            }

            updateCrosshairForCell(plot, crosshairState, x, y, transX, transY, k);
        }

        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, antiAlias);
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
        // Method intentionally left blank (legacy implementation).
    }

    /**
     * Zooms the axis ranges by the specified percentage about the anchor point.
     *
     * @param percent  The amount of the zoom.
     */
    @Override
    public void zoom(double percent) {

        if (percent > 0) {
            // Zoom logic not implemented.
        } else {
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

        if (axis == getDomainAxis()) {
            return DatasetUtilities.findDomainBounds(this.dataset);
        } else if (axis == getRangeAxis()) {
            return DatasetUtilities.findRangeBounds(this.dataset);
        }
        return null;
    }

    /**
     * Returns the range for the Contours.
     *
     * @return The range for the Contours (z-axis).
     */
    @Override
    public Range getContourDataRange() {
        ContourDataset data = getDataset();
        if (data != null) {
            Range h = getDomainAxis().getRange();
            Range v = getRangeAxis().getRange();
            return this.visibleRange(data, h, v);
        }
        return null;
    }

    /**
     * Notifies all registered listeners of a property change.
     *
     * @param event  Information about the property change.
     */
    @Override
    public void propertyChange(PropertyChangeEvent event) {
        fireChangeEvent();
    }

    /**
     * Receives notification of a change to the plot's dataset.
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
     *
     * @param value  the new value.
     */
    public void setDomainCrosshairValue(double value) {
        setDomainCrosshairValue(value, true);
    }

    /**
     * Sets the domain crosshair value.
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
     * Sets the range crosshair value.
     *
     * @param value  the new value.
     */
    public void setRangeCrosshairValue(double value) {
        setRangeCrosshairValue(value, true);
    }

    /**
     * Sets the range crosshair value.
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
        return data.getZValueRange(x, y);
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
     * Extends plot cloning to this plot type.
     *
     * @return a copy of this plot.
     */
    @Override
    public Object clone() throws CloneNotSupportedException {
        return new ContourPlot(this);
    }

}