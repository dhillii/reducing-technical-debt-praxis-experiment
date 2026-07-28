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
 * ------------
 * PiePlot.java
 * ------------
 * (C) Copyright 2000-2014, by Andrzej Porebski and Contributors.
 *
 * Original Author:  Andrzej Porebski;
 * Contributor(s):   David Gilbert (for Object Refinery Limited);
 *                   Martin Cordova (percentages in labels);
 *                   Richard Atkinson (URL support for image maps);
 *                   Christian W. Zuckschwerdt;
 *                   Arnaud Lelievre;
 *                   Martin Hilpert (patch 1891849);
 *                   Andreas Schroeder (very minor);
 *                   Christoph Beck (bug 2121818);
 *
 * Changes
 * -------
 * 21-Jun-2001 : Removed redundant JFreeChart parameter from constructors (DG);
 * 18-Sep-2001 : Updated header (DG);
 * 15-Oct-2001 : Data source classes moved to com.jrefinery.data.* (DG);
 * 19-Oct-2001 : Moved series paint and stroke methods from JFreeChart.java to
 *               Plot.java (DG);
 * 22-Oct-2001 : Renamed DataSource.java --> Dataset.java etc. (DG);
 * 13-Nov-2001 : Modified plot subclasses so that null axes are possible for
 *               pie plot (DG);
 * 17-Nov-2001 : Added PieDataset interface and amended this class accordingly,
 *               and completed removal of BlankAxis class as it is no longer
 *               required (DG);
 * 19-Nov-2001 : Changed 'drawCircle' property to 'circular' property (DG);
 * 21-Nov-2001 : Added options for exploding pie sections and filled out range
 *               of properties (DG);
 *               Added option for percentages in chart labels, based on code
 *               by Martin Cordova (DG);
 * 30-Nov-2001 : Changed default font from "Arial" --> "SansSerif" (DG);
 * 12-Dec-2001 : Removed unnecessary 'throws' clause in constructor (DG);
 * 13-Dec-2001 : Added tooltips (DG);
 * 16-Jan-2002 : Renamed tooltips class (DG);
 * 22-Jan-2002 : Fixed bug correlating legend labels with pie data (DG);
 * 05-Feb-2002 : Added alpha-transparency to plot class, and updated
 *               constructors accordingly (DG);
 * 06-Feb-2002 : Added optional background image and alpha-transparency to Plot
 *               and subclasses.  Clipped drawing within plot area (DG);
 * 26-Mar-2002 : Added an empty zoom method (DG);
 * 18-Apr-2002 : PieDataset is no longer sorted (oldman);
 * 23-Apr-2002 : Moved dataset from JFreeChart to Plot.  Added
 *               getLegendItemLabels() method (DG);
 * 19-Jun-2002 : Added attributes to control starting angle and direction
 *               (default is now clockwise) (DG);
 * 25-Jun-2002 : Removed redundant imports (DG);
 * 02-Jul-2002 : Fixed sign of percentage bug introduced in 0.9.2 (DG);
 * 16-Jul-2002 : Added check for null dataset in getLegendItemLabels() (DG);
 * 30-Jul-2002 : Moved summation code to DatasetUtilities (DG);
 * 05-Aug-2002 : Added URL support for image maps - new member variable for
 *               urlGenerator, modified constructor and minor change to the
 *               draw method (RA);
 * 18-Sep-2002 : Modified the percent label creation and added setters for the
 *               formatters (AS);
 * 24-Sep-2002 : Added getLegendItems() method (DG);
 * 02-Oct-2002 : Fixed errors reported by Checkstyle (DG);
 * 09-Oct-2002 : Added check for null entity collection (DG);
 * 30-Oct-2002 : Changed PieDataset interface (DG);
 * 18-Nov-2002 : Changed CategoryDataset to TableDataset (DG);
 * 02-Jan-2003 : Fixed "no data" message (DG);
 * 23-Jan-2003 : Modified to extract data from rows OR columns in
 *               CategoryDataset (DG);
 * 14-Feb-2003 : Fixed label drawing so that foreground alpha does not apply
 *               (bug id 685536) (DG);
 * 07-Mar-2003 : Modified to pass pieIndex on to PieSectionEntity and tooltip
 *               and URL generators (DG);
 * 21-Mar-2003 : Added a minimum angle for drawing arcs
 *               (see bug id 620031) (DG);
 * 24-Apr-2003 : Switched around PieDataset and KeyedValuesDataset (DG);
 * 02-Jun-2003 : Fixed bug 721733 (DG);
 * 30-Jul-2003 : Modified entity constructor (CZ);
 * 19-Aug-2003 : Implemented Cloneable (DG);
 * 29-Aug-2003 : Fixed bug 796936 (null pointer on setOutlinePaint()) (DG);
 * 08-Sep-2003 : Added internationalization via use of properties
 *               resourceBundle (RFE 690236) (AL);
 * 16-Sep-2003 : Changed ChartRenderingInfo --> PlotRenderingInfo (DG);
 * 29-Oct-2003 : Added workaround for font alignment in PDF output (DG);
 * 05-Nov-2003 : Fixed missing legend bug (DG);
 * 10-Nov-2003 : Re-added the DatasetChangeListener to constructors (CZ);
 * 29-Jan-2004 : Fixed clipping bug in draw() method (DG);
 * 11-Mar-2004 : Major overhaul to improve labelling (DG);
 * 31-Mar-2004 : Made an adjustment for the plot area when the label
 *               generator is null.  Fixed null pointer exception when the label
 *               generator returns null for a label (DG);
 * 06-Apr-2004 : Added getter, setter, serialization and draw support for
 *               labelBackgroundPaint (AS);
 * 08-Apr-2004 : Added flag to control whether null values are ignored or
 *               not (DG);
 * 15-Apr-2004 : Fixed some minor warnings from Eclipse (DG);
 * 26-Apr-2004 : Added attributes for label outline and shadow (DG);
 * 04-Oct-2004 : Renamed ShapeUtils --> ShapeUtilities (DG);
 * 04-Nov-2004 : Fixed null pointer exception with new LegendTitle class (DG);
 * 09-Nov-2004 : Added user definable legend item shape (DG);
 * 25-Nov-2004 : Added new legend label generator (DG);
 * 20-Apr-2005 : Added a tool tip generator for legend labels (DG);
 * 26-Apr-2005 : Removed LOGGER (DG);
 * 05-May-2005 : Updated draw() method parameters (DG);
 * 10-May-2005 : Added flag to control visibility of label linking lines, plus
 *               another flag to control the handling of zero values (DG);
 * 08-Jun-2005 : Fixed bug in getLegendItems() method (not respecting flags
 *               for ignoring null and zero values), and fixed equals() method
 *               to handle GradientPaint (DG);
 * 15-Jul-2005 : Added sectionOutlinesVisible attribute (DG);
 * ------------- JFREECHART 1.0.x ---------------------------------------------
 * 09-Jan-2006 : Fixed bug 1400442, inconsistent treatment of null and zero
 *               values in dataset (DG);
 * 28-Feb-2006 : Fixed bug 1440415, bad distribution of pie section
 *               labels (DG);
 * 27-Sep-2006 : Initialised baseSectionPaint correctly, added lookup methods
 *               for section paint, outline paint and outline stroke (DG);
 * 27-Sep-2006 : Refactored paint and stroke methods to use keys rather than
 *               section indices (DG);
 * 03-Oct-2006 : Replaced call to JRE 1.5 method (DG);
 * 23-Nov-2006 : Added support for URLs for the legend items (DG);
 * 24-Nov-2006 : Cloning fixes (DG);
 * 17-Apr-2007 : Check for null label in legend items (DG);
 * 19-Apr-2007 : Deprecated override settings (DG);
 * 18-May-2007 : Set dataset for LegendItem (DG);
 * 14-Jun-2007 : Added label distributor attribute (DG);
 * 18-Jul-2007 : Added simple label option (DG);
 * 21-Nov-2007 : Fixed labelling bugs, added debug code, restored default
 *               white background (DG);
 * 19-Mar-2008 : Fixed IllegalArgumentException when drawing with null
 *               dataset (DG);
 * 31-Mar-2008 : Adjust the label area for the interiorGap (DG);
 * 31-Mar-2008 : Added quad and cubic curve label link lines - see patch
 *               1891849 by Martin Hilpert (DG);
 * 02-Jul-2008 : Added autoPopulate flags (DG);
 * 15-Aug-2008 : Added methods to clear section attributes (DG);
 * 15-Aug-2008 : Fixed bug 2051168 - problem with LegendItemEntity
 *               generation (DG);
 * 23-Sep-2008 : Added getLabelLinkDepth() method - see bug 2121818 reported
 *               by Christoph Beck (DG);
 * 18-Dec-2008 : Use ResourceBundleWrapper - see patch 1607918 by
 *               Jess Thrysoee (DG);
 * 10-Jul-2009 : Added optional drop shadow generator (DG);
 * 03-Sep-2009 : Fixed bug where sinmpleLabelOffset is ignored (DG);
 * 04-Nov-2009 : Add mouse wheel rotation support (DG);
 * 18-Oct-2011 : Fixed tooltip offset with shadow generator (DG);
 * 20-Nov-2011 : Initialise shadow generator as null (DG);
 * 01-Jul-2012 : General label once only in drawSimpleLabels() (DG);
 * 02-Jul-2013 : Use ParamChecks (DG);
 * 12-Sep-2013 : Check for KEY_SUPPRESS_SHADOW_GENERATION rendering hint (DG);
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
import java.awt.RadialGradientPaint;
import java.awt.Shape;
import java.awt.Stroke;
import java.awt.geom.Arc2D;
import java.awt.geom.CubicCurve2D;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Line2D;
import java.awt.geom.Point2D;
import java.awt.geom.QuadCurve2D;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.Serializable;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.ResourceBundle;
import java.util.TreeMap;
import org.jfree.chart.JFreeChart;

