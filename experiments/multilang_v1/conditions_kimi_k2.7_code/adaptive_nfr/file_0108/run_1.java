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
 * ---------------------------
 * AbstractXYItemRenderer.java
 * ---------------------------
 * (C) Copyright 2002-2014, by Object Refinery Limited and Contributors.
 *
 * Original Author:  David Gilbert (for Object Refinery Limited);
 * Contributor(s):   Richard Atkinson;
 *                   Focus Computer Services Limited;
 *                   Tim Bardzil;
 *                   Sergei Ivanov;
 *                   Peter Kolb (patch 2809117);
 *                   Martin Krauskopf;
 *
 * Changes:
 * --------
 * 15-Mar-2002 : Version 1 (DG);
 * 09-Apr-2002 : Added a getToolTipGenerator() method reflecting the change in
 *               the XYItemRenderer interface (DG);
 * 05-Aug-2002 : Added a urlGenerator member variable to support HTML image
 *               maps (RA);
 * 20-Aug-2002 : Added property change events for the tooltip and URL
 *               generators (DG);
 * 22-Aug-2002 : Moved property change support into AbstractRenderer class (DG);
 * 23-Sep-2002 : Fixed errors reported by Checkstyle tool (DG);
 * 18-Nov-2002 : Added methods for drawing grid lines (DG);
 * 17-Jan-2003 : Moved plot classes into a separate package (DG);
 * 25-Mar-2003 : Implemented Serializable (DG);
 * 01-May-2003 : Modified initialise() return type and drawItem() method
 *               signature (DG);
 * 15-May-2003 : Modified to take into account the plot orientation (DG);
 * 21-May-2003 : Added labels to markers (DG);
 * 05-Jun-2003 : Added domain and range grid bands (sponsored by Focus Computer
 *               Services Ltd) (DG);
 * 27-Jul-2003 : Added getRangeType() to support stacked XY area charts (RA);
 * 31-Jul-2003 : Deprecated all but the default constructor (DG);
 * 13-Aug-2003 : Implemented Cloneable (DG);
 * 16-Sep-2003 : Changed ChartRenderingInfo --> PlotRenderingInfo (DG);
 * 29-Oct-2003 : Added workaround for font alignment in PDF output (DG);
 * 05-Nov-2003 : Fixed marker rendering bug (833623) (DG);
 * 11-Feb-2004 : Updated labelling for markers (DG);
 * 25-Feb-2004 : Added updateCrosshairValues() method.  Moved deprecated code
 *               to bottom of source file (DG);
 * 16-Apr-2004 : Added support for IntervalMarker in drawRangeMarker() method
 *               - thanks to Tim Bardzil (DG);
 * 05-May-2004 : Fixed bug (948310) where interval markers extend beyond axis
 *               range (DG);
 * 03-Jun-2004 : Fixed more bugs in drawing interval markers (DG);
 * 26-Aug-2004 : Added the addEntity() method (DG);
 * 29-Sep-2004 : Added annotation support (with layers) (DG);
 * 30-Sep-2004 : Moved drawRotatedString() from RefineryUtilities -->
 *               TextUtilities (DG);
 * 06-Oct-2004 : Added findDomainBounds() method and renamed
 *               getRangeExtent() --> findRangeBounds() (DG);
 * 07-Jan-2005 : Removed deprecated code (DG);
 * 27-Jan-2005 : Modified getLegendItem() to omit hidden series (DG);
 * 24-Feb-2005 : Added getLegendItems() method (DG);
 * 08-Mar-2005 : Fixed positioning of marker labels (DG);
 * 20-Apr-2005 : Renamed XYLabelGenerator --> XYItemLabelGenerator and
 *               added generators for legend labels, tooltips and URLs (DG);
 * 01-Jun-2005 : Handle one dimension of the marker label adjustment
 *               automatically (DG);
 * ------------- JFREECHART 1.0.x ---------------------------------------------
 * 20-Jul-2006 : Set dataset and series indices in LegendItem (DG);
 * 24-Oct-2006 : Respect alpha setting in markers (see patch 1567843 by Sergei
 *               Ivanov) (DG);
 * 24-Oct-2006 : Added code to draw outlines for interval markers (DG);
 * 24-Nov-2006 : Fixed cloning for legend item generators (DG);
 * 06-Feb-2007 : Added new updateCrosshairValues() method that takes into
 *               account multiple axis plots (see bug 1086307) (DG);
 * 20-Feb-2007 : Fixed equals() method implementation (DG);
 * 01-Mar-2007 : Fixed interval marker drawing (patch 1670686 thanks to
 *               Sergei Ivanov) (DG);
 * 22-Mar-2007 : Modified the tool tip generator look up (DG);
 * 23-Mar-2007 : Added drawDomainLine() method (DG);
 * 20-Apr-2007 : Updated getLegendItem() for renderer change, and deprecated
 *               itemLabelGenerator and toolTipGenerator override fields (DG);
 * 18-May-2007 : Set dataset and seriesKey for LegendItem (DG);
 * 12-Nov-2007 : Fixed domain and range band drawing methods (DG);
 * 07-Apr-2008 : Minor API doc update (DG);
 * 14-May-2008 : Updated addEntity() method to take plot orientation into
 *               account when the incoming area is null (DG);
 * 02-Jun-2008 : Added isPointInRect() method (DG);
 * 17-Jun-2008 : Apply legend shape, font and paint attributes (DG);
 * 09-Mar-2009 : Added getAnnotations() method (DG);
 * 27-Mar-2009 : Added new findDomainBounds() and findRangeBounds() methods to
 *               take account of hidden series (DG);
 * 01-Apr-2009 : Moved defaultEntityRadius up to superclass (DG);
 * 28-Apr-2009 : Updated getLegendItem() method to observe new
 *               'treatLegendShapeAsLine' flag (DG);
 * 24-Jun-2009 : Added support for annotation events - see patch 2809117
 *               by PK (DG);
 * 01-Sep-2009 : Bug 2840132 - set renderer index when drawing
 *               annotations (DG);
 * 06-Oct-2011 : Add utility methods to work with 1.4 API in GeneralPath (MK)
 * 03-Jul-2013 : Use ParamChecks (DG);
 * 11-Jan-2014 : Fix error in fillDomainGridBand method (DG);
 * 07-Apr-2014 : Don't use ObjectList anymore (DG);
 * 29-Jul-2014 : Add rendering hint to normalise domain and range lines (DG);
 * 
 */

package org.jfree.chart.renderer.xy;

import java.awt.AlphaComposite;
import java.awt.Composite;
import java.awt.Font;
import java.awt.GradientPaint;
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
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import org.jfree.chart.LegendItem;
import org.jfree.chart.LegendItemCollection;
import org.jfree.chart.annotations.Annotation;
import org.jfree.chart.annotations.XYAnnotation;
import org.jfree.chart.axis.ValueAxis;
import org.jfree.chart.entity.EntityCollection;
import org.jfree.chart.entity.XYItemEntity;
import org.jfree.chart.event.AnnotationChangeEvent;
import org.jfree.chart.event.AnnotationChangeListener;
import org.jfree.chart.event.RendererChangeEvent;
import org.jfree.chart.labels.ItemLabelPosition;
import org.jfree.chart.labels.StandardXYSeriesLabelGenerator;
import org.jfree.chart.labels.XYItemLabelGenerator;
import org.jfree.chart.labels.XYSeriesLabelGenerator;
import org.jfree.chart.labels.XYToolTipGenerator;
import org.jfree.chart.plot.CrosshairState;
import org.jfree.chart.plot.DrawingSupplier;
import org.jfree.chart.plot.IntervalMarker;
import org.jfree.chart.plot.Marker;
import org.jfree.chart.plot.Plot;
import org.jfree.chart.plot.PlotOrientation;
import org.jfree.chart.plot.PlotRenderingInfo;
import org.jfree.chart.plot.ValueMarker;
import org.jfree.chart.plot.XYPlot;
import org.jfree.chart.renderer.AbstractRenderer;
import org.jfree.chart.urls.XYURLGenerator;
import org.jfree.chart.util.CloneUtils;
import org.jfree.chart.util.ParamChecks;
import org.jfree.data.Range;
import org.jfree.data.general.DatasetUtilities;
import org.jfree.data.xy.XYDataset;
import org.jfree.text.TextUtilities;
import org.jfree.ui.GradientPaintTransformer;
import org.jfree.ui.Layer;
import org.jfree.ui.LengthAdjustmentType;
import org.jfree.ui.RectangleAnchor;
import org.jfree.ui.RectangleInsets;
import org.jfree.util.ObjectUtilities;
import org.jfree.util.PublicCloneable;

/**
 * A base class that can be used to create new {@link XYItemRenderer}
 * implementations.
 */
