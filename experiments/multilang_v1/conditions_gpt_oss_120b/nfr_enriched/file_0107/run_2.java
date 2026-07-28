/* ===========================================================
 * JFreeChart : a free chart library for the Java(tm) platform
 * ===========================================================
 *
 * (C) Copyright 2000-2013, by Object Refinery Limited and Contributors.
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
 * --------------
 * PolarPlot.java
 * --------------
 * (C) Copyright 2004-2013, by Solution Engineering, Inc. and Contributors.
 *
 * Original Author:  Daniel Bridenbecker, Solution Engineering, Inc.;
 * Contributor(s):   David Gilbert (for Object Refinery Limited);
 *                   Martin Hoeller (patches 1871902 and 2850344);
 *
 * Changes
 * -------
 * 19-Jan-2004 : Version 1, contributed by DB with minor changes by DG (DG);
 * 07-Apr-2004 : Changed text bounds calculation (DG);
 * 05-May-2005 : Updated draw() method parameters (DG);
 * 09-Jun-2005 : Fixed getDataRange() and equals() methods (DG);
 * 25-Oct-2005 : Implemented Zoomable (DG);
 * ------------- JFREECHART 1.0.x ---------------------------------------------
 * 07-Feb-2007 : Fixed bug 1599761, data value less than axis minimum (DG);
 * 21-Mar-2007 : Fixed serialization bug (DG);
 * 24-Sep-2007 : Implemented new zooming methods (DG);
 * 17-Feb-2007 : Added angle tick unit attribute (see patch 1871902 by
 *               Martin Hoeller) (DG);
 * 18-Dec-2008 : Use ResourceBundleWrapper - see patch 1607918 by
 *               Jess Thrysoee (DG);
 * 03-Sep-2009 : Applied patch 2850344 by Martin Hoeller (DG);
 * 27-Nov-2009 : Added support for multiple datasets, renderers and axes (DG);
 * 09-Dec-2009 : Extended getLegendItems() to handle multiple datasets (DG);
 * 25-Jun-2010 : Better support for multiple axes (MH);
 * 03-Oct-2011 : Added support for angleOffset and direction (MH);
 * 12-Nov-2011 : Fixed bug 3432721, log-axis doesn't work (MH);
 * 12-Dec-2011 : Added support for radiusMinorGridlinesVisible (MH);
 * 02-Jul-2013 : Use ParamChecks (DG);
 * 05-Jul-2013 : Fire change event from setRadiusMinorGridlinesVisible (DG);
 * 
 */

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
        RendererChangeListener, Cloneable, Serializable {

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
     * Copy constructor that creates a deep copy of the supplied plot.
     *
     * @param source  the plot to copy (must not be {@code null}).
     */
    public PolarPlot(PolarPlot source) {
        super(source);
        copyAxes(source);
        copyDatasets(source);
        copyRenderers(source);
        copyOtherFields(source);
    }

    /** Copies axis objects from the source plot. */
    private void copyAxes(PolarPlot source) {
        this.axes = new ObjectList();
        for (int i = 0; i < source.axes.size(); i++) {
            ValueAxis axis = (ValueAxis) source.axes.get(i);
            if (axis != null) {
                ValueAxis clonedAxis = (ValueAxis) axis.clone();
                clonedAxis.setPlot(this);
                clonedAxis.addChangeListener(this);
                this.axes.add(clonedAxis);
            } else {
                this.axes.add(null);
            }
        }
        this.axisLocations = (ObjectList) ObjectUtilities.clone(source.axisLocations);
    }

    /** Copies dataset references and registers listeners. */
    private void copyDatasets(PolarPlot source) {
        this.datasets = new ObjectList();
        for (int i = 0; i < source.datasets.size(); i++) {
            XYDataset ds = (XYDataset) source.datasets.get(i);
            this.datasets.add(ds);
            if (ds != null) {
                ds.addChangeListener(this);
            }
        }
    }

    /** Copies renderer objects, cloning when possible. */
    private void copyRenderers(PolarPlot source) {
        this.renderers = new ObjectList();
        for (int i = 0; i < source.renderers.size(); i++) {
            PolarItemRenderer r = (PolarItemRenderer) source.renderers.get(i);
            if (r instanceof PublicCloneable) {
                PolarItemRenderer rc = (PolarItemRenderer) ((PublicCloneable) r).clone();
                rc.setPlot(this);
                rc.addChangeListener(this);
                this.renderers.add(rc);
            } else {
                this.renderers.add(r);
            }
        }
    }

    /** Copies remaining simple fields and collections. */
    private void copyOtherFields(PolarPlot source) {
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
        this.datasetToAxesMap = new TreeMap(source.datasetToAxesMap);
        this.cornerTextItems = new ArrayList(source.cornerTextItems);
    }

    /**
     * Returns the plot type as a string.
     *
     * @return A short string describing the type of plot.
     */
    @Override
    public String getPlotType() {
       return PolarPlot.localizationResources.getString("Polar_Plot");
    }

    // -------------------------------------------------------------------------
    // Existing getters, setters and other methods (unchanged) ...
    // -------------------------------------------------------------------------

    // ... [All other methods from the original file remain unchanged] ...

    /**
     * Returns a clone of the plot.
     *
     * @return A clone.
     *
     * @throws CloneNotSupportedException  this can occur if some component of
     *         the plot cannot be cloned.
     */
    @Override
    public Object clone() throws CloneNotSupportedException {
        // Delegates to the copy constructor for a deep copy.
        return new PolarPlot(this);
    }

    /**
     * Provides serialization support.
     *
     * @param stream  the output stream.
     *
     * @throws IOException  if there is an I/O error.
     */
    private void writeObject(ObjectOutputStream stream) throws IOException {
        stream.defaultWriteObject();
        SerialUtilities.writeStroke(this.angleGridlineStroke, stream);
        SerialUtilities.writePaint(this.angleGridlinePaint, stream);
        SerialUtilities.writeStroke(this.radiusGridlineStroke, stream);
        SerialUtilities.writePaint(this.radiusGridlinePaint, stream);
        SerialUtilities.writePaint(this.angleLabelPaint, stream);
    }

    /**
     * Provides serialization support.
     *
     * @param stream  the input stream.
     *
     * @throws IOException  if there is an I/O error.
     * @throws ClassNotFoundException  if there is a classpath problem.
     */
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

    // -------------------------------------------------------------------------
    // Remaining methods (zoom, orientation, translation, etc.) unchanged.
    // -------------------------------------------------------------------------

    // ... [All remaining methods from the original file remain unchanged] ...

}