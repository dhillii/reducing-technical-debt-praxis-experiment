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
 * Other names are trademarks of their respective owners.]
 *
 * -----------------------
 * StandardChartTheme.java
 * -----------------------
 * (C) Copyright 2008-2014, by Object Refinery Limited.
 *
 * Original Author:  David Gilbert (for Object Refinery Limited);
 * Contributor(s):   -;
 *
 * Changes
 * -------
 * 14-Aug-2008 : Version 1 (DG);
 * 10-Apr-2009 : Added getter/setter for smallFont (DG);
 * 10-Jul-2009 : Added shadowGenerator field (DG);
 * 29-Oct-2011 : Fixed Eclipse warnings (DG);
 * 02-Jul-2013 : Use ParamChecks class (DG);
 *
 */

package org.jfree.chart;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Paint;
import java.awt.Stroke;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.Serializable;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import org.jfree.chart.annotations.XYAnnotation;
import org.jfree.chart.annotations.XYTextAnnotation;
import org.jfree.chart.axis.CategoryAxis;
import org.jfree.chart.axis.PeriodAxis;
import org.jfree.chart.axis.PeriodAxisLabelInfo;
import org.jfree.chart.axis.SubCategoryAxis;
import org.jfree.chart.axis.SymbolAxis;
import org.jfree.chart.axis.ValueAxis;
import org.jfree.chart.block.Block;
import org.jfree.chart.block.BlockContainer;
import org.jfree.chart.block.LabelBlock;
import org.jfree.chart.plot.CategoryPlot;
import org.jfree.chart.plot.CombinedDomainCategoryPlot;
import org.jfree.chart.plot.CombinedDomainXYPlot;
import org.jfree.chart.plot.CombinedRangeCategoryPlot;
import org.jfree.chart.plot.CombinedRangeXYPlot;
import org.jfree.chart.plot.DefaultDrawingSupplier;
import org.jfree.chart.plot.DrawingSupplier;
import org.jfree.chart.plot.FastScatterPlot;
import org.jfree.chart.plot.MeterPlot;
import org.jfree.chart.plot.MultiplePiePlot;
import org.jfree.chart.plot.PieLabelLinkStyle;
import org.jfree.chart.plot.PiePlot;
import org.jfree.chart.plot.Plot;
import org.jfree.chart.plot.PolarPlot;
import org.jfree.chart.plot.SpiderWebPlot;
import org.jfree.chart.plot.ThermometerPlot;
import org.jfree.chart.plot.XYPlot;
import org.jfree.chart.renderer.AbstractRenderer;
import org.jfree.chart.renderer.category.BarPainter;
import org.jfree.chart.renderer.category.BarRenderer;
import org.jfree.chart.renderer.category.BarRenderer3D;
import org.jfree.chart.renderer.category.CategoryItemRenderer;
import org.jfree.chart.renderer.category.GradientBarPainter;
import org.jfree.chart.renderer.category.LineRenderer3D;
import org.jfree.chart.renderer.category.MinMaxCategoryRenderer;
import org.jfree.chart.renderer.category.StatisticalBarRenderer;
import org.jfree.chart.renderer.xy.GradientXYBarPainter;
import org.jfree.chart.renderer.xy.XYBarPainter;
import org.jfree.chart.renderer.xy.XYBarRenderer;
import org.jfree.chart.renderer.xy.XYItemRenderer;
import org.jfree.chart.title.CompositeTitle;
import org.jfree.chart.title.LegendTitle;
import org.jfree.chart.title.PaintScaleLegend;
import org.jfree.chart.title.TextTitle;
import org.jfree.chart.title.Title;
import org.jfree.chart.util.DefaultShadowGenerator;
import org.jfree.chart.util.ParamChecks;
import org.jfree.chart.util.ShadowGenerator;
import org.jfree.io.SerialUtilities;
import org.jfree.ui.RectangleInsets;
import org.jfree.util.PaintUtilities;
import org.jfree.util.PublicCloneable;

/**
 * A default implementation of the {@link ChartTheme} interface.  This
 * implementation just collects a whole bunch of chart attributes and mimics
 * the manual process of applying each attribute to the right sub-object
 * within the JFreeChart instance.  It's not elegant code, but it works.
 *
 * @since 1.0.11
 */