import org.jfree.chart.LegendItem;
import org.jfree.chart.LegendItemCollection;
import org.jfree.chart.PaintMap;
import org.jfree.chart.StrokeMap;
import org.jfree.chart.entity.EntityCollection;
import org.jfree.chart.entity.PieSectionEntity;
import org.jfree.chart.event.PlotChangeEvent;
import org.jfree.chart.labels.PieSectionLabelGenerator;
import org.jfree.chart.labels.PieToolTipGenerator;
import org.jfree.chart.labels.StandardPieSectionLabelGenerator;
import org.jfree.chart.urls.PieURLGenerator;
import org.jfree.chart.util.ParamChecks;
import org.jfree.chart.util.ResourceBundleWrapper;
import org.jfree.chart.util.ShadowGenerator;
import org.jfree.data.DefaultKeyedValues;
import org.jfree.data.KeyedValues;
import org.jfree.data.general.DatasetChangeEvent;
import org.jfree.data.general.DatasetUtilities;
import org.jfree.data.general.PieDataset;
import org.jfree.io.SerialUtilities;
import org.jfree.text.G2TextMeasurer;
import org.jfree.text.TextBlock;
import org.jfree.text.TextBox;
import org.jfree.text.TextUtilities;
import org.jfree.ui.RectangleAnchor;
import org.jfree.ui.RectangleInsets;
import org.jfree.ui.TextAnchor;
import org.jfree.util.ObjectUtilities;
import org.jfree.util.PaintUtilities;
import org.jfree.util.PublicCloneable;
import org.jfree.util.Rotation;
import org.jfree.util.ShapeUtilities;
import org.jfree.util.UnitType;