public abstract class AbstractXYItemRenderer extends AbstractRenderer
        implements XYItemRenderer, AnnotationChangeListener,
        Cloneable, Serializable {

    /** For serialization. */
    private static final long serialVersionUID = 8019124836026607990L;

    /** The plot. */
    private XYPlot plot;

    /** A list of item label generators (one per series). */
    private Map<Integer, XYItemLabelGenerator> itemLabelGeneratorMap;

    /** The base item label generator. */
    private XYItemLabelGenerator baseItemLabelGenerator;

    /** A list of tool tip generators (one per series). */
    private Map<Integer, XYToolTipGenerator> toolTipGeneratorMap;

    /** The base tool tip generator. */
    private XYToolTipGenerator baseToolTipGenerator;

    /** The URL text generator. */
    private XYURLGenerator urlGenerator;

    /**
     * Annotations to be drawn in the background layer ('underneath' the data
     * items).
     */
    private List backgroundAnnotations;

    /**
     * Annotations to be drawn in the foreground layer ('on top' of the data
     * items).
     */
    private List foregroundAnnotations;

    /** The legend item label generator. */
    private XYSeriesLabelGenerator legendItemLabelGenerator;

    /** The legend item tool tip generator. */
    private XYSeriesLabelGenerator legendItemToolTipGenerator;

    /** The legend item URL generator. */
    private XYSeriesLabelGenerator legendItemURLGenerator;

    /**
     * Creates a renderer where the tooltip generator and the URL generator are
     * both <code>null</code>.
     */
    protected AbstractXYItemRenderer() {
        super();
        this.itemLabelGenerator = null;
        this.itemLabelGeneratorMap 
                = new HashMap<Integer, XYItemLabelGenerator>();
        this.toolTipGenerator = null;
        this.toolTipGeneratorMap = new HashMap<Integer, XYToolTipGenerator>();
        this.urlGenerator = null;
        this.backgroundAnnotations = new java.util.ArrayList();
        this.foregroundAnnotations = new java.util.ArrayList();
        this.legendItemLabelGenerator = new StandardXYSeriesLabelGenerator(
                "{0}");
    }

    /**
     * Returns the number of passes through the data that the renderer requires
     * in order to draw the chart.  Most charts will require a single pass, but
     * some require two passes.
     *
     * @return The pass count.
     */
    @Override
    public int getPassCount() {
        return 1;
    }

    /**
     * Returns the plot that the renderer is assigned to.
     *
     * @return The plot (possibly <code>null</code>).
     */
    @Override
    public XYPlot getPlot() {
        return this.plot;
    }

    /**
     * Sets the plot that the renderer is assigned to.
     *
     * @param plot  the plot (<code>null</code> permitted).
     */
    @Override
    public void setPlot(XYPlot plot) {
        this.plot = plot;
    }

    /**
     * Initialises the renderer and returns a state object that should be
     * passed to all subsequent calls to the drawItem() method.
     * <P>
     * This method will be called before the first item is rendered, giving the
     * renderer an opportunity to initialise any state information it wants to
     * maintain.  The renderer can do nothing if it chooses.
     *
     * @param g2  the graphics device.
     * @param dataArea  the area inside the axes.
     * @param plot  the plot.
     * @param data  the data.
     * @param info  an optional info collection object to return data back to
     *              the caller.
     *
     * @return The renderer state (never <code>null</code>).
     */
    @Override
    public XYItemRendererState initialise(Graphics2D g2, Rectangle2D dataArea,
            XYPlot plot, XYDataset data, PlotRenderingInfo info) {
        return createInitialState(info);
    }

    /**
     * Creates the initial renderer state.
     *
     * @param info  the plot rendering info.
     *
     * @return The renderer state.
     */
    private XYItemRendererState createInitialState(PlotRenderingInfo info) {
        return new XYItemRendererState(info);
    }

    // ITEM LABEL GENERATOR

    /**
     * Returns the label generator for a data item.  This implementation simply
     * passes control to the {@link #getSeriesItemLabelGenerator(int)} method.
     * If, for some reason, you want a different generator for individual
     * items, you can override this method.
     *
     * @param series  the series index (zero based).
     * @param item  the item index (zero based).
     *
     * @return The generator (possibly <code>null</code>).
     */
    @Override
    public XYItemLabelGenerator getItemLabelGenerator(int series, int item) {
        // return the generator for ALL series, if there is one...
        if (this.itemLabelGenerator != null) {
            return this.itemLabelGenerator;
        }

        // otherwise look up the generator table
        XYItemLabelGenerator generator
            = (XYItemLabelGenerator) this.itemLabelGeneratorMap.get(series);
        if (generator == null) {
            generator = this.baseItemLabelGenerator;
        }
        return generator;
    }

    /**
     * Returns the item label generator for a series.
     *
     * @param series  the series index (zero based).
     *
     * @return The generator (possibly <code>null</code>).
     */
    @Override
    public XYItemLabelGenerator getSeriesItemLabelGenerator(int series) {
        return this.itemLabelGeneratorMap.get(series);
    }

    /**
     * Sets the item label generator for a series and sends a
     * {@link RendererChangeEvent} to all registered listeners.
     *
     * @param series  the series index (zero based).
     * @param generator  the generator (<code>null</code> permitted).
     */
    @Override
    public void setSeriesItemLabelGenerator(int series,
            XYItemLabelGenerator generator) {
        this.itemLabelGeneratorMap.put(series, generator);
        fireChangeEvent();
    }

    /**
     * Returns the base item label generator.
     *
     * @return The generator (possibly <code>null</code>).
     */
    @Override
    public XYItemLabelGenerator getBaseItemLabelGenerator() {
        return this.baseItemLabelGenerator;
    }

    /**
     * Sets the base item label generator and sends a
     * {@link RendererChangeEvent} to all registered listeners.
     *
     * @param generator  the generator (<code>null</code> permitted).
     */
    @Override
    public void setBaseItemLabelGenerator(XYItemLabelGenerator generator) {
        this.baseItemLabelGenerator = generator;
        fireChangeEvent();
    }

    // TOOL TIP GENERATOR

    /**
     * Returns the tool tip generator for a data item.  If, for some reason,
     * you want a different generator for individual items, you can override
     * this method.
     *
     * @param series  the series index (zero based).
     * @param item  the item index (zero based).
     *
     * @return The generator (possibly <code>null</code>).
     */
    @Override
    public XYToolTipGenerator getToolTipGenerator(int series, int item) {
        // return the generator for ALL series, if there is one...
        if (this.toolTipGenerator != null) {
            return this.toolTipGenerator;
        }

        // otherwise look up the generator table
        XYToolTipGenerator generator
                = (XYToolTipGenerator) this.toolTipGeneratorMap.get(series);
        if (generator == null) {
            generator = this.baseToolTipGenerator;
        }
        return generator;
    }

    /**
     * Returns the tool tip generator for a series.
     *
     * @param series  the series index (zero based).
     *
     * @return The generator (possibly <code>null</code>).
     */
    @Override
    public XYToolTipGenerator getSeriesToolTipGenerator(int series) {
        return this.toolTipGeneratorMap.get(series);
    }

    /**
     * Sets the tool tip generator for a series and sends a
     * {@link RendererChangeEvent} to all registered listeners.
     *
     * @param series  the series index (zero based).
     * @param generator  the generator (<code>null</code> permitted).
     */
    @Override
    public void setSeriesToolTipGenerator(int series,
            XYToolTipGenerator generator) {
        this.toolTipGeneratorMap.put(series, generator);
        fireChangeEvent();
    }

    /**
     * Returns the base tool tip generator.
     *
     * @return The generator (possibly <code>null</code>).
     *
     * @see #setBaseToolTipGenerator(XYToolTipGenerator)
     */
    @Override
    public XYToolTipGenerator getBaseToolTipGenerator() {
        return this.baseToolTipGenerator;
    }

    /**
     * Sets the base tool tip generator and sends a {@link RendererChangeEvent}
     * to all registered listeners.
     *
     * @param generator  the generator (<code>null</code> permitted).
     *
     * @see #getBaseToolTipGenerator()
     */
    @Override
    public void setBaseToolTipGenerator(XYToolTipGenerator generator) {
        this.baseToolTipGenerator = generator;
        fireChangeEvent();
    }

    // URL GENERATOR

    /**
     * Returns the URL generator for HTML image maps.
     *
     * @return The URL generator (possibly <code>null</code>).
     */
    @Override
    public XYURLGenerator getURLGenerator() {
        return this.urlGenerator;
    }

    /**
     * Sets the URL generator for HTML image maps and sends a
     * {@link RendererChangeEvent} to all registered listeners.
     *
     * @param urlGenerator  the URL generator (<code>null</code> permitted).
     */
    @Override
    public void setURLGenerator(XYURLGenerator urlGenerator) {
        this.urlGenerator = urlGenerator;
        fireChangeEvent();
    }

    /**
     * Adds an annotation and sends a {@link RendererChangeEvent} to all
     * registered listeners.  The annotation is added to the foreground
     * layer.
     *
     * @param annotation  the annotation (<code>null</code> not permitted).
     */
    @Override
    public void addAnnotation(XYAnnotation annotation) {
        // defer argument checking
        addAnnotation(annotation, Layer.FOREGROUND);
    }

    /**
     * Adds an annotation to the specified layer and sends a
     * {@link RendererChangeEvent} to all registered listeners.
     *
     * @param annotation  the annotation (<code>null</code> not permitted).
     * @param layer  the layer (<code>null</code> not permitted).
     */
    @Override
    public void addAnnotation(XYAnnotation annotation, Layer layer) {
        ParamChecks.nullNotPermitted(annotation, "annotation");
        if (layer.equals(Layer.FOREGROUND)) {
            this.foregroundAnnotations.add(annotation);
            annotation.addChangeListener(this);
            fireChangeEvent();
        }
        else if (layer.equals(Layer.BACKGROUND)) {
            this.backgroundAnnotations.add(annotation);
            annotation.addChangeListener(this);
            fireChangeEvent();
        }
        else {
            // should never get here
            throw new RuntimeException("Unknown layer.");
        }
    }
    /**
     * Removes the specified annotation and sends a {@link RendererChangeEvent}
     * to all registered listeners.
     *
     * @param annotation  the annotation to remove (<code>null</code> not
     *                    permitted).
     *
     * @return A boolean to indicate whether or not the annotation was
     *         successfully removed.
     */
    @Override
    public boolean removeAnnotation(XYAnnotation annotation) {
        boolean removed = this.foregroundAnnotations.remove(annotation);
        boolean removedFromBackground = this.backgroundAnnotations.remove(annotation);
        removed = removed && removedFromBackground;
        annotation.removeChangeListener(this);
        fireChangeEvent();
        return removed;
    }

    /**
     * Removes all annotations and sends a {@link RendererChangeEvent}
     * to all registered listeners.
     */
    @Override
    public void removeAnnotations() {
        for(int i = 0; i < this.foregroundAnnotations.size(); i++){
            XYAnnotation annotation 
                    = (XYAnnotation) this.foregroundAnnotations.get(i);
            annotation.removeChangeListener(this);
        }
         for(int i = 0; i < this.backgroundAnnotations.size(); i++){
            XYAnnotation annotation 
                    = (XYAnnotation) this.backgroundAnnotations.get(i);
            annotation.removeChangeListener(this);
        }
        this.foregroundAnnotations.clear();
        this.backgroundAnnotations.clear();
        fireChangeEvent();
    }


    /**
     * Receives notification of a change to an {@link Annotation} added to
     * this renderer.
     *
     * @param event  information about the event (not used here).
     *
     * @since 1.0.14
     */
    @Override
    public void annotationChanged(AnnotationChangeEvent event) {
        fireChangeEvent();
    }

    /**
     * Returns a collection of the annotations that are assigned to the
     * renderer.
     *
     * @return A collection of annotations (possibly empty but never
     *     <code>null</code>).
     * 
     * @since 1.0.13
     */
    public Collection getAnnotations() {
        List result = new java.util.ArrayList(this.foregroundAnnotations);
        result.addAll(this.backgroundAnnotations);
        return result;
    }

    /**
     * Returns the legend item label generator.
     *
     * @return The label generator (never <code>null</code>).
     *
     * @see #setLegendItemLabelGenerator(XYSeriesLabelGenerator)
     */
    @Override
    public XYSeriesLabelGenerator getLegendItemLabelGenerator() {
        return this.legendItemLabelGenerator;
    }

    /**
     * Sets the legend item label generator and sends a
     * {@link RendererChangeEvent} to all registered listeners.
     *
     * @param generator  the generator (<code>null</code> not permitted).
     *
     * @see #getLegendItemLabelGenerator()
     */
    @Override
    public void setLegendItemLabelGenerator(XYSeriesLabelGenerator generator) {
        ParamChecks.nullNotPermitted(generator, "generator");
        this.legendItemLabelGenerator = generator;
        fireChangeEvent();
    }

    /**
     * Returns the legend item tool tip generator.
     *
     * @return The tool tip generator (possibly <code>null</code>).
     *
     * @see #setLegendItemToolTipGenerator(XYSeriesLabelGenerator)
     */
    public XYSeriesLabelGenerator getLegendItemToolTipGenerator() {
        return this.legendItemToolTipGenerator;
    }

    /**
     * Sets the legend item tool tip generator and sends a
     * {@link RendererChangeEvent} to all registered listeners.
     *
     * @param generator  the generator (<code>null</code> permitted).
     *
     * @see #getLegendItemToolTipGenerator()
     */
    public void setLegendItemToolTipGenerator(
            XYSeriesLabelGenerator generator) {
        this.legendItemToolTipGenerator = generator;
        fireChangeEvent();
    }

    /**
     * Returns the legend item URL generator.
     *
     * @return The URL generator (possibly <code>null</code>).
     *
     * @see #setLegendItemURLGenerator(XYSeriesLabelGenerator)
     */
    public XYSeriesLabelGenerator getLegendItemURLGenerator() {
        return this.legendItemURLGenerator;
    }

    /**
     * Sets the legend item URL generator and sends a
     * {@link RendererChangeEvent} to all registered listeners.
     *
     * @param generator  the generator (<code>null</code> permitted).
     *
     * @see #getLegendItemURLGenerator()
     */
    public void setLegendItemURLGenerator(XYSeriesLabelGenerator generator) {
        this.legendItemURLGenerator = generator;
        fireChangeEvent();
    }

    /**
     * Returns the lower and upper bounds (range) of the x-values in the
     * specified dataset.
     *
     * @param dataset  the dataset (<code>null</code> permitted).
     *
     * @return The range (<code>null</code> if the dataset is <code>null</code>
     *         or empty).
     *
     * @see #findRangeBounds(XYDataset)
     */
    @Override
    public Range findDomainBounds(XYDataset dataset) {
        return findDomainBounds(dataset, false);
    }

    /**
     * Returns the lower and upper bounds (range) of the x-values in the
     * specified dataset.
     *
     * @param dataset  the dataset (<code>null</code> permitted).
     * @param includeInterval  include the interval (if any) for the dataset?
     *
     * @return The range (<code>null</code> if the dataset is <code>null</code>
     *         or empty).
     *
     * @since 1.0.13
     */
    protected Range findDomainBounds(XYDataset dataset,
            boolean includeInterval) {
        if (dataset == null) {
            return null;
        }
        if (getDataBoundsIncludesVisibleSeriesOnly()) {
            List visibleSeriesKeys = new ArrayList();
            int seriesCount = dataset.getSeriesCount();
            for (int s = 0; s < seriesCount; s++) {
                if (isSeriesVisible(s)) {
                    visibleSeriesKeys.add(dataset.getSeriesKey(s));
                }
            }
            return DatasetUtilities.findDomainBounds(dataset,
                    visibleSeriesKeys, includeInterval);
        }
        return DatasetUtilities.findDomainBounds(dataset, includeInterval);
    }

    /**
     * Returns the range of values the renderer requires to display all the
     * items from the specified dataset.
     *
     * @param dataset  the dataset (<code>null</code> permitted).
     *
     * @return The range (<code>null</code> if the dataset is <code>null</code>
     *         or empty).
     *
     * @see #findDomainBounds(XYDataset)
     */
    @Override
    public Range findRangeBounds(XYDataset dataset) {
        return findRangeBounds(dataset, false);
    }

    /**
     * Returns the range of values the renderer requires to display all the
     * items from the specified dataset.
     *
     * @param dataset  the dataset (<code>null</code> permitted).
     * @param includeInterval  include the interval (if any) for the dataset?
     *
     * @return The range (<code>null</code> if the dataset is <code>null</code>
     *         or empty).
     *
     * @since 1.0.13
     */
    protected Range findRangeBounds(XYDataset dataset,
            boolean includeInterval) {
        if (dataset == null) {
            return null;
        }
        if (getDataBoundsIncludesVisibleSeriesOnly()) {
            List visibleSeriesKeys = new ArrayList();
            int seriesCount = dataset.getSeriesCount();
            for (int s = 0; s < seriesCount; s++) {
                if (isSeriesVisible(s)) {
                    visibleSeriesKeys.add(dataset.getSeriesKey(s));
                }
            }
            // the bounds should be calculated using just the items within
            // the current range of the x-axis...if there is one
            Range xRange = null;
            XYPlot p = getPlot();
            if (p != null) {
                ValueAxis xAxis = null;
                int index = p.getIndexOf(this);
                if (index >= 0) {
                    xAxis = this.plot.getDomainAxisForDataset(index);
                }
                if (xAxis != null) {
                    xRange = xAxis.getRange();
                }
            }
            if (xRange == null) {
                xRange = new Range(Double.NEGATIVE_INFINITY,
                        Double.POSITIVE_INFINITY);
            }
            return DatasetUtilities.findRangeBounds(dataset,
                    visibleSeriesKeys, xRange, includeInterval);
        }
        return DatasetUtilities.findRangeBounds(dataset, includeInterval);
    }

    /**
     * Returns a (possibly empty) collection of legend items for the series
     * that this renderer is responsible for drawing.
     *
     * @return The legend item collection (never <code>null</code>).
     */
    @Override
    public LegendItemCollection getLegendItems() {
        if (this.plot == null) {
            return new LegendItemCollection();
        }
        LegendItemCollection result = new LegendItemCollection();
        int index = this.plot.getIndexOf(this);
        XYDataset dataset = this.plot.getDataset(index);
        if (dataset != null) {
            int seriesCount = dataset.getSeriesCount();
            for (int i = 0; i < seriesCount; i++) {
                if (isSeriesVisibleInLegend(i)) {
                    LegendItem item = getLegendItem(index, i);
                    if (item != null) {
                        result.add(item);
                    }
                }
            }

        }
        return result;
    }

    /**
     * Returns a default legend item for the specified series.  Subclasses
     * should override this method to generate customised items.
     *
     * @param datasetIndex  the dataset index (zero-based).
     * @param series  the series index (zero-based).
     *
     * @return A legend item for the series.
     */
    @Override
    public LegendItem getLegendItem(int datasetIndex, int series) {
        XYPlot xyplot = getPlot();
        if (xyplot == null) {
            return null;
        }
        XYDataset dataset = xyplot.getDataset(datasetIndex);
        if (dataset == null) {
            return null;
        }
        String label = this.legendItemLabelGenerator.generateLabel(dataset,
                series);
        String description = label;
        String toolTipText = null;
        if (getLegendItemToolTipGenerator() != null) {
            toolTipText = getLegendItemToolTipGenerator().generateLabel(
                    dataset, series);
        }
        String urlText = null;
        if (getLegendItemURLGenerator() != null) {
            urlText = getLegendItemURLGenerator().generateLabel(dataset,
                    series);
        }
        Shape shape = lookupLegendShape(series);
        Paint paint = lookupSeriesPaint(series);
        LegendItem item = new LegendItem(label, paint);
        item.setToolTipText(toolTipText);
        item.setURLText(urlText);
        item.setLabelFont(lookupLegendTextFont(series));
        Paint labelPaint = lookupLegendTextPaint(series);
        if (labelPaint != null) {
            item.setLabelPaint(labelPaint);
        }
        item.setSeriesKey(dataset.getSeriesKey(series));
        item.setSeriesIndex(series);
        item.setDataset(dataset);
        item.setDatasetIndex(datasetIndex);

        if (getTreatLegendShapeAsLine()) {
            item.setLineVisible(true);
            item.setLine(shape);
            item.setLinePaint(paint);
            item.setShapeVisible(false);
        }
        else {
            Paint outlinePaint = lookupSeriesOutlinePaint(series);
            Stroke outlineStroke = lookupSeriesOutlineStroke(series);
            item.setOutlinePaint(outlinePaint);
            item.setOutlineStroke(outlineStroke);
        }
        return item;
    }

    /**
     * Fills a band between two values on the axis.  This can be used to color
     * bands between the grid lines.
     *
     * @param g2  the graphics device.
     * @param plot  the plot.
     * @param axis  the domain axis.
     * @param dataArea  the data area.
     * @param start  the start value.
     * @param end  the end value.
     */
    @Override
    public void fillDomainGridBand(Graphics2D g2, XYPlot plot, ValueAxis axis,
            Rectangle2D dataArea, double start, double end) {
        fillDomainGridBand(new RenderContext(g2, plot, dataArea),
                new GridBandSpec(axis, start, end));
    }

    /**
     * Fills a domain grid band using the supplied context and band spec.
     *
     * @param context  the render context.
     * @param spec  the grid band spec.
     */
    private void fillDomainGridBand(RenderContext context, GridBandSpec spec) {
        double x1 = spec.axis.valueToJava2D(spec.start, context.dataArea,
                context.plot.getDomainAxisEdge());
        double x2 = spec.axis.valueToJava2D(spec.end, context.dataArea,
                context.plot.getDomainAxisEdge());
        Rectangle2D band;
        if (context.plot.getOrientation() == PlotOrientation.VERTICAL) {
            band = new Rectangle2D.Double(Math.min(x1, x2), context.dataArea.getMinY(),
                    Math.abs(x2 - x1), context.dataArea.getHeight());
        }
        else {
            band = new Rectangle2D.Double(context.dataArea.getMinX(), Math.min(x1, x2),
                    context.dataArea.getWidth(), Math.abs(x2 - x1));
        }
        Paint paint = context.plot.getDomainTickBandPaint();

        if (paint != null) {
            context.g2.setPaint(paint);
            context.g2.fill(band);
        }
    }

    /**
     * Fills a band between two values on the range axis.  This can be used to
     * color bands between the grid lines.
     *
     * @param g2  the graphics device.
     * @param plot  the plot.
     * @param axis  the range axis.
     * @param dataArea  the data area.
     * @param start  the start value.
     * @param end  the end value.
     */
    @Override
    public void fillRangeGridBand(Graphics2D g2, XYPlot plot, ValueAxis axis,
            Rectangle2D dataArea, double start, double end) {

        fillRangeGridBand(new RenderContext(g2, plot, dataArea),
                new GridBandSpec(axis, start, end));
    }

    /**
     * Fills a range grid band using the supplied context and band spec.
     *
     * @param context  the render context.
     * @param spec  the grid band spec.
     */
    private void fillRangeGridBand(RenderContext context, GridBandSpec spec) {
        double y1 = spec.axis.valueToJava2D(spec.start, context.dataArea,
                context.plot.getRangeAxisEdge());
        double y2 = spec.axis.valueToJava2D(spec.end, context.dataArea, context.plot.getRangeAxisEdge());
        Rectangle2D band;
        if (context.plot.getOrientation() == PlotOrientation.VERTICAL) {
            band = new Rectangle2D.Double(context.dataArea.getMinX(), Math.min(y1, y2),
                context.dataArea.getWidth(), Math.abs(y2 - y1));
        }
        else {
            band = new Rectangle2D.Double(Math.min(y1, y2), context.dataArea.getMinY(),
                    Math.abs(y2 - y1), context.dataArea.getHeight());
        }
        Paint paint = context.plot.getRangeTickBandPaint();

        if (paint != null) {
            context.g2.setPaint(paint);
            context.g2.fill(band);
        }
    }

    /**
     * Draws a grid line against the range axis.
     *
     * @param g2  the graphics device.
     * @param plot  the plot.
     * @param axis  the value axis.
     * @param dataArea  the area for plotting data (not yet adjusted for any
     *                  3D effect).
     * @param value  the value at which the grid line should be drawn.
     */
    @Override
    public void drawDomainGridLine(Graphics2D g2, XYPlot plot, ValueAxis axis,
            Rectangle2D dataArea, double value) {

        drawDomainGridLine(new RenderContext(g2, plot, dataArea),
                new GridLineSpec(axis, value));
    }

    /**
     * Draws a domain grid line using the supplied context and line spec.
     *
     * @param context  the render context.
     * @param spec  the grid line spec.
     */
    private void drawDomainGridLine(RenderContext context, GridLineSpec spec) {
        Range range = spec.axis.getRange();
        if (!range.contains(spec.value)) {
            return;
        }

        PlotOrientation orientation = context.plot.getOrientation();
        double v = spec.axis.valueToJava2D(spec.value, context.dataArea,
                context.plot.getDomainAxisEdge());
        Line2D line = null;
        if (orientation == PlotOrientation.HORIZONTAL) {
            line = new Line2D.Double(context.dataArea.getMinX(), v,
                    context.dataArea.getMaxX(), v);
        }
        else if (orientation == PlotOrientation.VERTICAL) {
            line = new Line2D.Double(v, context.dataArea.getMinY(), v,
                    context.dataArea.getMaxY());
        }

        Paint paint = context.plot.getDomainGridlinePaint();
        Stroke stroke = context.plot.getDomainGridlineStroke();
        context.g2.setPaint(paint != null ? paint : Plot.DEFAULT_OUTLINE_PAINT);
        context.g2.setStroke(stroke != null ? stroke : Plot.DEFAULT_OUTLINE_STROKE);
        Object saved = context.g2.getRenderingHint(RenderingHints.KEY_STROKE_CONTROL);
        context.g2.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, 
                RenderingHints.VALUE_STROKE_NORMALIZE);
        context.g2.draw(line);
        context.g2.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, saved);
    }

    /**
     * Draws a line perpendicular to the domain axis.
     *
     * @param g2  the graphics device.
     * @param plot  the plot.
     * @param axis  the value axis.
     * @param dataArea  the area for plotting data (not yet adjusted for any 3D
     *                  effect).
     * @param value  the value at which the grid line should be drawn.
     * @param paint  the paint (<code>null</code> not permitted).
     * @param stroke  the stroke (<code>null</code> not permitted).
     *
     * @since 1.0.5
     */
    public void drawDomainLine(Graphics2D g2, XYPlot plot, ValueAxis axis,
            Rectangle2D dataArea, double value, Paint paint, Stroke stroke) {

        drawDomainLine(new RenderContext(g2, plot, dataArea),
                new AxisLineSpec(axis, value, paint, stroke));
    }

    /**
     * Draws a domain line using the supplied context and line spec.
     *
     * @param context  the render context.
     * @param spec  the axis line spec.
     */
    private void drawDomainLine(RenderContext context, AxisLineSpec spec) {
        Range range = spec.axis.getRange();
        if (!range.contains(spec.value)) {
            return;
        }

        PlotOrientation orientation = context.plot.getOrientation();
        Line2D line = null;
        double v = spec.axis.valueToJava2D(spec.value, context.dataArea, 
                context.plot.getDomainAxisEdge());
        if (orientation.isHorizontal()) {
            line = new Line2D.Double(context.dataArea.getMinX(), v, context.dataArea.getMaxX(),
                    v);
        } else if (orientation.isVertical()) {
            line = new Line2D.Double(v, context.dataArea.getMinY(), v,
                    context.dataArea.getMaxY());
        }

        context.g2.setPaint(spec.paint);
        context.g2.setStroke(spec.stroke);
        Object saved = context.g2.getRenderingHint(RenderingHints.KEY_STROKE_CONTROL);
        context.g2.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, 
                RenderingHints.VALUE_STROKE_NORMALIZE);
        context.g2.draw(line);
        context.g2.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, saved);
    }

    /**
     * Draws a line perpendicular to the range axis.
     *
     * @param g2  the graphics device.
     * @param plot  the plot.
     * @param axis  the value axis.
     * @param dataArea  the area for plotting data (not yet adjusted for any 3D
     *                  effect).
     * @param value  the value at which the grid line should be drawn.
     * @param paint  the paint.
     * @param stroke  the stroke.
     */
    @Override
    public void drawRangeLine(Graphics2D g2, XYPlot plot, ValueAxis axis,
            Rectangle2D dataArea, double value, Paint paint, Stroke stroke) {

        drawRangeLine(new RenderContext(g2, plot, dataArea),
                new AxisLineSpec(axis, value, paint, stroke));
    }

    /**
     * Draws a range line using the supplied context and line spec.
     *
     * @param context  the render context.
     * @param spec  the axis line spec.
     */
    private void drawRangeLine(RenderContext context, AxisLineSpec spec) {
        Range range = spec.axis.getRange();
        if (!range.contains(spec.value)) {
            return;
        }

        PlotOrientation orientation = context.plot.getOrientation();
        Line2D line = null;
        double v = spec.axis.valueToJava2D(spec.value, context.dataArea, context.plot.getRangeAxisEdge());      
        if (orientation == PlotOrientation.HORIZONTAL) {
            line = new Line2D.Double(v, context.dataArea.getMinY(), v,
                    context.dataArea.getMaxY());
        } else if (orientation == PlotOrientation.VERTICAL) {
            line = new Line2D.Double(context.dataArea.getMinX(), v,
                    context.dataArea.getMaxX(), v);
        }

        context.g2.setPaint(spec.paint);
        context.g2.setStroke(spec.stroke);
        Object saved = context.g2.getRenderingHint(RenderingHints.KEY_STROKE_CONTROL);
        context.g2.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, 
                RenderingHints.VALUE_STROKE_NORMALIZE);
        context.g2.draw(line);
        context.g2.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, saved);
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
    @Override
    public void drawDomainMarker(Graphics2D g2, XYPlot plot, 
            ValueAxis domainAxis, Marker marker, Rectangle2D dataArea) {

        drawDomainMarker(new RenderContext(g2, plot, dataArea),
                new MarkerSpec(domainAxis, marker));
    }

    /**
     * Draws a domain marker using the supplied context and marker spec.
     *
     * @param context  the render context.
     * @param spec  the marker spec.
     */
    private void drawDomainMarker(RenderContext context, MarkerSpec spec) {
        if (spec.marker instanceof ValueMarker) {
            drawValueDomainMarker(context, spec);
        }
        else if (spec.marker instanceof IntervalMarker) {
            drawIntervalDomainMarker(context, spec);
        }
    }

    /**
     * Draws a value marker on the domain axis.
     *
     * @param context  the render context.
     * @param spec  the marker spec.
     */
    private void drawValueDomainMarker(RenderContext context, MarkerSpec spec) {
        ValueMarker vm = (ValueMarker) spec.marker;
        double value = vm.getValue();
        Range range = spec.axis.getRange();
        if (!range.contains(value)) {
            return;
        }

        double v = spec.axis.valueToJava2D(value, context.dataArea,
                context.plot.getDomainAxisEdge());

        PlotOrientation orientation = context.plot.getOrientation();
        Line2D line = null;
        if (orientation == PlotOrientation.HORIZONTAL) {
            line = new Line2D.Double(context.dataArea.getMinX(), v,
                    context.dataArea.getMaxX(), v);
        }
        else if (orientation == PlotOrientation.VERTICAL) {
            line = new Line2D.Double(v, context.dataArea.getMinY(), v,
                    context.dataArea.getMaxY());
        } else {
            throw new IllegalStateException();
        }

        final Composite originalComposite = context.g2.getComposite();
        context.g2.setComposite(AlphaComposite.getInstance(
                AlphaComposite.SRC_OVER, spec.marker.getAlpha()));
        context.g2.setPaint(spec.marker.getPaint());
        context.g2.setStroke(spec.marker.getStroke());
        context.g2.draw(line);

        String label = spec.marker.getLabel();
        RectangleAnchor anchor = spec.marker.getLabelAnchor();
        if (label != null) {
            Font labelFont = spec.marker.getLabelFont();
            context.g2.setFont(labelFont);
            context.g2.setPaint(spec.marker.getLabelPaint());
            Point2D coordinates = calculateDomainMarkerTextAnchorPoint(
                    context.g2, orientation, context.dataArea, line.getBounds2D(),
                    spec.marker.getLabelOffset(),
                    LengthAdjustmentType.EXPAND, anchor);
            TextUtilities.drawAlignedString(label, context.g2,
                    (float) coordinates.getX(), (float) coordinates.getY(),
                    spec.marker.getLabelTextAnchor());
        }
        context.g2.setComposite(originalComposite);
    }

    /**
     * Draws an interval marker on the domain axis.
     *
     * @param context  the render context.
     * @param spec  the marker spec.
     */
    private void drawIntervalDomainMarker(RenderContext context, MarkerSpec spec) {
        IntervalMarker im = (IntervalMarker) spec.marker;
        double start = im.getStartValue();
        double end = im.getEndValue();
        Range range = spec.axis.getRange();
        if (!(range.intersects(start, end))) {
            return;
        }

        double start2d = spec.axis.valueToJava2D(start, context.dataArea,
                context.plot.getDomainAxisEdge());
        double end2d = spec.axis.valueToJava2D(end, context.dataArea,
                context.plot.getDomainAxisEdge());
        double low = Math.min(start2d, end2d);
        double high = Math.max(start2d, end2d);

        PlotOrientation orientation = context.plot.getOrientation();
        Rectangle2D rect = null;
        if (orientation == PlotOrientation.HORIZONTAL) {
            // clip top and bottom bounds to data area
            low = Math.max(low, context.dataArea.getMinY());
            high = Math.min(high, context.dataArea.getMaxY());
            rect = new Rectangle2D.Double(context.dataArea.getMinX(),
                    low, context.dataArea.getWidth(),
                    high - low);
        }
        else if (orientation == PlotOrientation.VERTICAL) {
            // clip left and right bounds to data area
            low = Math.max(low, context.dataArea.getMinX());
            high = Math.min(high, context.dataArea.getMaxX());
            rect = new Rectangle2D.Double(low,
                    context.dataArea.getMinY(), high - low,
                    context.dataArea.getHeight());
        }

        final Composite originalComposite = context.g2.getComposite();
        context.g2.setComposite(AlphaComposite.getInstance(
                AlphaComposite.SRC_OVER, spec.marker.getAlpha()));
        Paint p = spec.marker.getPaint();
        if (p instanceof GradientPaint) {
            GradientPaint gp = (GradientPaint) p;
            GradientPaintTransformer t = im.getGradientPaintTransformer();
            if (t != null) {
                gp = t.transform(gp, rect);
            }
            context.g2.setPaint(gp);
        }
        else {
            context.g2.setPaint(p);
        }
        context.g2.fill(rect);

        // now draw the outlines, if visible...
        if (im.getOutlinePaint() != null && im.getOutlineStroke() != null) {
            if (orientation == PlotOrientation.VERTICAL) {
                Line2D line = new Line2D.Double();
                double y0 = context.dataArea.getMinY();
                double y1 = context.dataArea.getMaxY();
                context.g2.setPaint(im.getOutlinePaint());
                context.g2.setStroke(im.getOutlineStroke());
                if (range.contains(start)) {
                    line.setLine(start2d, y0, start2d, y1);
                    context.g2.draw(line);
                }
                if (range.contains(end)) {
                    line.setLine(end2d, y0, end2d, y1);
                    context.g2.draw(line);
                }
            }
            else { // PlotOrientation.HORIZONTAL
                Line2D line = new Line2D.Double();
                double x0 = context.dataArea.getMinX();
                double x1 = context.dataArea.getMaxX();
                context.g2.setPaint(im.getOutlinePaint());
                context.g2.setStroke(im.getOutlineStroke());
                if (range.contains(start)) {
                    line.setLine(x0, start2d, x1, start2d);
                    context.g2.draw(line);
                }
                if (range.contains(end)) {
                    line.setLine(x0, end2d, x1, end2d);
                    context.g2.draw(line);
                }
            }
        }

        String label = spec.marker.getLabel();
        RectangleAnchor anchor = spec.marker.getLabelAnchor();
        if (label != null) {
            Font labelFont = spec.marker.getLabelFont();
            context.g2.setFont(labelFont);
            context.g2.setPaint(spec.marker.getLabelPaint());
            Point2D coordinates = calculateDomainMarkerTextAnchorPoint(
                    context.g2, orientation, context.dataArea, rect,
                    spec.marker.getLabelOffset(), spec.marker.getLabelOffsetType(),
                    anchor);
            TextUtilities.drawAlignedString(label, context.g2,
                    (float) coordinates.getX(), (float) coordinates.getY(),
                    spec.marker.getLabelTextAnchor());
        }
        context.g2.setComposite(originalComposite);
    }

    /**
     * Calculates the (x, y) coordinates for drawing a marker label.
     *
     * @param g2  the graphics device.
     * @param orientation  the plot orientation.
     * @param dataArea  the data area.
     * @param markerArea  the rectangle surrounding the marker area.
     * @param markerOffset  the marker label offset.
     * @param labelOffsetType  the label offset type.
     * @param anchor  the label anchor.
     *
     * @return The coordinates for drawing the marker label.
     */
    protected Point2D calculateDomainMarkerTextAnchorPoint(Graphics2D g2,
            PlotOrientation orientation, Rectangle2D dataArea,
            Rectangle2D markerArea, RectangleInsets markerOffset,
            LengthAdjustmentType labelOffsetType, RectangleAnchor anchor) {

        return calculateDomainMarkerTextAnchorPoint(
                new MarkerAnchorContext(g2, orientation, dataArea, markerArea),
                new MarkerAnchorOffset(markerOffset, labelOffsetType, anchor));
    }

    /**
     * Calculates the anchor point for a domain marker label.
     *
     * @param context  the marker anchor context.
     * @param offset  the marker anchor offset.
     *
     * @return The coordinates for drawing the marker label.
     */
    private Point2D calculateDomainMarkerTextAnchorPoint(MarkerAnchorContext context,
            MarkerAnchorOffset offset) {
        Rectangle2D anchorRect = null;
        if (context.orientation == PlotOrientation.HORIZONTAL) {
            anchorRect = offset.markerOffset.createAdjustedRectangle(context.markerArea,
                    LengthAdjustmentType.CONTRACT, offset.labelOffsetType);
        }
        else if (context.orientation == PlotOrientation.VERTICAL) {
            anchorRect = offset.markerOffset.createAdjustedRectangle(context.markerArea,
                    offset.labelOffsetType, LengthAdjustmentType.CONTRACT);
        }
        return RectangleAnchor.coordinates(anchorRect, offset.anchor);
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
    @Override
    public void drawRangeMarker(Graphics2D g2, XYPlot plot, ValueAxis rangeAxis,
            Marker marker, Rectangle2D dataArea) {

        drawRangeMarker(new RenderContext(g2, plot, dataArea),
                new MarkerSpec(rangeAxis, marker));
    }

    /**
     * Draws a range marker using the supplied context and marker spec.
     *
     * @param context  the render context.
     * @param spec  the marker spec.
     */
    private void drawRangeMarker(RenderContext context, MarkerSpec spec) {
        if (spec.marker instanceof ValueMarker) {
            drawValueRangeMarker(context, spec);
        }
        else if (spec.marker instanceof IntervalMarker) {
            drawIntervalRangeMarker(context, spec);
        }
    }

    /**
     * Draws a value marker on the range axis.
     *
     * @param context  the render context.
     * @param spec  the marker spec.
     */
    private void drawValueRangeMarker(RenderContext context, MarkerSpec spec) {
        ValueMarker vm = (ValueMarker) spec.marker;
        double value = vm.getValue();
        Range range = spec.axis.getRange();
        if (!range.contains(value)) {
            return;
        }

        double v = spec.axis.valueToJava2D(value, context.dataArea,
                context.plot.getRangeAxisEdge());
        PlotOrientation orientation = context.plot.getOrientation();
        Line2D line = null;
        if (orientation == PlotOrientation.HORIZONTAL) {
            line = new Line2D.Double(context.dataArea.getMinX(), v,
                    context.dataArea.getMaxX(), v);
        }
        else if (orientation == PlotOrientation.VERTICAL) {
            line = new Line2D.Double(context.dataArea.getMinX(), v,
                    context.dataArea.getMaxX(), v);
        }
        else {
            throw new IllegalStateException("Unknown orientation.");
        }

        final Composite originalComposite = context.g2.getComposite();
        context.g2.setComposite(AlphaComposite.getInstance(
                AlphaComposite.SRC_OVER, spec.marker.getAlpha()));
        context.g2.setPaint(spec.marker.getPaint());
        context.g2.setStroke(spec.marker.getStroke());
        context.g2.draw(line);

        String label = spec.marker.getLabel();
        RectangleAnchor anchor = spec.marker.getLabelAnchor();
        if (label != null) {
            Font labelFont = spec.marker.getLabelFont();
            context.g2.setFont(labelFont);
            context.g2.setPaint(spec.marker.getLabelPaint());
            Point2D coordinates = calculateRangeMarkerTextAnchorPoint(
                    context.g2, orientation, context.dataArea, line.getBounds2D(),
                    spec.marker.getLabelOffset(),
                    LengthAdjustmentType.EXPAND, anchor);
            TextUtilities.drawAlignedString(label, context.g2,
                    (float) coordinates.getX(), (float) coordinates.getY(),
                    spec.marker.getLabelTextAnchor());
        }
        context.g2.setComposite(originalComposite);
    }

    /**
     * Draws an interval marker on the range axis.
     *
     * @param context  the render context.
     * @param spec  the marker spec.
     */
    private void drawIntervalRangeMarker(RenderContext context, MarkerSpec spec) {
        IntervalMarker im = (IntervalMarker) spec.marker;
        double start = im.getStartValue();
        double end = im.getEndValue();
        Range range = spec.axis.getRange();
        if (!(range.intersects(start, end))) {
            return;
        }

        double start2d = spec.axis.valueToJava2D(start, context.dataArea,
                context.plot.getRangeAxisEdge());
        double end2d = spec.axis.valueToJava2D(end, context.dataArea,
                context.plot.getRangeAxisEdge());
        double low = Math.min(start2d, end2d);
        double high = Math.max(start2d, end2d);

        PlotOrientation orientation = context.plot.getOrientation();
        Rectangle2D rect = null;
        if (orientation == PlotOrientation.HORIZONTAL) {
            // clip left and right bounds to data area
            low = Math.max(low, context.dataArea.getMinX());
            high = Math.min(high, context.dataArea.getMaxX());
            rect = new Rectangle2D.Double(low,
                    context.dataArea.getMinY(), high - low,
                    context.dataArea.getHeight());
        }
        else if (orientation == PlotOrientation.VERTICAL) {
            // clip top and bottom bounds to data area
            low = Math.max(low, context.dataArea.getMinY());
            high = Math.min(high, context.dataArea.getMaxY());
            rect = new Rectangle2D.Double(context.dataArea.getMinX(),
                    low, context.dataArea.getWidth(),
                    high - low);
        }

        final Composite originalComposite = context.g2.getComposite();
        context.g2.setComposite(AlphaComposite.getInstance(
                AlphaComposite.SRC_OVER, spec.marker.getAlpha()));
        Paint p = spec.marker.getPaint();
        if (p instanceof GradientPaint) {
            GradientPaint gp = (GradientPaint) p;
            GradientPaintTransformer t = im.getGradientPaintTransformer();
            if (t != null) {
                gp = t.transform(gp, rect);
            }
            context.g2.setPaint(gp);
        }
        else {
            context.g2.setPaint(p);
        }
        context.g2.fill(rect);

        // now draw the outlines, if visible...
        if (im.getOutlinePaint() != null && im.getOutlineStroke() != null) {
            if (orientation == PlotOrientation.VERTICAL) {
                Line2D line = new Line2D.Double();
                double x0 = context.dataArea.getMinX();
                double x1 = context.dataArea.getMaxX();
                context.g2.setPaint(im.getOutlinePaint());
                context.g2.setStroke(im.getOutlineStroke());
                if (range.contains(start)) {
                    line.setLine(x0, start2d, x1, start2d);
                    context.g2.draw(line);
                }
                if (range.contains(end)) {
                    line.setLine(x0, end2d, x1, end2d);
                    context.g2.draw(line);
                }
            }
            else { // PlotOrientation.HORIZONTAL
                Line2D line = new Line2D.Double();
                double y0 = context.dataArea.getMinY();
                double y1 = context.dataArea.getMaxY();
                context.g2.setPaint(im.getOutlinePaint());
                context.g2.setStroke(im.getOutlineStroke());
                if (range.contains(start)) {
                    line.setLine(start2d, y0, start2d, y1);
                    context.g2.draw(line);
                }
                if (range.contains(end)) {
                    line.setLine(end2d, y0, end2d, y1);
                    context.g2.draw(line);
                }
            }
        }

        String label = spec.marker.getLabel();
        RectangleAnchor anchor = spec.marker.getLabelAnchor();
        if (label != null) {
            Font labelFont = spec.marker.getLabelFont();
            context.g2.setFont(labelFont);
            context.g2.setPaint(spec.marker.getLabelPaint());
            Point2D coordinates = calculateRangeMarkerTextAnchorPoint(
                    context.g2, orientation, context.dataArea, rect,
                    spec.marker.getLabelOffset(), spec.marker.getLabelOffsetType(),
                    anchor);
            TextUtilities.drawAlignedString(label, context.g2,
                    (float) coordinates.getX(), (float) coordinates.getY(),
                    spec.marker.getLabelTextAnchor());
        }
        context.g2.setComposite(originalComposite);
    }

    /**
     * Calculates the (x, y) coordinates for drawing a marker label.
     *
     * @param g2  the graphics device.
     * @param orientation  the plot orientation.
     * @param dataArea  the data area.
     * @param markerArea  the marker area.
     * @param markerOffset  the marker offset.
     * @param labelOffsetForRange  ??
     * @param anchor  the label anchor.
     *
     * @return The coordinates for drawing the marker label.
     */
    private Point2D calculateRangeMarkerTextAnchorPoint(Graphics2D g2,
           PlotOrientation orientation, Rectangle2D dataArea,
           Rectangle2D markerArea, RectangleInsets markerOffset,
           LengthAdjustmentType labelOffsetForRange, RectangleAnchor anchor) {

        return calculateRangeMarkerTextAnchorPoint(
                new MarkerAnchorContext(g2, orientation, dataArea, markerArea),
                new MarkerAnchorOffset(markerOffset, labelOffsetForRange, anchor));
    }

    /**
     * Calculates the anchor point for a range marker label.
     *
     * @param context  the marker anchor context.
     * @param offset  the marker anchor offset.
     *
     * @return The coordinates for drawing the marker label.
     */
    private Point2D calculateRangeMarkerTextAnchorPoint(MarkerAnchorContext context,
           MarkerAnchorOffset offset) {

        Rectangle2D anchorRect = null;
        if (context.orientation == PlotOrientation.HORIZONTAL) {
            anchorRect = offset.markerOffset.createAdjustedRectangle(context.markerArea,
                    offset.labelOffsetType, LengthAdjustmentType.CONTRACT);
        }
        else if (context.orientation == PlotOrientation.VERTICAL) {
            anchorRect = offset.markerOffset.createAdjustedRectangle(context.markerArea,
                    LengthAdjustmentType.CONTRACT, offset.labelOffsetType);
        }
        return RectangleAnchor.coordinates(anchorRect, offset.anchor);
    }

    /**
     * Returns a clone of the renderer.
     *
     * @return A clone.
     *
     * @throws CloneNotSupportedException if the renderer does not support
     *         cloning.
     */
    @Override
    protected Object clone() throws CloneNotSupportedException {
        AbstractXYItemRenderer clone = (AbstractXYItemRenderer) super.clone();
        // 'plot' : just retain reference, not a deep copy

        cloneItemLabelGenerators(clone);
        cloneToolTipGenerators(clone);
        cloneLegendItemGenerators(clone);

        clone.foregroundAnnotations = (List) ObjectUtilities.deepClone(
                this.foregroundAnnotations);
        clone.backgroundAnnotations = (List) ObjectUtilities.deepClone(
                this.backgroundAnnotations);

        return clone;
    }

    /**
     * Clones the item label generators for the supplied clone.
     *
     * @param clone  the clone being populated.
     *
     * @throws CloneNotSupportedException if cloning is not supported.
     */
    private void cloneItemLabelGenerators(AbstractXYItemRenderer clone)
            throws CloneNotSupportedException {
        if (this.itemLabelGenerator != null
                && this.itemLabelGenerator instanceof PublicCloneable) {
            PublicCloneable pc = (PublicCloneable) this.itemLabelGenerator;
            clone.itemLabelGenerator = (XYItemLabelGenerator) pc.clone();
        }
        clone.itemLabelGeneratorMap = CloneUtils.cloneMapValues(
                this.itemLabelGeneratorMap);
        if (this.baseItemLabelGenerator != null
                && this.baseItemLabelGenerator instanceof PublicCloneable) {
            PublicCloneable pc = (PublicCloneable) this.baseItemLabelGenerator;
            clone.baseItemLabelGenerator = (XYItemLabelGenerator) pc.clone();
        }
    }

    /**
     * Clones the tool tip generators for the supplied clone.
     *
     * @param clone  the clone being populated.
     *
     * @throws CloneNotSupportedException if cloning is not supported.
     */
    private void cloneToolTipGenerators(AbstractXYItemRenderer clone)
            throws CloneNotSupportedException {
        if (this.toolTipGenerator != null
                && this.toolTipGenerator instanceof PublicCloneable) {
            PublicCloneable pc = (PublicCloneable) this.toolTipGenerator;
            clone.toolTipGenerator = (XYToolTipGenerator) pc.clone();
        }
        clone.toolTipGeneratorMap = CloneUtils.cloneMapValues(
                this.toolTipGeneratorMap);
        if (this.baseToolTipGenerator != null
                && this.baseToolTipGenerator instanceof PublicCloneable) {
            PublicCloneable pc = (PublicCloneable) this.baseToolTipGenerator;
            clone.baseToolTipGenerator = (XYToolTipGenerator) pc.clone();
        }
    }

    /**
     * Clones the legend item generators for the supplied clone.
     *
     * @param clone  the clone being populated.
     *
     * @throws CloneNotSupportedException if cloning is not supported.
     */
    private void cloneLegendItemGenerators(AbstractXYItemRenderer clone)
            throws CloneNotSupportedException {
        if (this.legendItemLabelGenerator instanceof PublicCloneable) {
            clone.legendItemLabelGenerator = (XYSeriesLabelGenerator)
                    ObjectUtilities.clone(this.legendItemLabelGenerator);
        }
        if (this.legendItemToolTipGenerator instanceof PublicCloneable) {
            clone.legendItemToolTipGenerator = (XYSeriesLabelGenerator)
                    ObjectUtilities.clone(this.legendItemToolTipGenerator);
        }
        if (this.legendItemURLGenerator instanceof PublicCloneable) {
            clone.legendItemURLGenerator = (XYSeriesLabelGenerator)
                    ObjectUtilities.clone(this.legendItemURLGenerator);
        }
    }

    /**
     * Tests this renderer for equality with another object.
     *
     * @param obj  the object (<code>null</code> permitted).
     *
     * @return <code>true</code> or <code>false</code>.
     */
    @Override
    public boolean equals(Object obj) {
        if (obj == this) {
            return true;
        }
        if (!(obj instanceof AbstractXYItemRenderer)) {
            return false;
        }
        AbstractXYItemRenderer that = (AbstractXYItemRenderer) obj;
        return equalFields(that) && super.equals(obj);
    }

    /**
     * Tests the fields of this renderer for equality with the supplied
     * renderer.
     *
     * @param that  the renderer to compare against.
     *
     * @return <code>true</code> if the fields are equal, and
     *         <code>false</code> otherwise.
     */
    private boolean equalFields(AbstractXYItemRenderer that) {
        if (!ObjectUtilities.equal(this.itemLabelGenerator,
                that.itemLabelGenerator)) {
            return false;
        }
        if (!this.itemLabelGeneratorMap.equals(that.itemLabelGeneratorMap)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.baseItemLabelGenerator,
                that.baseItemLabelGenerator)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.toolTipGenerator,
                that.toolTipGenerator)) {
            return false;
        }
        if (!this.toolTipGeneratorMap.equals(that.toolTipGeneratorMap)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.baseToolTipGenerator,
                that.baseToolTipGenerator)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.urlGenerator, that.urlGenerator)) {
            return false;
        }
        if (!this.foregroundAnnotations.equals(that.foregroundAnnotations)) {
            return false;
        }
        if (!this.backgroundAnnotations.equals(that.backgroundAnnotations)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.legendItemLabelGenerator,
                that.legendItemLabelGenerator)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.legendItemToolTipGenerator,
                that.legendItemToolTipGenerator)) {
            return false;
        }
        if (!ObjectUtilities.equal(this.legendItemURLGenerator,
                that.legendItemURLGenerator)) {
            return false;
        }
        return true;
    }

    /**
     * Returns the drawing supplier from the plot.
     *
     * @return The drawing supplier (possibly <code>null</code>).
     */
    @Override
    public DrawingSupplier getDrawingSupplier() {
        DrawingSupplier result = null;
        XYPlot p = getPlot();
        if (p != null) {
            result = p.getDrawingSupplier();
        }
        return result;
    }

    /**
     * Considers the current (x, y) coordinate and updates the crosshair point
     * if it meets the criteria (usually means the (x, y) coordinate is the
     * closest to the anchor point so far).
     *
     * @param crosshairState  the crosshair state (<code>null</code> permitted,
     *                        but the method does nothing in that case).
     * @param x  the x-value (in data space).
     * @param y  the y-value (in data space).
     * @param domainAxisIndex  the index of the domain axis for the point.
     * @param rangeAxisIndex  the index of the range axis for the point.
     * @param transX  the x-value translated to Java2D space.
     * @param transY  the y-value translated to Java2D space.
     * @param orientation  the plot orientation (<code>null</code> not
     *                     permitted).
     *
     * @since 1.0.4
     */
    protected void updateCrosshairValues(CrosshairState crosshairState,
            double x, double y, int domainAxisIndex, int rangeAxisIndex,
            double transX, double transY, PlotOrientation orientation) {

        updateCrosshairValues(crosshairState,
                new CrosshairData(x, y, transX, transY),
                new CrosshairAxes(domainAxisIndex, rangeAxisIndex),
                orientation);
    }

    /**
     * Updates the crosshair values using the supplied data objects.
     *
     * @param crosshairState  the crosshair state.
     * @param data  the crosshair data.
     * @param axes  the crosshair axes.
     * @param orientation  the plot orientation.
     */
    private void updateCrosshairValues(CrosshairState crosshairState,
            CrosshairData data, CrosshairAxes axes, PlotOrientation orientation) {

        ParamChecks.nullNotPermitted(orientation, "orientation");
        if (crosshairState != null) {
            // do we need to update the crosshair values?
            if (this.plot.isDomainCrosshairLockedOnData()) {
                if (this.plot.isRangeCrosshairLockedOnData()) {
                    // both axes
                    crosshairState.updateCrosshairPoint(data.x, data.y, axes.domainAxisIndex,
                            axes.rangeAxisIndex, data.transX, data.transY, orientation);
                }
                else {
                    // just the domain axis...
                    crosshairState.updateCrosshairX(data.x, axes.domainAxisIndex);
                }
            }
            else {
                if (this.plot.isRangeCrosshairLockedOnData()) {
                    // just the range axis...
                    crosshairState.updateCrosshairY(data.y, axes.rangeAxisIndex);
                }
            }
        }
    }

    /**
     * Draws an item label.
     *
     * @param g2  the graphics device.
     * @param orientation  the orientation.
     * @param dataset  the dataset.
     * @param series  the series index (zero-based).
     * @param item  the item index (zero-based).
     * @param x  the x coordinate (in Java2D space).
     * @param y  the y coordinate (in Java2D space).
     * @param negative  indicates a negative value (which affects the item
     *                  label position).
     */
    protected void drawItemLabel(Graphics2D g2, PlotOrientation orientation,
            XYDataset dataset, int series, int item, double x, double y,
            boolean negative) {

        drawItemLabel(g2, orientation, new ItemLabelData(dataset, series, item),
                new ItemLabelPoint(x, y, negative));
    }

    /**
     * Draws an item label using the supplied data objects.
     *
     * @param g2  the graphics device.
     * @param orientation  the orientation.
     * @param data  the item label data.
     * @param point  the item label point.
     */
    private void drawItemLabel(Graphics2D g2, PlotOrientation orientation,
            ItemLabelData data, ItemLabelPoint point) {

        XYItemLabelGenerator generator = getItemLabelGenerator(data.series, data.item);
        if (generator != null) {
            Font labelFont = getItemLabelFont(data.series, data.item);
            Paint paint = getItemLabelPaint(data.series, data.item);
            g2.setFont(labelFont);
            g2.setPaint(paint);
            String label = generator.generateLabel(data.dataset, data.series, data.item);

            // get the label position..
            ItemLabelPosition position;
            if (!point.negative) {
                position = getPositiveItemLabelPosition(data.series, data.item);
            }
            else {
                position = getNegativeItemLabelPosition(data.series, data.item);
            }

            // work out the label anchor point...
            Point2D anchorPoint = calculateLabelAnchorPoint(
                    position.getItemLabelAnchor(), point.x, point.y, orientation);
            TextUtilities.drawRotatedString(label, g2,
                    (float) anchorPoint.getX(), (float) anchorPoint.getY(),
                    position.getTextAnchor(), position.getAngle(),
                    position.getRotationAnchor());
        }
    }

    /**
     * Draws all the annotations for the specified layer.
     *
     * @param g2  the graphics device.
     * @param dataArea  the data area.
     * @param domainAxis  the domain axis.
     * @param rangeAxis  the range axis.
     * @param layer  the layer.
     * @param info  the plot rendering info.
     */
    @Override
    public void drawAnnotations(Graphics2D g2, Rectangle2D dataArea,
            ValueAxis domainAxis, ValueAxis rangeAxis, Layer layer,
            PlotRenderingInfo info) {

        drawAnnotations(new AnnotationRenderContext(g2, dataArea, domainAxis, rangeAxis),
                new AnnotationLayerInfo(layer, info));
    }

    /**
     * Draws all annotations for the supplied layer using the supplied context.
     *
     * @param context  the annotation render context.
     * @param layerInfo  the layer info.
     */
    private void drawAnnotations(AnnotationRenderContext context,
            AnnotationLayerInfo layerInfo) {

        Iterator iterator = null;
        if (layerInfo.layer.equals(Layer.FOREGROUND)) {
            iterator = this.foregroundAnnotations.iterator();
        }
        else if (layerInfo.layer.equals(Layer.BACKGROUND)) {
            iterator = this.backgroundAnnotations.iterator();
        }
        else {
            // should not get here
            throw new RuntimeException("Unknown layer.");
        }
        while (iterator.hasNext()) {
            XYAnnotation annotation = (XYAnnotation) iterator.next();
            int index = this.plot.getIndexOf(this);
            annotation.draw(context.g2, this.plot, context.dataArea, context.domainAxis,
                    context.rangeAxis, index, layerInfo.info);
        }
    }

    /**
     * Adds an entity to the collection.
     *
     * @param entities  the entity collection being populated.
     * @param area  the entity area (if <code>null</code> a default will be
     *              used).
     * @param dataset  the dataset.
     * @param series  the series.
     * @param item  the item.
     * @param entityX  the entity's center x-coordinate in user space (only
     *                 used if <code>area</code> is <code>null</code>).
     * @param entityY  the entity's center y-coordinate in user space (only
     *                 used if <code>area</code> is <code>null</code>).
     */
    protected void addEntity(EntityCollection entities, Shape area,
                             XYDataset dataset, int series, int item,
                             double entityX, double entityY) {
        addEntity(entities, area, new EntityData(dataset, series, item),
                new EntityPoint(entityX, entityY));
    }

    /**
     * Adds an entity to the collection using the supplied data objects.
     *
     * @param entities  the entity collection.
     * @param area  the entity area.
     * @param data  the entity data.
     * @param point  the entity point.
     */
    private void addEntity(EntityCollection entities, Shape area,
            EntityData data, EntityPoint point) {

        if (!getItemCreateEntity(data.series, data.item)) {
            return;
        }
        Shape hotspot = area;
        if (hotspot == null) {
            double r = getDefaultEntityRadius();
            double w = r * 2;
            if (getPlot().getOrientation() == PlotOrientation.VERTICAL) {
                hotspot = new Ellipse2D.Double(point.entityX - r, point.entityY - r, w, w);
            }
            else {
                hotspot = new Ellipse2D.Double(point.entityY - r, point.entityX - r, w, w);
            }
        }
        String tip = null;
        XYToolTipGenerator generator = getToolTipGenerator(data.series, data.item);
        if (generator != null) {
            tip = generator.generateToolTip(data.dataset, data.series, data.item);
        }
        String url = null;
        if (getURLGenerator() != null) {
            url = getURLGenerator().generateURL(data.dataset, data.series, data.item);
        }
        XYItemEntity entity = new XYItemEntity(hotspot, data.dataset, data.series, data.item,
                tip, url);
        entities.add(entity);
    }

    /**
     * Returns <code>true</code> if the specified point (x, y) falls within or
     * on the boundary of the specified rectangle.
     *
     * @param rect  the rectangle (<code>null</code> not permitted).
     * @param x  the x-coordinate.
     * @param y  the y-coordinate.
     *
     * @return A boolean.
     *
     * @since 1.0.10
     */
    public static boolean isPointInRect(Rectangle2D rect, double x, double y) {
        // TODO: For JFreeChart 1.2.0, this method should go in the
        //       ShapeUtilities class
        return (x >= rect.getMinX() && x <= rect.getMaxX()
                && y >= rect.getMinY() && y <= rect.getMaxY());
    }

    /**
     * Utility method delegating to {@link GeneralPath#moveTo} taking double as
     * parameters.
     *
     * @param hotspot  the region under construction (<code>null</code> not 
     *           permitted);
     * @param x  the x coordinate;
     * @param y  the y coordinate;
     *
     * @since 1.0.14
     */
    protected static void moveTo(GeneralPath hotspot, double x, double y) {
        hotspot.moveTo((float) x, (float) y);
    }

    /**
     * Utility method delegating to {@link GeneralPath#lineTo} taking double as
     * parameters.
     *
     * @param hotspot  the region under construction (<code>null</code> not 
     *           permitted);
     * @param x  the x coordinate;
     * @param y  the y coordinate;
     *
     * @since 1.0.14
     */
    protected static void lineTo(GeneralPath hotspot, double x, double y) {
        hotspot.lineTo((float) x, (float) y);
    }

    /**
     * A rendering context that groups the graphics device, plot and data area.
     */
    private static class RenderContext {
        final Graphics2D g2;
        final XYPlot plot;
        final Rectangle2D dataArea;

        RenderContext(Graphics2D g2, XYPlot plot, Rectangle2D dataArea) {
            this.g2 = g2;
            this.plot = plot;
            this.dataArea = dataArea;
        }
    }

    /**
     * A specification for an axis line, including axis, value, paint and stroke.
     */
    private static class AxisLineSpec {
        final ValueAxis axis;
        final double value;
        final Paint paint;
        final Stroke stroke;

        AxisLineSpec(ValueAxis axis, double value, Paint paint, Stroke stroke) {
            this.axis = axis;
            this.value = value;
            this.paint = paint;
            this.stroke = stroke;
        }
    }

    /**
     * A specification for a grid line, including axis and value.
     */
    private static class GridLineSpec {
        final ValueAxis axis;
        final double value;

        GridLineSpec(ValueAxis axis, double value) {
            this.axis = axis;
            this.value = value;
        }
    }

    /**
     * A specification for a grid band, including axis, start and end values.
     */
    private static class GridBandSpec {
        final ValueAxis axis;
        final double start;
        final double end;

        GridBandSpec(ValueAxis axis, double start, double end) {
            this.axis = axis;
            this.start = start;
            this.end = end;
        }
    }

    /**
     * A specification for a marker, including axis and marker.
     */
    private static class MarkerSpec {
        final ValueAxis axis;
        final Marker marker;

        MarkerSpec(ValueAxis axis, Marker marker) {
            this.axis = axis;
            this.marker = marker;
        }
    }

    /**
     * Context data for calculating a marker text anchor point.
     */
    private static class MarkerAnchorContext {
        final Graphics2D g2;
        final PlotOrientation orientation;
        final Rectangle2D dataArea;
        final Rectangle2D markerArea;

        MarkerAnchorContext(Graphics2D g2, PlotOrientation orientation,
                Rectangle2D dataArea, Rectangle2D markerArea) {
            this.g2 = g2;
            this.orientation = orientation;
            this.dataArea = dataArea;
            this.markerArea = markerArea;
        }
    }

    /**
     * Offset data for calculating a marker text anchor point.
     */
    private static class MarkerAnchorOffset {
        final RectangleInsets markerOffset;
        final LengthAdjustmentType labelOffsetType;
        final RectangleAnchor anchor;

        MarkerAnchorOffset(RectangleInsets markerOffset,
                LengthAdjustmentType labelOffsetType, RectangleAnchor anchor) {
            this.markerOffset = markerOffset;
            this.labelOffsetType = labelOffsetType;
            this.anchor = anchor;
        }
    }

    /**
     * Data for a crosshair point.
     */
    private static class CrosshairData {
        final double x;
        final double y;
        final double transX;
        final double transY;

        CrosshairData(double x, double y, double transX, double transY) {
            this.x = x;
            this.y = y;
            this.transX = transX;
            this.transY = transY;
        }
    }

    /**
     * Axis indices for a crosshair point.
     */
    private static class CrosshairAxes {
        final int domainAxisIndex;
        final int rangeAxisIndex;

        CrosshairAxes(int domainAxisIndex, int rangeAxisIndex) {
            this.domainAxisIndex = domainAxisIndex;
            this.rangeAxisIndex = rangeAxisIndex;
        }
    }

    /**
     * Data for an item label.
     */
    private static class ItemLabelData {
        final XYDataset dataset;
        final int series;
        final int item;

        ItemLabelData(XYDataset dataset, int series, int item) {
            this.dataset = dataset;
            this.series = series;
            this.item = item;
        }
    }

    /**
     * Point data for an item label.
     */
    private static class ItemLabelPoint {
        final double x;
        final double y;
        final boolean negative;

        ItemLabelPoint(double x, double y, boolean negative) {
            this.x = x;
            this.y = y;
            this.negative = negative;
        }
    }

    /**
     * Context data for drawing annotations.
     */
    private static class AnnotationRenderContext {
        final Graphics2D g2;
        final Rectangle2D dataArea;
        final ValueAxis domainAxis;
        final ValueAxis rangeAxis;

        AnnotationRenderContext(Graphics2D g2, Rectangle2D dataArea,
                ValueAxis domainAxis, ValueAxis rangeAxis) {
            this.g2 = g2;
            this.dataArea = dataArea;
            this.domainAxis = domainAxis;
            this.rangeAxis = rangeAxis;
        }
    }

    /**
     * Layer information for drawing annotations.
     */
    private static class AnnotationLayerInfo {
        final Layer layer;
        final PlotRenderingInfo info;

        AnnotationLayerInfo(Layer layer, PlotRenderingInfo info) {
            this.layer = layer;
            this.info = info;
        }
    }

    /**
     * Data for an entity.
     */
    private static class EntityData {
        final XYDataset dataset;
        final int series;
        final int item;

        EntityData(XYDataset dataset, int series, int item) {
            this.dataset = dataset;
            this.series = series;
            this.item = item;
        }
    }

    /**
     * Point data for an entity.
     */
    private static class EntityPoint {
        final double entityX;
        final double entityY;

        EntityPoint(double entityX, double entityY) {
            this.entityX = entityX;
            this.entityY = entityY;
        }
    }

    // === DEPRECATED CODE ===

    /**
     * The item label generator for ALL series.
     *
     * @deprecated This field is redundant, use itemLabelGeneratorList and
     *     baseItemLabelGenerator instead.  Deprecated as of version 1.0.6.
     */
    private XYItemLabelGenerator itemLabelGenerator;

    /**
     * The tool tip generator for ALL series.
     *
     * @deprecated This field is redundant, use tooltipGeneratorList and
     *     baseToolTipGenerator instead.  Deprecated as of version 1.0.6.
     */
    private XYToolTipGenerator toolTipGenerator;

    /**
     * Returns the item label generator override.
     *
     * @return The generator (possibly <code>null</code>).
     *
     * @since 1.0.5
     *
     * @see #setItemLabelGenerator(XYItemLabelGenerator)
     *
     * @deprecated As of version 1.0.6, this override setting should not be
     *     used.  You can use the base setting instead
     *     ({@link #getBaseItemLabelGenerator()}).
     */
    public XYItemLabelGenerator getItemLabelGenerator() {
        return this.itemLabelGenerator;
    }

    /**
     * Sets the item label generator for ALL series and sends a
     * {@link RendererChangeEvent} to all registered listeners.
     *
     * @param generator  the generator (<code>null</code> permitted).
     *
     * @see #getItemLabelGenerator()
     *
     * @deprecated As of version 1.0.6, this override setting should not be
     *     used.  You can use the base setting instead
     *     ({@link #setBaseItemLabelGenerator(XYItemLabelGenerator)}).
     */
    @Override
    public void setItemLabelGenerator(XYItemLabelGenerator generator) {
        this.itemLabelGenerator = generator;
        fireChangeEvent();
    }

    /**
     * Returns the override tool tip generator.
     *
     * @return The tool tip generator (possible <code>null</code>).
     *
     * @since 1.0.5
     *
     * @see #setToolTipGenerator(XYToolTipGenerator)
     *
     * @deprecated As of version 1.0.6, this override setting should not be
     *     used.  You can use the base setting instead
     *     ({@link #getBaseToolTipGenerator()}).
     */
    public XYToolTipGenerator getToolTipGenerator() {
        return this.toolTipGenerator;
    }

    /**
     * Sets the tool tip generator for ALL series and sends a
     * {@link RendererChangeEvent} to all registered listeners.
     *
     * @param generator  the generator (<code>null</code> permitted).
     *
     * @see #getToolTipGenerator()
     *
     * @deprecated As of version 1.0.6, this override setting should not be
     *     used.  You can use the base setting instead
     *     ({@link #setBaseToolTipGenerator(XYToolTipGenerator)}).
     */
    @Override
    public void setToolTipGenerator(XYToolTipGenerator generator) {
        this.toolTipGenerator = generator;
        fireChangeEvent();
    }

    /**
     * Considers the current (x, y) coordinate and updates the crosshair point
     * if it meets the criteria (usually means the (x, y) coordinate is the
     * closest to the anchor point so far).
     *
     * @param crosshairState  the crosshair state (<code>null</code> permitted,
     *                        but the method does nothing in that case).
     * @param x  the x-value (in data space).
     * @param y  the y-value (in data space).
     * @param transX  the x-value translated to Java2D space.
     * @param transY  the y-value translated to Java2D space.
     * @param orientation  the plot orientation (<code>null</code> not
     *                     permitted).
     *
     * @deprecated Use {@link #updateCrosshairValues(CrosshairState, double,
     *         double, int, int, double, double, PlotOrientation)} -- see bug
     *         report 1086307.
     */
    protected void updateCrosshairValues(CrosshairState crosshairState,
            double x, double y, double transX, double transY,
            PlotOrientation orientation) {
        updateCrosshairValues(crosshairState, x, y, 0, 0, transX, transY,
                orientation);
    }


}