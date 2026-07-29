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
     * auto-populated by the {@link #lookupSectionOutlineStroke(Comparable)}
     * method.
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
     * Copy constructor.
     *
     * @param source  the source plot.
     */
    public PiePlot(PiePlot source) {
        super();
        this.dataset = source.dataset;
        if (this.dataset != null) {
            this.dataset.addChangeListener(this);
            setDatasetGroup(this.dataset.getGroup());
        }
        this.pieIndex = source.pieIndex;
        this.interiorGap = source.interiorGap;
        this.circular = source.circular;
        this.startAngle = source.startAngle;
        this.direction = source.direction;
        this.minimumArcAngleToDraw = source.minimumArcAngleToDraw;
        this.sectionPaint = source.sectionPaint;
        this.sectionPaintMap = (PaintMap) source.sectionPaintMap.clone();
        this.baseSectionPaint = source.baseSectionPaint;
        this.autoPopulateSectionPaint = source.autoPopulateSectionPaint;
        this.sectionOutlinesVisible = source.sectionOutlinesVisible;
        this.sectionOutlinePaint = source.sectionOutlinePaint;
        this.sectionOutlinePaintMap = (PaintMap) source.sectionOutlinePaintMap.clone();
        this.baseSectionOutlinePaint = source.baseSectionOutlinePaint;
        this.autoPopulateSectionOutlinePaint = source.autoPopulateSectionOutlinePaint;
        this.sectionOutlineStroke = source.sectionOutlineStroke;
        this.sectionOutlineStrokeMap = (StrokeMap) source.sectionOutlineStrokeMap.clone();
        this.baseSectionOutlineStroke = source.baseSectionOutlineStroke;
        this.autoPopulateSectionOutlineStroke = source.autoPopulateSectionOutlineStroke;
        this.shadowPaint = source.shadowPaint;
        this.shadowXOffset = source.shadowXOffset;
        this.shadowYOffset = source.shadowYOffset;
        this.explodePercentages = new TreeMap<>(source.explodePercentages);
        this.labelGenerator = source.labelGenerator != null ?
                (PieSectionLabelGenerator) ObjectUtilities.clone(source.labelGenerator) : null;
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
        this.urlGenerator = source.urlGenerator instanceof PublicCloneable ?
                (PieURLGenerator) ObjectUtilities.clone(source.urlGenerator) : source.urlGenerator;
        this.legendLabelGenerator = source.legendLabelGenerator != null ?
                (PieSectionLabelGenerator) ObjectUtilities.clone(source.legendLabelGenerator) : null;
        this.legendLabelToolTipGenerator = source.legendLabelToolTipGenerator != null ?
                (PieSectionLabelGenerator) ObjectUtilities.clone(source.legendLabelToolTipGenerator) : null;
        this.legendLabelURLGenerator = source.legendLabelURLGenerator instanceof PublicCloneable ?
                (PieURLGenerator) ObjectUtilities.clone(source.legendLabelURLGenerator) : source.legendLabelURLGenerator;
        this.ignoreNullValues = source.ignoreNullValues;
        this.ignoreZeroValues = source.ignoreZeroValues;
        this.legendItemShape = ShapeUtilities.clone(source.legendItemShape);
        this.shadowGenerator = source.shadowGenerator;
    }

    // Remaining methods unchanged...

    // ... (rest of the class remains the same, including all getters, setters, drawing logic, etc.)

    // The clone method has been removed in favor of the copy constructor.

    // Serialization support remains unchanged.

    // Deprecated fields and methods remain unchanged.

}