/**
 * A plot that displays data in the form of a pie chart, using data from any
 * class that implements the {@link PieDataset} interface.
 * The example shown here is generated by the <code>PieChartDemo2.java</code>
 * program included in the JFreeChart Demo Collection:
 * <br><br>
 * <img src="../../../../images/PiePlotSample.png" alt="PiePlotSample.png">
 * <P>
 * Special notes:
 * <ol>
 * <li>the default starting point is 12 o'clock and the pie sections proceed
 * in a clockwise direction, but these settings can be changed;</li>
 * <li>negative values in the dataset are ignored;</li>
 * <li>there are utility methods for creating a {@link PieDataset} from a
 * {@link org.jfree.data.category.CategoryDataset};</li>
 * </ol>
 *
 * @see Plot
 * @see PieDataset
 */
public class PiePlot extends Plot implements Cloneable, Serializable {

    /** For serialization. */
    private static final long serialVersionUID = -795612466005590431L;

    /** The default interior gap. */
    public static final double DEFAULT_INTERIOR_GAP = 0.08;

    /** The maximum interior gap (currently 40%). */
    public static final double MAX_INTERIOR_GAP = 0.40;

    /** The default starting angle for the pie chart. */
    public static final double DEFAULT_START_ANGLE = 90.0;

    /** The default section label font. */
    public static final Font DEFAULT_LABEL_FONT = new Font("SansSerif",
            Font.PLAIN, 10);

    /** The default section label paint. */
    public static final Paint DEFAULT_LABEL_PAINT = Color.black;

    /** The default section label background paint. */
    public static final Paint DEFAULT_LABEL_BACKGROUND_PAINT = new Color(255,
            255, 192);

    /** The default section label outline paint. */
    public static final Paint DEFAULT_LABEL_OUTLINE_PAINT = Color.black;

    /** The default section label outline stroke. */
    public static final Stroke DEFAULT_LABEL_OUTLINE_STROKE = new BasicStroke(
            0.5f);

    /** The default section label shadow paint. */
    public static final Paint DEFAULT_LABEL_SHADOW_PAINT = new Color(151, 151,
            151, 128);

    /** The default minimum arc angle to draw. */
    public static final double DEFAULT_MINIMUM_ARC_ANGLE_TO_DRAW = 0.00001;

    /** The dataset for the pie chart. */
    private PieDataset dataset;

    /** The pie index (used by the {@link MultiplePiePlot} class). */
    private int pieIndex;