public class StandardChartTheme implements ChartTheme, Cloneable,
        PublicCloneable, Serializable {

    /** The name of this theme. */
    private String name;

    /**
     * The largest font size.  Use for the main chart title.
     */
    private Font extraLargeFont;

    /**
     * A large font.  Used for subtitles.
     */
    private Font largeFont;

    /**
     * The regular font size.  Used for axis tick labels, legend items etc.
     */
    private Font regularFont;

    /**
     * The small font size.
     */
    private Font smallFont;

    /** The paint used to display the main chart title. */
    private transient Paint titlePaint;

    /** The paint used to display subtitles. */
    private transient Paint subtitlePaint;

    /** The background paint for the chart. */
    private transient Paint chartBackgroundPaint;

    /** The legend background paint. */
    private transient Paint legendBackgroundPaint;

    /** The legend item paint. */
    private transient Paint legendItemPaint;

    /** The drawing supplier. */
    private DrawingSupplier drawingSupplier;

    /** The background paint for the plot. */
    private transient Paint plotBackgroundPaint;

    /** The plot outline paint. */
    private transient Paint plotOutlinePaint;

    /** The label link style for pie charts. */
    private PieLabelLinkStyle labelLinkStyle;

    /** The label link paint for pie charts. */
    private transient Paint labelLinkPaint;

    /** The domain grid line paint. */
    private transient Paint domainGridlinePaint;

    /** The range grid line paint. */
    private transient Paint rangeGridlinePaint;

    /**
     * The baseline paint (used for domain and range zero baselines)
     *
     * @since 1.0.13
     */
    private transient Paint baselinePaint;

    /** The crosshair paint. */
    private transient Paint crosshairPaint;

    /** The axis offsets. */
    private RectangleInsets axisOffset;

    /** The axis label paint. */
    private transient Paint axisLabelPaint;

    /** The tick label paint. */
    private transient Paint tickLabelPaint;

    /** The item label paint. */
    private transient Paint itemLabelPaint;

    /**
     * A flag that controls whether or not shadows are visible (for example,
     * in a bar renderer).
     */
    private boolean shadowVisible;

    /** The shadow paint. */
    private transient Paint shadowPaint;

    /** The bar painter. */
    private BarPainter barPainter;

    /** The XY bar painter. */
    private XYBarPainter xyBarPainter;

    /** The thermometer paint. */
    private transient Paint thermometerPaint;

    /**
     * The paint used to fill the interior of the 'walls' in the background
     * of a plot with a 3D effect.  Applied to BarRenderer3D.
     */
    private transient Paint wallPaint;

    /** The error indicator paint for the {@link StatisticalBarRenderer}. */
    private transient Paint errorIndicatorPaint;

    /** The grid band paint for a {@link SymbolAxis}. */
    private transient Paint gridBandPaint = SymbolAxis.DEFAULT_GRID_BAND_PAINT;

    /** The grid band alternate paint for a {@link SymbolAxis}. */
    private transient Paint gridBandAlternatePaint
            = SymbolAxis.DEFAULT_GRID_BAND_ALTERNATE_PAINT;

    /**
     * The shadow generator (can be null).
     * 
     * @since 1.0.14
     */
    private ShadowGenerator shadowGenerator;

    /** Map for plot specific appliers. */
    private static final Map<Class<?>, PlotApplier> PLOT_APPLIERS = new HashMap<>();

    /** Map for title specific appliers. */
    private static final Map<Class<?>, TitleApplier> TITLE_APPLIERS = new HashMap<>();

    /** Map for category renderer appliers. */
    private static final Map<Class<?>, CategoryRendererApplier> CATEGORY_RENDERER_APPLIERS = new HashMap<>();

    /** Map for value axis specific appliers. */
    private static final Map<Class<?>, ValueAxisApplier> VALUE_AXIS_APPLIERS = new HashMap<>();

    static {
        // Plot appliers
        PLOT_APPLIERS.put(PiePlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyToPiePlot((PiePlot) p);
            }
        });
        PLOT_APPLIERS.put(MultiplePiePlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyToMultiplePiePlot((MultiplePiePlot) p);
            }
        });
        PLOT_APPLIERS.put(CategoryPlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyToCategoryPlot((CategoryPlot) p);
            }
        });
        PLOT_APPLIERS.put(XYPlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyToXYPlot((XYPlot) p);
            }
        });
        PLOT_APPLIERS.put(FastScatterPlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyToFastScatterPlot((FastScatterPlot) p);
            }
        });
        PLOT_APPLIERS.put(MeterPlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyToMeterPlot((MeterPlot) p);
            }
        });
        PLOT_APPLIERS.put(ThermometerPlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyToThermometerPlot((ThermometerPlot) p);
            }
        });
        PLOT_APPLIERS.put(SpiderWebPlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyToSpiderWebPlot((SpiderWebPlot) p);
            }
        });
        PLOT_APPLIERS.put(PolarPlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyToPolarPlot((PolarPlot) p);
            }
        });
        PLOT_APPLIERS.put(CombinedDomainCategoryPlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyCombinedDomainCategoryPlot((CombinedDomainCategoryPlot) p);
            }
        });
        PLOT_APPLIERS.put(CombinedRangeCategoryPlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyCombinedRangeCategoryPlot((CombinedRangeCategoryPlot) p);
            }
        });
        PLOT_APPLIERS.put(CombinedDomainXYPlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyCombinedDomainXYPlot((CombinedDomainXYPlot) p);
            }
        });
        PLOT_APPLIERS.put(CombinedRangeXYPlot.class, new PlotApplier() {
            public void apply(Plot p) {
                ((StandardChartTheme) p.getChart().getTheme()).applyCombinedRangeXYPlot((CombinedRangeXYPlot) p);
            }
        });

        // Title appliers
        TITLE_APPLIERS.put(TextTitle.class, new TitleApplier() {
            public void apply(Title t) {
                ((StandardChartTheme) t.getChart().getTheme()).applyToTextTitle((TextTitle) t);
            }
        });
        TITLE_APPLIERS.put(LegendTitle.class, new TitleApplier() {
            public void apply(Title t) {
                ((StandardChartTheme) t.getChart().getTheme()).applyToLegendTitle((LegendTitle) t);
            }
        });
        TITLE_APPLIERS.put(PaintScaleLegend.class, new TitleApplier() {
            public void apply(Title t) {
                ((StandardChartTheme) t.getChart().getTheme()).applyToPaintScaleLegend((PaintScaleLegend) t);
            }
        });
        TITLE_APPLIERS.put(CompositeTitle.class, new TitleApplier() {
            public void apply(Title t) {
                ((StandardChartTheme) t.getChart().getTheme()).applyToCompositeTitle((CompositeTitle) t);
            }
        });

        // Category renderer appliers
        CATEGORY_RENDERER_APPLIERS.put(BarRenderer.class, new CategoryRendererApplier() {
            public void apply(CategoryItemRenderer r) {
                ((StandardChartTheme) r.getPlot().getChart().getTheme()).applyBarRenderer((BarRenderer) r);
            }
        });
        CATEGORY_RENDERER_APPLIERS.put(BarRenderer3D.class, new CategoryRendererApplier() {
            public void apply(CategoryItemRenderer r) {
                ((StandardChartTheme) r.getPlot().getChart().getTheme()).applyBarRenderer3D((BarRenderer3D) r);
            }
        });
        CATEGORY_RENDERER_APPLIERS.put(LineRenderer3D.class, new CategoryRendererApplier() {
            public void apply(CategoryItemRenderer r) {
                ((StandardChartTheme) r.getPlot().getChart().getTheme()).applyLineRenderer3D((LineRenderer3D) r);
            }
        });
        CATEGORY_RENDERER_APPLIERS.put(StatisticalBarRenderer.class, new CategoryRendererApplier() {
            public void apply(CategoryItemRenderer r) {
                ((StandardChartTheme) r.getPlot().getChart().getTheme()).applyStatisticalBarRenderer((StatisticalBarRenderer) r);
            }
        });
        CATEGORY_RENDERER_APPLIERS.put(MinMaxCategoryRenderer.class, new CategoryRendererApplier() {
            public void apply(CategoryItemRenderer r) {
                ((StandardChartTheme) r.getPlot().getChart().getTheme()).applyMinMaxCategoryRenderer((MinMaxCategoryRenderer) r);
            }
        });

        // Value axis appliers
        VALUE_AXIS_APPLIERS.put(SymbolAxis.class, new ValueAxisApplier() {
            public void apply(ValueAxis a) {
                ((StandardChartTheme) a.getChart().getTheme()).applyToSymbolAxis((SymbolAxis) a);
            }
        });
        VALUE_AXIS_APPLIERS.put(PeriodAxis.class, new ValueAxisApplier() {
            public void apply(ValueAxis a) {
                ((StandardChartTheme) a.getChart().getTheme()).applyToPeriodAxis((PeriodAxis) a);
            }
        });
    }

    /** Interface for plot specific appliers. */
    private interface PlotApplier {
        void apply(Plot plot);
    }

    /** Interface for title specific appliers. */
    private interface TitleApplier {
        void apply(Title title);
    }

    /** Interface for category renderer specific appliers. */
    private interface CategoryRendererApplier {
        void apply(CategoryItemRenderer renderer);
    }

    /** Interface for value axis specific appliers. */
    private interface ValueAxisApplier {
        void apply(ValueAxis axis);
    }

    /**
     * Creates and returns the default 'JFree' chart theme.
     *
     * @return A chart theme.
     */
    public static ChartTheme createJFreeTheme() {
        return new StandardChartTheme("JFree");
    }

    /**
     * Creates and returns a theme called "Darkness".  In this theme, the
     * charts have a black background.
     *
     * @return The "Darkness" theme.
     */
    public static ChartTheme createDarknessTheme() {
        StandardChartTheme theme = new StandardChartTheme("Darkness");
        theme.titlePaint = Color.white;
        theme.subtitlePaint = Color.white;
        theme.legendBackgroundPaint = Color.black;
        theme.legendItemPaint = Color.white;
        theme.chartBackgroundPaint = Color.black;
        theme.plotBackgroundPaint = Color.black;
        theme.plotOutlinePaint = Color.yellow;
        theme.baselinePaint = Color.white;
        theme.crosshairPaint = Color.red;
        theme.labelLinkPaint = Color.lightGray;
        theme.tickLabelPaint = Color.white;
        theme.axisLabelPaint = Color.white;
        theme.shadowPaint = Color.darkGray;
        theme.itemLabelPaint = Color.white;
        theme.drawingSupplier = new DefaultDrawingSupplier(
                new Paint[] {Color.decode("0xFFFF00"),
                        Color.decode("0x0036CC"), Color.decode("0xFF0000"),
                        Color.decode("0xFFFF7F"), Color.decode("0x6681CC"),
                        Color.decode("0xFF7F7F"), Color.decode("0xFFFFBF"),
                        Color.decode("0x99A6CC"), Color.decode("0xFFBFBF"),
                        Color.decode("0xA9A938"), Color.decode("0x2D4587")},
                new Paint[] {Color.decode("0xFFFF00"),
                        Color.decode("0x0036CC")},
                new Stroke[] {new BasicStroke(2.0f)},
                new Stroke[] {new BasicStroke(0.5f)},
                DefaultDrawingSupplier.DEFAULT_SHAPE_SEQUENCE);
        theme.wallPaint = Color.darkGray;
        theme.errorIndicatorPaint = Color.lightGray;
        theme.gridBandPaint = new Color(255, 255, 255, 20);
        theme.gridBandAlternatePaint = new Color(255, 255, 255, 40);
        theme.shadowGenerator = null;
        return theme;
    }

    /**
     * Creates and returns a {@link ChartTheme} that doesn't apply any changes
     * to the JFreeChart defaults.  This produces the "legacy" look for
     * JFreeChart.
     *
     * @return A legacy theme.
     */
    public static ChartTheme createLegacyTheme() {
        StandardChartTheme theme = new StandardChartTheme("Legacy") {
            @Override
            public void apply(JFreeChart chart) {
                // do nothing at all
            }
        };
        return theme;
    }

    /**
     * Creates a new default instance.
     *
     * @param name  the name of the theme (<code>null</code> not permitted).
     */
    public StandardChartTheme(String name) {
        this(name, false);
    }

    /**
     * Creates a new default instance.
     *
     * @param name  the name of the theme (<code>null</code> not permitted).
     * @param shadow  a flag that controls whether a shadow generator is 
     *                included.
     *
     * @since 1.0.14
     */
    public StandardChartTheme(String name, boolean shadow) {
        ParamChecks.nullNotPermitted(name, "name");
        this.name = name;
        this.extraLargeFont = new Font("Tahoma", Font.BOLD, 20);
        this.largeFont = new Font("Tahoma", Font.BOLD, 14);
        this.regularFont = new Font("Tahoma", Font.PLAIN, 12);
        this.smallFont = new Font("Tahoma", Font.PLAIN, 10);
        this.titlePaint = Color.black;
        this.subtitlePaint = Color.black;
        this.legendBackgroundPaint = Color.white;
        this.legendItemPaint = Color.darkGray;
        this.chartBackgroundPaint = Color.white;
        this.drawingSupplier = new DefaultDrawingSupplier();
        this.plotBackgroundPaint = Color.lightGray;
        this.plotOutlinePaint = Color.black;
        this.labelLinkPaint = Color.black;
        this.labelLinkStyle = PieLabelLinkStyle.CUBIC_CURVE;
        this.axisOffset = new RectangleInsets(4, 4, 4, 4);
        this.domainGridlinePaint = Color.white;
        this.rangeGridlinePaint = Color.white;
        this.baselinePaint = Color.black;
        this.crosshairPaint = Color.blue;
        this.axisLabelPaint = Color.darkGray;
        this.tickLabelPaint = Color.darkGray;
        this.barPainter = new GradientBarPainter();
        this.xyBarPainter = new GradientXYBarPainter();
        this.shadowVisible = false;
        this.shadowPaint = Color.gray;
        this.itemLabelPaint = Color.black;
        this.thermometerPaint = Color.white;
        this.wallPaint = BarRenderer3D.DEFAULT_WALL_PAINT;
        this.errorIndicatorPaint = Color.black;
        this.shadowGenerator = shadow ? new DefaultShadowGenerator() : null;
    }

    /**
     * Copy constructor.
     *
     * @param source  the source theme (must not be {@code null}).
     */
    public StandardChartTheme(StandardChartTheme source) {
        ParamChecks.nullNotPermitted(source, "source");
        this.name = source.name;
        this.extraLargeFont = source.extraLargeFont;
        this.largeFont = source.largeFont;
        this.regularFont = source.regularFont;
        this.smallFont = source.smallFont;
        this.titlePaint = source.titlePaint;
        this.subtitlePaint = source.subtitlePaint;
        this.chartBackgroundPaint = source.chartBackgroundPaint;
        this.legendBackgroundPaint = source.legendBackgroundPaint;
        this.legendItemPaint = source.legendItemPaint;
        this.drawingSupplier = source.getDrawingSupplier();
        this.plotBackgroundPaint = source.plotBackgroundPaint;
        this.plotOutlinePaint = source.plotOutlinePaint;
        this.labelLinkStyle = source.labelLinkStyle;
        this.labelLinkPaint = source.labelLinkPaint;
        this.domainGridlinePaint = source.domainGridlinePaint;
        this.rangeGridlinePaint = source.rangeGridlinePaint;
        this.baselinePaint = source.baselinePaint;
        this.crosshairPaint = source.crosshairPaint;
        this.axisOffset = source.axisOffset;
        this.axisLabelPaint = source.axisLabelPaint;
        this.tickLabelPaint = source.tickLabelPaint;
        this.itemLabelPaint = source.itemLabelPaint;
        this.shadowVisible = source.shadowVisible;
        this.shadowPaint = source.shadowPaint;
        this.barPainter = source.barPainter;
        this.xyBarPainter = source.xyBarPainter;
        this.thermometerPaint = source.thermometerPaint;
        this.wallPaint = source.wallPaint;
        this.errorIndicatorPaint = source.errorIndicatorPaint;
        this.gridBandPaint = source.gridBandPaint;
        this.gridBandAlternatePaint = source.gridBandAlternatePaint;
        this.shadowGenerator = source.shadowGenerator;
    }

    // -------------------------------------------------------------------------
    // Getter and setter methods (unchanged)
    // -------------------------------------------------------------------------

    public Font getExtraLargeFont() {
        return this.extraLargeFont;
    }

    public void setExtraLargeFont(Font font) {
        ParamChecks.nullNotPermitted(font, "font");
        this.extraLargeFont = font;
    }

    public Font getLargeFont() {
        return this.largeFont;
    }

    public void setLargeFont(Font font) {
        ParamChecks.nullNotPermitted(font, "font");
        this.largeFont = font;
    }

    public Font getRegularFont() {
        return this.regularFont;
    }

    public void setRegularFont(Font font) {
        ParamChecks.nullNotPermitted(font, "font");
        this.regularFont = font;
    }

    public Font getSmallFont() {
        return this.smallFont;
    }

    public void setSmallFont(Font font) {
        ParamChecks.nullNotPermitted(font, "font");
        this.smallFont = font;
    }

    public Paint getTitlePaint() {
        return this.titlePaint;
    }

    public void setTitlePaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.titlePaint = paint;
    }

    public Paint getSubtitlePaint() {
        return this.subtitlePaint;
    }

    public void setSubtitlePaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.subtitlePaint = paint;
    }

    public Paint getChartBackgroundPaint() {
        return this.chartBackgroundPaint;
    }

    public void setChartBackgroundPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.chartBackgroundPaint = paint;
    }

    public Paint getLegendBackgroundPaint() {
        return this.legendBackgroundPaint;
    }

    public void setLegendBackgroundPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.legendBackgroundPaint = paint;
    }

    public Paint getLegendItemPaint() {
        return this.legendItemPaint;
    }

    public void setLegendItemPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.legendItemPaint = paint;
    }

    public Paint getPlotBackgroundPaint() {
        return this.plotBackgroundPaint;
    }

    public void setPlotBackgroundPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.plotBackgroundPaint = paint;
    }

    public Paint getPlotOutlinePaint() {
        return this.plotOutlinePaint;
    }

    public void setPlotOutlinePaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.plotOutlinePaint = paint;
    }

    public PieLabelLinkStyle getLabelLinkStyle() {
        return this.labelLinkStyle;
    }

    public void setLabelLinkStyle(PieLabelLinkStyle style) {
        ParamChecks.nullNotPermitted(style, "style");
        this.labelLinkStyle = style;
    }

    public Paint getLabelLinkPaint() {
        return this.labelLinkPaint;
    }

    public void setLabelLinkPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.labelLinkPaint = paint;
    }

    public Paint getDomainGridlinePaint() {
        return this.domainGridlinePaint;
    }

    public void setDomainGridlinePaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.domainGridlinePaint = paint;
    }

    public Paint getRangeGridlinePaint() {
        return this.rangeGridlinePaint;
    }

    public void setRangeGridlinePaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.rangeGridlinePaint = paint;
    }

    public Paint getBaselinePaint() {
        return this.baselinePaint;
    }

    public void setBaselinePaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.baselinePaint = paint;
    }

    public Paint getCrosshairPaint() {
        return this.crosshairPaint;
    }

    public void setCrosshairPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.crosshairPaint = paint;
    }

    public RectangleInsets getAxisOffset() {
        return this.axisOffset;
    }

    public void setAxisOffset(RectangleInsets offset) {
        ParamChecks.nullNotPermitted(offset, "offset");
        this.axisOffset = offset;
    }

    public Paint getAxisLabelPaint() {
        return this.axisLabelPaint;
    }

    public void setAxisLabelPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.axisLabelPaint = paint;
    }

    public Paint getTickLabelPaint() {
        return this.tickLabelPaint;
    }

    public void setTickLabelPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.tickLabelPaint = paint;
    }

    public Paint getItemLabelPaint() {
        return this.itemLabelPaint;
    }

    public void setItemLabelPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.itemLabelPaint = paint;
    }

    public boolean isShadowVisible() {
        return this.shadowVisible;
    }

    public void setShadowVisible(boolean visible) {
        this.shadowVisible = visible;
    }

    public Paint getShadowPaint() {
        return this.shadowPaint;
    }

    public void setShadowPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.shadowPaint = paint;
    }

    public BarPainter getBarPainter() {
        return this.barPainter;
    }

    public void setBarPainter(BarPainter painter) {
        ParamChecks.nullNotPermitted(painter, "painter");
        this.barPainter = painter;
    }

    public XYBarPainter getXYBarPainter() {
        return this.xyBarPainter;
    }

    public void setXYBarPainter(XYBarPainter painter) {
        ParamChecks.nullNotPermitted(painter, "painter");
        this.xyBarPainter = painter;
    }

    public Paint getThermometerPaint() {
        return this.thermometerPaint;
    }

    public void setThermometerPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.thermometerPaint = paint;
    }

    public Paint getWallPaint() {
        return this.wallPaint;
    }

    public void setWallPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.wallPaint = paint;
    }

    public Paint getErrorIndicatorPaint() {
        return this.errorIndicatorPaint;
    }

    public void setErrorIndicatorPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.errorIndicatorPaint = paint;
    }

    public Paint getGridBandPaint() {
        return this.gridBandPaint;
    }

    public void setGridBandPaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.gridBandPaint = paint;
    }

    public Paint getGridBandAlternatePaint() {
        return this.gridBandAlternatePaint;
    }

    public void setGridBandAlternatePaint(Paint paint) {
        ParamChecks.nullNotPermitted(paint, "paint");
        this.gridBandAlternatePaint = paint;
    }

    public String getName() {
        return this.name;
    }

    public DrawingSupplier getDrawingSupplier() {
        DrawingSupplier result = null;
        if (this.drawingSupplier instanceof PublicCloneable) {
            PublicCloneable pc = (PublicCloneable) this.drawingSupplier;
            try {
                result = (DrawingSupplier) pc.clone();
            } catch (CloneNotSupportedException e) {
                throw new RuntimeException(e);
            }
        }
        return result;
    }

    public void setDrawingSupplier(DrawingSupplier supplier) {
        ParamChecks.nullNotPermitted(supplier, "supplier");
        this.drawingSupplier = supplier;
    }

    @Override
    public void apply(JFreeChart chart) {
        ParamChecks.nullNotPermitted(chart, "chart");
        TextTitle title = chart.getTitle();
        if (title != null) {
            title.setFont(this.extraLargeFont);
            title.setPaint(this.titlePaint);
        }

        int subtitleCount = chart.getSubtitleCount();
        for (int i = 0; i < subtitleCount; i++) {
            applyToTitle(chart.getSubtitle(i));
        }

        chart.setBackgroundPaint(this.chartBackgroundPaint);

        Plot plot = chart.getPlot();
        if (plot != null) {
            applyToPlot(plot);
        }
    }

    protected void applyToTitle(Title title) {
        TitleApplier applier = TITLE_APPLIERS.get(title.getClass());
        if (applier != null) {
            applier.apply(title);
        }
    }

    private void applyToTextTitle(TextTitle tt) {
        tt.setFont(this.largeFont);
        tt.setPaint(this.subtitlePaint);
    }

    private void applyToLegendTitle(LegendTitle lt) {
        if (lt.getBackgroundPaint() != null) {
            lt.setBackgroundPaint(this.legendBackgroundPaint);
        }
        lt.setItemFont(this.regularFont);
        lt.setItemPaint(this.legendItemPaint);
        if (lt.getWrapper() != null) {
            applyToBlockContainer(lt.getWrapper());
        }
    }

    private void applyToPaintScaleLegend(PaintScaleLegend psl) {
        psl.setBackgroundPaint(this.legendBackgroundPaint);
        ValueAxis axis = psl.getAxis();
        if (axis != null) {
            applyToValueAxis(axis);
        }
    }

    private void applyToCompositeTitle(CompositeTitle ct) {
        BlockContainer bc = ct.getContainer();
        List blocks = bc.getBlocks();
        Iterator iterator = blocks.iterator();
        while (iterator.hasNext()) {
            Block b = (Block) iterator.next();
            if (b instanceof Title) {
                applyToTitle((Title) b);
            }
        }
    }

    protected void applyToBlockContainer(BlockContainer bc) {
        Iterator iterator = bc.getBlocks().iterator();
        while (iterator.hasNext()) {
            Block b = (Block) iterator.next();
            applyToBlock(b);
        }
    }

    protected void applyToBlock(Block b) {
        if (b instanceof Title) {
            applyToTitle((Title) b);
        } else if (b instanceof LabelBlock) {
            LabelBlock lb = (LabelBlock) b;
            lb.setFont(this.regularFont);
            lb.setPaint(this.legendItemPaint);
        }
    }

    protected void applyToPlot(Plot plot) {
        ParamChecks.nullNotPermitted(plot, "plot");
        if (plot.getDrawingSupplier() != null) {
            plot.setDrawingSupplier(getDrawingSupplier());
        }
        if (plot.getBackgroundPaint() != null) {
            plot.setBackgroundPaint(this.plotBackgroundPaint);
        }
        plot.setOutlinePaint(this.plotOutlinePaint);

        PlotApplier applier = PLOT_APPLIERS.get(plot.getClass());
        if (applier != null) {
            applier.apply(plot);
        }
    }

    private void applyCombinedDomainCategoryPlot(CombinedDomainCategoryPlot cp) {
        Iterator iterator = cp.getSubplots().iterator();
        while (iterator.hasNext()) {
            CategoryPlot subplot = (CategoryPlot) iterator.next();
            if (subplot != null) {
                applyToPlot(subplot);
            }
        }
    }

    private void applyCombinedRangeCategoryPlot(CombinedRangeCategoryPlot cp) {
        Iterator iterator = cp.getSubplots().iterator();
        while (iterator.hasNext()) {
            CategoryPlot subplot = (CategoryPlot) iterator.next();
            if (subplot != null) {
                applyToPlot(subplot);
            }
        }
    }

    private void applyCombinedDomainXYPlot(CombinedDomainXYPlot cp) {
        Iterator iterator = cp.getSubplots().iterator();
        while (iterator.hasNext()) {
            XYPlot subplot = (XYPlot) iterator.next();
            if (subplot != null) {
                applyToPlot(subplot);
            }
        }
    }

    private void applyCombinedRangeXYPlot(CombinedRangeXYPlot cp) {
        Iterator iterator = cp.getSubplots().iterator();
        while (iterator.hasNext()) {
            XYPlot subplot = (XYPlot) iterator.next();
            if (subplot != null) {
                applyToPlot(subplot);
            }
        }
    }

    protected void applyToPiePlot(PiePlot plot) {
        plot.setLabelLinkPaint(this.labelLinkPaint);
        plot.setLabelLinkStyle(this.labelLinkStyle);
        plot.setLabelFont(this.regularFont);
        plot.setShadowGenerator(this.shadowGenerator);
        if (plot.getAutoPopulateSectionPaint()) {
            plot.clearSectionPaints(false);
        }
        if (plot.getAutoPopulateSectionOutlinePaint()) {
            plot.clearSectionOutlinePaints(false);
        }
        if (plot.getAutoPopulateSectionOutlineStroke()) {
            plot.clearSectionOutlineStrokes(false);
        }
    }

    protected void applyToMultiplePiePlot(MultiplePiePlot plot) {
        apply(plot.getPieChart());
    }

    protected void applyToCategoryPlot(CategoryPlot plot) {
        plot.setAxisOffset(this.axisOffset);
        plot.setDomainGridlinePaint(this.domainGridlinePaint);
        plot.setRangeGridlinePaint(this.rangeGridlinePaint);
        plot.setRangeZeroBaselinePaint(this.baselinePaint);
        plot.setShadowGenerator(this.shadowGenerator);

        int domainAxisCount = plot.getDomainAxisCount();
        for (int i = 0; i < domainAxisCount; i++) {
            CategoryAxis axis = plot.getDomainAxis(i);
            if (axis != null) {
                applyToCategoryAxis(axis);
            }
        }

        int rangeAxisCount = plot.getRangeAxisCount();
        for (int i = 0; i < rangeAxisCount; i++) {
            ValueAxis axis = plot.getRangeAxis(i);
            if (axis != null) {
                applyToValueAxis(axis);
            }
        }

        int rendererCount = plot.getRendererCount();
        for (int i = 0; i < rendererCount; i++) {
            CategoryItemRenderer r = plot.getRenderer(i);
            if (r != null) {
                applyToCategoryItemRenderer(r);
            }
        }
    }

    protected void applyToXYPlot(XYPlot plot) {
        plot.setAxisOffset(this.axisOffset);
        plot.setDomainZeroBaselinePaint(this.baselinePaint);
        plot.setRangeZeroBaselinePaint(this.baselinePaint);
        plot.setDomainGridlinePaint(this.domainGridlinePaint);
        plot.setRangeGridlinePaint(this.rangeGridlinePaint);
        plot.setDomainCrosshairPaint(this.crosshairPaint);
        plot.setRangeCrosshairPaint(this.crosshairPaint);
        plot.setShadowGenerator(this.shadowGenerator);

        int domainAxisCount = plot.getDomainAxisCount();
        for (int i = 0; i < domainAxisCount; i++) {
            ValueAxis axis = plot.getDomainAxis(i);
            if (axis != null) {
                applyToValueAxis(axis);
            }
        }

        int rangeAxisCount = plot.getRangeAxisCount();
        for (int i = 0; i < rangeAxisCount; i++) {
            ValueAxis axis = plot.getRangeAxis(i);
            if (axis != null) {
                applyToValueAxis(axis);
            }
        }

        int rendererCount = plot.getRendererCount();
        for (int i = 0; i < rendererCount; i++) {
            XYItemRenderer r = plot.getRenderer(i);
            if (r != null) {
                applyToXYItemRenderer(r);
            }
        }

        Iterator iter = plot.getAnnotations().iterator();
        while (iter.hasNext()) {
            XYAnnotation a = (XYAnnotation) iter.next();
            applyToXYAnnotation(a);
        }
    }

    protected void applyToFastScatterPlot(FastScatterPlot plot) {
        plot.setDomainGridlinePaint(this.domainGridlinePaint);
        plot.setRangeGridlinePaint(this.rangeGridlinePaint);
        ValueAxis xAxis = plot.getDomainAxis();
        if (xAxis != null) {
            applyToValueAxis(xAxis);
        }
        ValueAxis yAxis = plot.getRangeAxis();
        if (yAxis != null) {
            applyToValueAxis(yAxis);
        }
    }

    protected void applyToPolarPlot(PolarPlot plot) {
        plot.setAngleLabelFont(this.regularFont);
        plot.setAngleLabelPaint(this.tickLabelPaint);
        plot.setAngleGridlinePaint(this.domainGridlinePaint);
        plot.setRadiusGridlinePaint(this.rangeGridlinePaint);
        ValueAxis axis = plot.getAxis();
        if (axis != null) {
            applyToValueAxis(axis);
        }
    }

    protected void applyToSpiderWebPlot(SpiderWebPlot plot) {
        plot.setLabelFont(this.regularFont);
        plot.setLabelPaint(this.axisLabelPaint);
        plot.setAxisLinePaint(this.axisLabelPaint);
    }

    protected void applyToMeterPlot(MeterPlot plot) {
        plot.setDialBackgroundPaint(this.plotBackgroundPaint);
        plot.setValueFont(this.largeFont);
        plot.setValuePaint(this.axisLabelPaint);
        plot.setDialOutlinePaint(this.plotOutlinePaint);
        plot.setNeedlePaint(this.thermometerPaint);
        plot.setTickLabelFont(this.regularFont);
        plot.setTickLabelPaint(this.tickLabelPaint);
    }

    protected void applyToThermometerPlot(ThermometerPlot plot) {
        plot.setValueFont(this.largeFont);
        plot.setThermometerPaint(this.thermometerPaint);
        ValueAxis axis = plot.getRangeAxis();
        if (axis != null) {
            applyToValueAxis(axis);
        }
    }

    protected void applyToCategoryAxis(CategoryAxis axis) {
        axis.setLabelFont(this.largeFont);
        axis.setLabelPaint(this.axisLabelPaint);
        axis.setTickLabelFont(this.regularFont);
        axis.setTickLabelPaint(this.tickLabelPaint);
        if (axis instanceof SubCategoryAxis) {
            SubCategoryAxis sca = (SubCategoryAxis) axis;
            sca.setSubLabelFont(this.regularFont);
            sca.setSubLabelPaint(this.tickLabelPaint);
        }
    }

    protected void applyToValueAxis(ValueAxis axis) {
        axis.setLabelFont(this.largeFont);
        axis.setLabelPaint(this.axisLabelPaint);
        axis.setTickLabelFont(this.regularFont);
        axis.setTickLabelPaint(this.tickLabelPaint);
        ValueAxisApplier applier = VALUE_AXIS_APPLIERS.get(axis.getClass());
        if (applier != null) {
            applier.apply(axis);
        }
    }

    protected void applyToSymbolAxis(SymbolAxis axis) {
        axis.setGridBandPaint(this.gridBandPaint);
        axis.setGridBandAlternatePaint(this.gridBandAlternatePaint);
    }

    protected void applyToPeriodAxis(PeriodAxis axis) {
        PeriodAxisLabelInfo[] info = axis.getLabelInfo();
        for (int i = 0; i < info.length; i++) {
            PeriodAxisLabelInfo e = info[i];
            PeriodAxisLabelInfo n = new PeriodAxisLabelInfo(e.getPeriodClass(),
                    e.getDateFormat(), e.getPadding(), this.regularFont,
                    this.tickLabelPaint, e.getDrawDividers(),
                    e.getDividerStroke(), e.getDividerPaint());
            info[i] = n;
        }
        axis.setLabelInfo(info);
    }

    protected void applyToAbstractRenderer(AbstractRenderer renderer) {
        if (renderer.getAutoPopulateSeriesPaint()) {
            renderer.clearSeriesPaints(false);
        }
        if (renderer.getAutoPopulateSeriesStroke()) {
            renderer.clearSeriesStrokes(false);
        }
    }

    protected void applyToCategoryItemRenderer(CategoryItemRenderer renderer) {
        ParamChecks.nullNotPermitted(renderer, "renderer");

        if (renderer instanceof AbstractRenderer) {
            applyToAbstractRenderer((AbstractRenderer) renderer);
        }

        renderer.setBaseItemLabelFont(this.regularFont);
        renderer.setBaseItemLabelPaint(this.itemLabelPaint);

        CategoryRendererApplier applier = CATEGORY_RENDERER_APPLIERS.get(renderer.getClass());
        if (applier != null) {
            applier.apply(renderer);
        }
    }

    private void applyBarRenderer(BarRenderer br) {
        br.setBarPainter(this.barPainter);
        br.setShadowVisible(this.shadowVisible);
        br.setShadowPaint(this.shadowPaint);
    }

    private void applyBarRenderer3D(BarRenderer3D br3d) {
        br3d.setWallPaint(this.wallPaint);
    }

    private void applyLineRenderer3D(LineRenderer3D lr3d) {
        lr3d.setWallPaint(this.wallPaint);
    }

    private void applyStatisticalBarRenderer(StatisticalBarRenderer sbr) {
        sbr.setErrorIndicatorPaint(this.errorIndicatorPaint);
    }

    private void applyMinMaxCategoryRenderer(MinMaxCategoryRenderer mmcr) {
        mmcr.setGroupPaint(this.errorIndicatorPaint);
    }

    protected void applyToXYItemRenderer(XYItemRenderer renderer) {
        ParamChecks.nullNotPermitted(renderer, "renderer");
        if (renderer instanceof AbstractRenderer) {
            applyToAbstractRenderer((AbstractRenderer) renderer);
        }
        renderer.setBaseItemLabelFont(this.regularFont);
        renderer.setBaseItemLabelPaint(this.itemLabelPaint);
        if (renderer instanceof XYBarRenderer) {
            XYBarRenderer br = (XYBarRenderer) renderer;
            br.setBarPainter(this.xyBarPainter);
            br.setShadowVisible(this.shadowVisible);
        }
    }

    protected void applyToXYAnnotation(XYAnnotation annotation) {
        ParamChecks.nullNotPermitted(annotation, "annotation");
        if (annotation instanceof XYTextAnnotation) {
            XYTextAnnotation xyta = (XYTextAnnotation) annotation;
            xyta.setFont(this.smallFont);
            xyta.setPaint(this.itemLabelPaint);
        }
    }

    @Override
    public boolean equals(Object obj) {
        if (obj == this) {
            return true;
        }
        if (!(obj instanceof StandardChartTheme)) {
            return false;
        }
        StandardChartTheme that = (StandardChartTheme) obj;
        if (!this.name.equals(that.name)) {
            return false;
        }
        if (!this.extraLargeFont.equals(that.extraLargeFont)) {
            return false;
        }
        if (!this.largeFont.equals(that.largeFont)) {
            return false;
        }
        if (!this.regularFont.equals(that.regularFont)) {
            return false;
        }
        if (!this.smallFont.equals(that.smallFont)) {
            return false;
        }
        if (!PaintUtilities.equal(this.titlePaint, that.titlePaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.subtitlePaint, that.subtitlePaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.chartBackgroundPaint,
                that.chartBackgroundPaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.legendBackgroundPaint,
                that.legendBackgroundPaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.legendItemPaint, that.legendItemPaint)) {
            return false;
        }
        if (!this.drawingSupplier.equals(that.drawingSupplier)) {
            return false;
        }
        if (!PaintUtilities.equal(this.plotBackgroundPaint,
                that.plotBackgroundPaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.plotOutlinePaint,
                that.plotOutlinePaint)) {
            return false;
        }
        if (!this.labelLinkStyle.equals(that.labelLinkStyle)) {
            return false;
        }
        if (!PaintUtilities.equal(this.labelLinkPaint, that.labelLinkPaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.domainGridlinePaint,
                that.domainGridlinePaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.rangeGridlinePaint,
                that.rangeGridlinePaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.crosshairPaint, that.crosshairPaint)) {
            return false;
        }
        if (!this.axisOffset.equals(that.axisOffset)) {
            return false;
        }
        if (!PaintUtilities.equal(this.axisLabelPaint, that.axisLabelPaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.tickLabelPaint, that.tickLabelPaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.itemLabelPaint, that.itemLabelPaint)) {
            return false;
        }
        if (this.shadowVisible != that.shadowVisible) {
            return false;
        }
        if (!PaintUtilities.equal(this.shadowPaint, that.shadowPaint)) {
            return false;
        }
        if (!this.barPainter.equals(that.barPainter)) {
            return false;
        }
        if (!this.xyBarPainter.equals(that.xyBarPainter)) {
            return false;
        }
        if (!PaintUtilities.equal(this.thermometerPaint,
                that.thermometerPaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.wallPaint, that.wallPaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.errorIndicatorPaint,
                that.errorIndicatorPaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.gridBandPaint, that.gridBandPaint)) {
            return false;
        }
        if (!PaintUtilities.equal(this.gridBandAlternatePaint,
                that.gridBandAlternatePaint)) {
            return false;
        }
        return true;
    }

    @Override
    public Object clone() throws CloneNotSupportedException {
        return new StandardChartTheme(this);
    }

    private void writeObject(ObjectOutputStream stream) throws IOException {
        stream.defaultWriteObject();
        SerialUtilities.writePaint(this.titlePaint, stream);
        SerialUtilities.writePaint(this.subtitlePaint, stream);
        SerialUtilities.writePaint(this.chartBackgroundPaint, stream);
        SerialUtilities.writePaint(this.legendBackgroundPaint, stream);
        SerialUtilities.writePaint(this.legendItemPaint, stream);
        SerialUtilities.writePaint(this.plotBackgroundPaint, stream);
        SerialUtilities.writePaint(this.plotOutlinePaint, stream);
        SerialUtilities.writePaint(this.labelLinkPaint, stream);
        SerialUtilities.writePaint(this.baselinePaint, stream);
        SerialUtilities.writePaint(this.domainGridlinePaint, stream);
        SerialUtilities.writePaint(this.rangeGridlinePaint, stream);
        SerialUtilities.writePaint(this.crosshairPaint, stream);
        SerialUtilities.writePaint(this.axisLabelPaint, stream);
        SerialUtilities.writePaint(this.tickLabelPaint, stream);
        SerialUtilities.writePaint(this.itemLabelPaint, stream);
        SerialUtilities.writePaint(this.shadowPaint, stream);
        SerialUtilities.writePaint(this.thermometerPaint, stream);
        SerialUtilities.writePaint(this.wallPaint, stream);
        SerialUtilities.writePaint(this.errorIndicatorPaint, stream);
        SerialUtilities.writePaint(this.gridBandPaint, stream);
        SerialUtilities.writePaint(this.gridBandAlternatePaint, stream);
    }

    private void readObject(ObjectInputStream stream)
        throws IOException, ClassNotFoundException {
        stream.defaultReadObject();
        this.titlePaint = SerialUtilities.readPaint(stream);
        this.subtitlePaint = SerialUtilities.readPaint(stream);
        this.chartBackgroundPaint = SerialUtilities.readPaint(stream);
        this.legendBackgroundPaint = SerialUtilities.readPaint(stream);
        this.legendItemPaint = SerialUtilities.readPaint(stream);
        this.plotBackgroundPaint = SerialUtilities.readPaint(stream);
        this.plotOutlinePaint = SerialUtilities.readPaint(stream);
        this.labelLinkPaint = SerialUtilities.readPaint(stream);
        this.baselinePaint = SerialUtilities.readPaint(stream);
        this.domainGridlinePaint = SerialUtilities.readPaint(stream);
        this.rangeGridlinePaint = SerialUtilities.readPaint(stream);
        this.crosshairPaint = SerialUtilities.readPaint(stream);
        this.axisLabelPaint = SerialUtilities.readPaint(stream);
        this.tickLabelPaint = SerialUtilities.readPaint(stream);
        this.itemLabelPaint = SerialUtilities.readPaint(stream);
        this.shadowPaint = SerialUtilities.readPaint(stream);
        this.thermometerPaint = SerialUtilities.readPaint(stream);
        this.wallPaint = SerialUtilities.readPaint(stream);
        this.errorIndicatorPaint = SerialUtilities.readPaint(stream);
        this.gridBandPaint = SerialUtilities.readPaint(stream);
        this.gridBandAlternatePaint = SerialUtilities.readPaint(stream);
    }
}