    /**
     * The amount of space left around the outside of the pie plot, expressed
     * as a percentage of the plot area width and height.
     */
    private double interiorGap;

    /** Flag determining whether to draw an ellipse or a perfect circle. */
    private boolean circular;

    /** The starting angle. */
    private double startAngle;

    /** The direction for the pie segments. */
    private Rotation direction;

    /** The section paint map. */
    private PaintMap sectionPaintMap;

    /** The base section paint (fallback). */
    private transient Paint baseSectionPaint;

    /**
     * A flag that controls whether or not the section paint is auto-populated
     * from the drawing supplier.
     *
     * @since 1.0.11
     */
    private boolean autoPopulateSectionPaint;

    /**
     * A flag that controls whether or not an outline is drawn for each
     * section in the plot.
     */
    private boolean sectionOutlinesVisible;

    /** The section outline paint map. */
    private PaintMap sectionOutlinePaintMap;

    /** The base section outline paint (fallback). */
    private transient Paint baseSectionOutlinePaint;

    /**
     * A flag that controls whether or not the section outline paint is
     * auto-populated from the drawing supplier.
     *
     * @since 1.0.11
     */
    private boolean autoPopulateSectionOutlinePaint;

    /** The section outline stroke map. */
    private StrokeMap sectionOutlineStrokeMap;

    /** The base section outline stroke (fallback). */
    private transient Stroke baseSectionOutlineStroke;

    /**
     * A flag that controls whether or not the section outline stroke is
     * auto-populated from the drawing supplier.
     *
     * @since 1.0.11
     */
    private boolean autoPopulateSectionOutlineStroke;

    /** The shadow paint. */
    private transient Paint shadowPaint = Color.gray;

    /** The x-offset for the shadow effect. */
    private double shadowXOffset = 4.0f;

    /** The y-offset for the shadow effect. */
    private double shadowYOffset = 4.0f;

    /** The percentage amount to explode each pie section. */
    private Map explodePercentages;

    /** The section label generator. */
    private PieSectionLabelGenerator labelGenerator;

    /** The font used to display the section labels. */
    private Font labelFont;

    /** The color used to draw the section labels. */
    private transient Paint labelPaint;

    /**
     * The color used to draw the background of the section labels.  If this
     * is <code>null</code>, the background is not filled.
     */
    private transient Paint labelBackgroundPaint;

    /**
     * The paint used to draw the outline of the section labels
     * (<code>null</code> permitted).
     */
    private transient Paint labelOutlinePaint;

    /**
     * The stroke used to draw the outline of the section labels
     * (<code>null</code> permitted).
     */
    private transient Stroke labelOutlineStroke;

    /**
     * The paint used to draw the shadow for the section labels
     * (<code>null</code> permitted).
     */
    private transient Paint labelShadowPaint;

    /**
     * A flag that controls whether simple or extended labels are used.
     *
     * @since 1.0.7
     */
    private boolean simpleLabels = true;

    /**
     * The padding between the labels and the label outlines.  This is not
     * allowed to be <code>null</code>.
     *
     * @since 1.0.7
     */
    private RectangleInsets labelPadding;

    /**
     * The simple label offset.
     *
     * @since 1.0.7
     */
    private RectangleInsets simpleLabelOffset;

    /** The maximum label width as a percentage of the plot width. */
    private double maximumLabelWidth = 0.14;

    /**
     * The gap between the labels and the link corner, as a percentage of the
     * plot width.
     */
    private double labelGap = 0.025;

    /** A flag that controls whether or not the label links are drawn. */
    private boolean labelLinksVisible;

    /**
     * The label link style.
     *
     * @since 1.0.10
     */
    private PieLabelLinkStyle labelLinkStyle = PieLabelLinkStyle.STANDARD;

    /** The link margin. */
    private double labelLinkMargin = 0.025;

    /** The paint used for the label linking lines. */
    private transient Paint labelLinkPaint = Color.black;

    /** The stroke used for the label linking lines. */
    private transient Stroke labelLinkStroke = new BasicStroke(0.5f);

    /**
     * The pie section label distributor.
     *
     * @since 1.0.6
     */
    private AbstractPieLabelDistributor labelDistributor;

    /** The tooltip generator. */
    private PieToolTipGenerator toolTipGenerator;

    /** The URL generator. */
    private PieURLGenerator urlGenerator;

    /** The legend label generator. */
    private PieSectionLabelGenerator legendLabelGenerator;

    /** A tool tip generator for the legend. */
    private PieSectionLabelGenerator legendLabelToolTipGenerator;

    /**
     * A URL generator for the legend items (optional).
     *
     * @since 1.0.4.
     */
    private PieURLGenerator legendLabelURLGenerator;

    /**
     * A flag that controls whether <code>null</code> values are ignored.
     */
    private boolean ignoreNullValues;

    /**
     * A flag that controls whether zero values are ignored.
     */
    private boolean ignoreZeroValues;

    /** The legend item shape. */
    private transient Shape legendItemShape;

    /**
     * The smallest arc angle that will get drawn (this is to avoid a bug in
     * various Java implementations that causes the JVM to crash).  See this
     * link for details:
     *
     * http://www.jfree.org/phpBB2/viewtopic.php?t=2707
     *
     * ...and this bug report in the Java Bug Parade:
     *
     * http://developer.java.sun.com/developer/bugParade/bugs/4836495.html
     */
    private double minimumArcAngleToDraw;

    /**
     * The shadow generator for the plot (<code>null</code> permitted).
     * 
     * @since 1.0.14
     */
    private ShadowGenerator shadowGenerator;

    /** The resourceBundle for the localization. */
    protected static ResourceBundle localizationResources
            = ResourceBundleWrapper.getBundle(
                    "org.jfree.chart.plot.LocalizationBundle");

    /**
     * This debug flag controls whether or not an outline is drawn showing the
     * interior of the plot region.  This is drawn as a lightGray rectangle
     * showing the padding provided by the 'interiorGap' setting.
     */
    static final boolean DEBUG_DRAW_INTERIOR = false;

    /**
     * This debug flag controls whether or not an outline is drawn showing the
     * link area (in blue) and link ellipse (in yellow).  This controls where
     * the label links have 'elbow' points.
     */
    static final boolean DEBUG_DRAW_LINK_AREA = false;

    /**
     * This debug flag controls whether or not an outline is drawn showing
     * the pie area (in green).
     */
    static final boolean DEBUG_DRAW_PIE_AREA = false;

    /**
     * Creates a new plot.  The dataset is initially set to <code>null</code>.
     */
    public PiePlot() {
        this(null);
    }

    /**
     * Creates a plot that will draw a pie chart for the specified dataset.
     *
     * @param dataset  the dataset (<code>null</code> permitted).
     */
    public PiePlot(PieDataset dataset) {
        super();
        this.dataset = dataset;
        if (dataset != null) {
            dataset.addChangeListener(this);
        }
        this.pieIndex = 0;

        this.interiorGap = DEFAULT_INTERIOR_GAP;
        this.circular = true;
        this.startAngle = DEFAULT_START_ANGLE;
        this.direction = Rotation.CLOCKWISE;
        this.minimumArcAngleToDraw = DEFAULT_MINIMUM_ARC_ANGLE_TO_DRAW;

        this.sectionPaint = null;
        this.sectionPaintMap = new PaintMap();
        this.baseSectionPaint = Color.gray;
        this.autoPopulateSectionPaint = true;

        this.sectionOutlinesVisible = true;
        this.sectionOutlinePaint = null;
        this.sectionOutlinePaintMap = new PaintMap();
        this.baseSectionOutlinePaint = DEFAULT_OUTLINE_PAINT;
        this.autoPopulateSectionOutlinePaint = false;

        this.sectionOutlineStroke = null;
        this.sectionOutlineStrokeMap = new StrokeMap();
        this.baseSectionOutlineStroke = DEFAULT_OUTLINE_STROKE;
        this.autoPopulateSectionOutlineStroke = false;

        this.explodePercentages = new TreeMap();

        this.labelGenerator = new StandardPieSectionLabelGenerator();
        this.labelFont = DEFAULT_LABEL_FONT;
        this.labelPaint = DEFAULT_LABEL_PAINT;
        this.labelBackgroundPaint = DEFAULT_LABEL_BACKGROUND_PAINT;
        this.labelOutlinePaint = DEFAULT_LABEL_OUTLINE_PAINT;
        this.labelOutlineStroke = DEFAULT_LABEL_OUTLINE_STROKE;
        this.labelShadowPaint = DEFAULT_LABEL_SHADOW_PAINT;
        this.labelLinksVisible = true;
        this.labelDistributor = new PieLabelDistributor(0);

        this.simpleLabels = false;
        this.simpleLabelOffset = new RectangleInsets(UnitType.RELATIVE, 0.18,
                0.18, 0.18, 0.18);
        this.labelPadding = new RectangleInsets(2, 2, 2, 2);

        this.toolTipGenerator = null;
        this.urlGenerator = null;
        this.legendLabelGenerator = new StandardPieSectionLabelGenerator();
        this.legendLabelToolTipGenerator = null;
        this.legendLabelURLGenerator = null;
        this.legendItemShape = Plot.DEFAULT_LEGEND_ITEM_CIRCLE;

        this.ignoreNullValues = false;
        this.ignoreZeroValues = false;

        this.shadowGenerator = null;
    }

    /**
     * Creates a new {@code PiePlot} as a copy of an existing instance.
     *
     * @param source  the plot to copy (must not be {@code null}).
     */
    public PiePlot(PiePlot source) {
        super(source);
        this.dataset = source.dataset;
        if (this.dataset != null) {
            this.dataset.addChangeListener(this);
        }
        this.pieIndex = source.pieIndex;
        this.interiorGap = source.interiorGap;
        this.circular = source.circular;
        this.startAngle = source.startAngle;
        this.direction = source.direction;
        this.minimumArcAngleToDraw = source.minimumArcAngleToDraw;

        this.sectionPaintMap = (PaintMap) source.sectionPaintMap.clone();
        this.baseSectionPaint = source.baseSectionPaint;
        this.autoPopulateSectionPaint = source.autoPopulateSectionPaint;

        this.sectionOutlinesVisible = source.sectionOutlinesVisible;
        this.sectionOutlinePaintMap = (PaintMap) source.sectionOutlinePaintMap.clone();
        this.baseSectionOutlinePaint = source.baseSectionOutlinePaint;
        this.autoPopulateSectionOutlinePaint = source.autoPopulateSectionOutlinePaint;

        this.sectionOutlineStrokeMap = (StrokeMap) source.sectionOutlineStrokeMap.clone();
        this.baseSectionOutlineStroke = source.baseSectionOutlineStroke;
        this.autoPopulateSectionOutlineStroke = source.autoPopulateSectionOutlineStroke;

        this.shadowPaint = source.shadowPaint;
        this.shadowXOffset = source.shadowXOffset;
        this.shadowYOffset = source.shadowYOffset;

        this.explodePercentages = new TreeMap<Comparable<?>, Number>(source.explodePercentages);
        this.labelGenerator = source.labelGenerator != null
                ? (PieSectionLabelGenerator) ObjectUtilities.clone(source.labelGenerator)
                : null;
        this.labelFont = source.labelFont;
        this.labelPaint = source.labelPaint;
        this.labelBackgroundPaint = source.labelBackgroundPaint;
        this.labelOutlinePaint = source.labelOutlinePaint;
        this.labelOutlineStroke = source.labelOutlineStroke;
        this.labelShadowPaint = source.labelShadowPaint;

        this.simpleLabels = source.simpleLabels;
        this.simpleLabelOffset = source.simpleLabelOffset;
        this.labelPadding = source.labelPadding;
        this.maximumLabelWidth = source.maximumLabelWidth;
        this.labelGap = source.labelGap;
        this.labelLinksVisible = source.labelLinksVisible;
        this.labelLinkStyle = source.labelLinkStyle;
        this.labelLinkMargin = source.labelLinkMargin;
        this.labelLinkPaint = source.labelLinkPaint;
        this.labelLinkStroke = source.labelLinkStroke;
        this.labelDistributor = source.labelDistributor;

        this.toolTipGenerator = source.toolTipGenerator;
        this.urlGenerator = source.urlGenerator instanceof PublicCloneable
                ? (PieURLGenerator) ObjectUtilities.clone(source.urlGenerator)
                : source.urlGenerator;

        this.legendLabelGenerator = source.legendLabelGenerator != null
                ? (PieSectionLabelGenerator) ObjectUtilities.clone(source.legendLabelGenerator)
                : null;
        this.legendLabelToolTipGenerator = source.legendLabelToolTipGenerator != null
                ? (PieSectionLabelGenerator) ObjectUtilities.clone(source.legendLabelToolTipGenerator)
                : null;
        this.legendLabelURLGenerator = source.legendLabelURLGenerator instanceof PublicCloneable
                ? (PieURLGenerator) ObjectUtilities.clone(source.legendLabelURLGenerator)
                : source.legendLabelURLGenerator;

        this.ignoreNullValues = source.ignoreNullValues;
        this.ignoreZeroValues = source.ignoreZeroValues;
        this.legendItemShape = ShapeUtilities.clone(source.legendItemShape);
        this.shadowGenerator = source.shadowGenerator;
    }

    // Existing methods follow unchanged...

    /**
     * Returns the dataset.
     *
     * @return The dataset (possibly <code>null</code>).
     *
     * @see #setDataset(PieDataset)
     */
    public PieDataset getDataset() {
        return this.dataset;
    }

    /**
     * Sets the dataset and sends a {@link DatasetChangeEvent} to 'this'.
     *
     * @param dataset  the dataset (<code>null</code> permitted).
     *
     * @see #getDataset()
     */
    public void setDataset(PieDataset dataset) {
        // if there is an existing dataset, remove the plot from the list of
        // change listeners...
        PieDataset existing = this.dataset;
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

    // ... (rest of the class unchanged) ...

    /**
     * Returns a clone of the plot.
     *
     * @return A clone.
     *
     * @throws CloneNotSupportedException if some component of the plot does
     *         not support cloning.
     * @deprecated Use the copy constructor {@link #PiePlot(PiePlot)} instead.
     */
    @Deprecated
    @Override
    public Object clone() throws CloneNotSupportedException {
        return new PiePlot(this);
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
        SerialUtilities.writePaint(this.sectionPaint, stream);
        SerialUtilities.writePaint(this.baseSectionPaint, stream);
        SerialUtilities.writePaint(this.sectionOutlinePaint, stream);
        SerialUtilities.writePaint(this.baseSectionOutlinePaint, stream);
        SerialUtilities.writeStroke(this.sectionOutlineStroke, stream);
        SerialUtilities.writeStroke(this.baseSectionOutlineStroke, stream);
        SerialUtilities.writePaint(this.shadowPaint, stream);
        SerialUtilities.writePaint(this.labelPaint, stream);
        SerialUtilities.writePaint(this.labelBackgroundPaint, stream);
        SerialUtilities.writePaint(this.labelOutlinePaint, stream);
        SerialUtilities.writeStroke(this.labelOutlineStroke, stream);
        SerialUtilities.writePaint(this.labelShadowPaint, stream);
        SerialUtilities.writePaint(this.labelLinkPaint, stream);
        SerialUtilities.writeStroke(this.labelLinkStroke, stream);
        SerialUtilities.writeShape(this.legendItemShape, stream);
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
        this.sectionPaint = SerialUtilities.readPaint(stream);
        this.baseSectionPaint = SerialUtilities.readPaint(stream);
        this.sectionOutlinePaint = SerialUtilities.readPaint(stream);
        this.baseSectionOutlinePaint = SerialUtilities.readPaint(stream);
        this.sectionOutlineStroke = SerialUtilities.readStroke(stream);
        this.baseSectionOutlineStroke = SerialUtilities.readStroke(stream);
        this.shadowPaint = SerialUtilities.readPaint(stream);
        this.labelPaint = SerialUtilities.readPaint(stream);
        this.labelBackgroundPaint = SerialUtilities.readPaint(stream);
        this.labelOutlinePaint = SerialUtilities.readPaint(stream);
        this.labelOutlineStroke = SerialUtilities.readStroke(stream);
        this.labelShadowPaint = SerialUtilities.readPaint(stream);
        this.labelLinkPaint = SerialUtilities.readPaint(stream);
        this.labelLinkStroke = SerialUtilities.readStroke(stream);
        this.legendItemShape = SerialUtilities.readShape(stream);
    }

    // DEPRECATED FIELDS AND METHODS...

    /**
     * The paint for ALL sections (overrides list).
     *
     * @deprecated This field is redundant, it is sufficient to use
     *     sectionPaintMap and baseSectionPaint.  Deprecated as of version
     *     1.0.6.
     */
    private transient Paint sectionPaint;

    /**
     * The outline paint for ALL sections (overrides list).
     *
     * @deprecated This field is redundant, it is sufficient to use
     *     sectionOutlinePaintMap and baseSectionOutlinePaint.  Deprecated as
     *     of version 1.0.6.
     */
    private transient Paint sectionOutlinePaint;

    /**
     * The outline stroke for ALL sections (overrides list).
     *
     * @deprecated This field is redundant, it is sufficient to use
     *     sectionOutlineStrokeMap and baseSectionOutlineStroke.  Deprecated as
     *     of version 1.0.6.
     */
    private transient Stroke sectionOutlineStroke;

    /**
     * Returns the paint for the specified section.
     *
     * @param section  the section index (zero-based).
     *
     * @return The paint (never <code>null</code>).
     *
     * @deprecated Use {@link #getSectionPaint(Comparable)} instead.
     */
    public Paint getSectionPaint(int section) {
        Comparable key = getSectionKey(section);
        return getSectionPaint(key);
    }

    /**
     * Sets the paint used to fill a section of the pie and sends a
     * {@link PlotChangeEvent} to all registered listeners.
     *
     * @param section  the section index (zero-based).
     * @param paint  the paint (<code>null</code> permitted).
     *
     * @deprecated Use {@link #setSectionPaint(Comparable, Paint)} instead.
     */
    public void setSectionPaint(int section, Paint paint) {
        Comparable key = getSectionKey(section);
        setSectionPaint(key, paint);
    }

    /**
     * Returns the outline paint for ALL sections in the plot.
     *
     * @return The paint (possibly <code>null</code>).
     *
     * @see #setSectionOutlinePaint(Paint)
     *
     * @deprecated Use {@link #getSectionOutlinePaint(Comparable)} and
     *     {@link #getBaseSectionOutlinePaint()}.  Deprecated as of version
     *     1.0.6.
     */
    public Paint getSectionOutlinePaint() {
        return this.sectionOutlinePaint;
    }

    /**
     * Sets the outline paint for ALL sections in the plot.  If this is set to
     * {@code null}, then a list of paints is used instead (to allow
     * different colors to be used for each section).
     *
     * @param paint  the paint (<code>null</code> permitted).
     *
     * @see #getSectionOutlinePaint()
     *
     * @deprecated Use {@link #setSectionOutlinePaint(Comparable, Paint)} and
     *     {@link #setBaseSectionOutlinePaint(Paint)}.  Deprecated as of
     *     version 1.0.6.
     */
    public void setSectionOutlinePaint(Paint paint) {
        this.sectionOutlinePaint = paint;
        fireChangeEvent();
    }

    /**
     * Returns the paint for the specified section.
     *
     * @param section  the section index (zero-based).
     *
     * @return The paint (possibly <code>null</code>).
     *
     * @deprecated Use {@link #getSectionOutlinePaint(Comparable)} instead.
     */
    public Paint getSectionOutlinePaint(int section) {
        Comparable key = getSectionKey(section);
        return getSectionOutlinePaint(key);
    }

    /**
     * Sets the paint used to fill a section of the pie and sends a
     * {@link PlotChangeEvent} to all registered listeners.
     *
     * @param section  the section index (zero-based).
     * @param paint  the paint (<code>null</code> permitted).
     *
     * @deprecated Use {@link #setSectionOutlinePaint(Comparable, Paint)}
     *     instead.
     */
    public void setSectionOutlinePaint(int section, Paint paint) {
        Comparable key = getSectionKey(section);
        setSectionOutlinePaint(key, paint);
    }

    /**
     * Returns the outline stroke for ALL sections in the plot.
     *
     * @return The stroke (possibly <code>null</code>).
     *
     * @see #setSectionOutlineStroke(Stroke)
     *
     * @deprecated Use {@link #getSectionOutlineStroke(Comparable)} and
     *     {@link #getBaseSectionOutlineStroke()}.  Deprecated as of version
     *     1.0.6.
     */
    public Stroke getSectionOutlineStroke() {
        return this.sectionOutlineStroke;
    }

    /**
     * Sets the outline stroke for ALL sections in the plot.  If this is set to
     * {@code null}, then a list of paints is used instead (to allow
     * different colors to be used for each section).
     *
     * @param stroke  the stroke (<code>null</code> permitted).
     *
     * @see #getSectionOutlineStroke()
     *
     * @deprecated Use {@link #setSectionOutlineStroke(Comparable, Stroke)} and
     *     {@link #setBaseSectionOutlineStroke(Stroke)}.  Deprecated as of
     *     version 1.0.6.
     */
    public void setSectionOutlineStroke(Stroke stroke) {
        this.sectionOutlineStroke = stroke;
        fireChangeEvent();
    }

    /**
     * Returns the stroke for the specified section.
     *
     * @param section  the section index (zero-based).
     *
     * @return The stroke (possibly <code>null</code>).
     *
     * @deprecated Use {@link #getSectionOutlineStroke(Comparable)} instead.
     */
    public Stroke getSectionOutlineStroke(int section) {
        Comparable key = getSectionKey(section);
        return getSectionOutlineStroke(key);
    }

    /**
     * Sets the stroke used to fill a section of the pie and sends a
     * {@link PlotChangeEvent} to all registered listeners.
     *
     * @param section  the section index (zero-based).
     * @param stroke  the stroke (<code>null</code> permitted).
     *
     * @deprecated Use {@link #setSectionOutlineStroke(Comparable, Stroke)}
     *     instead.
     */
    public void setSectionOutlineStroke(int section, Stroke stroke) {
        Comparable key = getSectionKey(section);
        setSectionOutlineStroke(key, stroke);
    }

    /**
     * Returns the amount that a section should be 'exploded'.
     *
     * @param section  the section number.
     *
     * @return The amount that a section should be 'exploded'.
     *
     * @deprecated Use {@link #getExplodePercent(Comparable)} instead.
     */
    public double getExplodePercent(int section) {
        Comparable key = getSectionKey(section);
        return getExplodePercent(key);
    }

    /**
     * Sets the amount that a pie section should be exploded and sends a
     * {@link PlotChangeEvent} to all registered listeners.
     *
     * @param section  the section index.
     * @param percent  the explode percentage (0.30 = 30 percent).
     *
     * @deprecated Use {@link #setExplodePercent(Comparable, double)} instead.
     */
    public void setExplodePercent(int section, double percent) {
        Comparable key = getSectionKey(section);
        setExplodePercent(key, percent);
    }

}