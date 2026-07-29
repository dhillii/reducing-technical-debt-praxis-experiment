package org.jfree.chart;

import java.awt.AWTEvent;
import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Composite;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.GraphicsConfiguration;
import java.awt.Image;
import java.awt.Insets;
import java.awt.Paint;
import java.awt.Point;
import java.awt.Rectangle;
import java.awt.Toolkit;
import java.awt.Transparency;
import java.awt.datatransfer.Clipboard;
import java.awt.event.ActionEvent;
import java.awt.event.InputEvent;
import java.awt.event.MouseEvent;
import java.awt.event.MouseListener;
import java.awt.event.MouseMotionListener;
import java.awt.geom.AffineTransform;
import java.awt.geom.Line2D;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.awt.print.PageFormat;
import java.awt.print.Printable;
import java.awt.print.PrinterException;
import java.awt.print.PrinterJob;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.Serializable;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.EventListener;
import java.util.Iterator;
import java.util.List;
import java.util.ResourceBundle;

import javax.swing.JFileChooser;
import javax.swing.JMenu;
import javax.swing.JMenuItem;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JPopupMenu;
import javax.swing.SwingUtilities;
import javax.swing.ToolTipManager;
import javax.swing.event.EventListenerList;
import javax.swing.filechooser.FileNameExtensionFilter;

import org.jfree.chart.editor.ChartEditor;
import org.jfree.chart.editor.ChartEditorManager;
import org.jfree.chart.entity.ChartEntity;
import org.jfree.chart.entity.EntityCollection;
import org.jfree.chart.event.ChartChangeEvent;
import org.jfree.chart.event.ChartChangeListener;
import org.jfree.chart.event.ChartProgressEvent;
import org.jfree.chart.event.ChartProgressListener;
import org.jfree.chart.panel.Overlay;
import org.jfree.chart.event.OverlayChangeEvent;
import org.jfree.chart.event.OverlayChangeListener;
import org.jfree.chart.plot.Pannable;
import org.jfree.chart.plot.Plot;
import org.jfree.chart.plot.PlotOrientation;
import org.jfree.chart.plot.PlotRenderingInfo;
import org.jfree.chart.plot.Zoomable;
import org.jfree.chart.util.ParamChecks;
import org.jfree.chart.util.ResourceBundleWrapper;
import org.jfree.io.SerialUtilities;

/**
 * A Swing GUI component for displaying a {@link JFreeChart} object.
 * <P>
 * The panel registers with the chart to receive notification of changes to any
 * component of the chart.  The chart is redrawn automatically whenever this
 * notification is received.
 */
public class ChartPanel extends JPanel implements ChartChangeListener,
        ChartProgressListener, ActionListener, MouseListener,
        MouseMotionListener, OverlayChangeListener, Printable, Serializable {

    /** For serialization. */
    private static final long serialVersionUID = 6046366297214274674L;

    /** Default setting for buffer usage.  The default has been changed to
     * <code>true</code> from version 1.0.13 onwards, because of a severe
     * performance problem with drawing the zoom rectangle using XOR (which
     * now happens only when the buffer is NOT used).
     */
    public static final boolean DEFAULT_BUFFER_USED = true;

    /** The default panel width. */
    public static final int DEFAULT_WIDTH = 680;

    /** The default panel height. */
    public static final int DEFAULT_HEIGHT = 420;

    /** The default limit below which chart scaling kicks in. */
    public static final int DEFAULT_MINIMUM_DRAW_WIDTH = 300;

    /** The default limit below which chart scaling kicks in. */
    public static final int DEFAULT_MINIMUM_DRAW_HEIGHT = 200;

    /** The default limit above which chart scaling kicks in. */
    public static final int DEFAULT_MAXIMUM_DRAW_WIDTH = 1024;

    /** The default limit above which chart scaling kicks in. */
    public static final int DEFAULT_MAXIMUM_DRAW_HEIGHT = 768;

    /** The minimum size required to perform a zoom on a rectangle */
    public static final int DEFAULT_ZOOM_TRIGGER_DISTANCE = 10;

    /** Properties action command. */
    public static final String PROPERTIES_COMMAND = "PROPERTIES";

    /**
     * Copy action command.
     *
     * @since 1.0.13
     */
    public static final String COPY_COMMAND = "COPY";

    /** Save action command. */
    public static final String SAVE_COMMAND = "SAVE";

    /** Action command to save as PNG. */
    private static final String SAVE_AS_PNG_COMMAND = "SAVE_AS_PNG";

    /** Action command to save as SVG. */
    private static final String SAVE_AS_SVG_COMMAND = "SAVE_AS_SVG";

    /** Action command to save as PDF. */
    private static final String SAVE_AS_PDF_COMMAND = "SAVE_AS_PDF";

    /** Print action command. */
    public static final String PRINT_COMMAND = "PRINT";

    /** Zoom in (both axes) action command. */
    public static final String ZOOM_IN_BOTH_COMMAND = "ZOOM_IN_BOTH";

    /** Zoom in (domain axis only) action command. */
    public static final String ZOOM_IN_DOMAIN_COMMAND = "ZOOM_IN_DOMAIN";

    /** Zoom in (range axis only) action command. */
    public static final String ZOOM_IN_RANGE_COMMAND = "ZOOM_IN_RANGE";

    /** Zoom out (both axes) action command. */
    public static final String ZOOM_OUT_BOTH_COMMAND = "ZOOM_OUT_BOTH";

    /** Zoom out (domain axis only) action command. */
    public static final String ZOOM_OUT_DOMAIN_COMMAND = "ZOOM_DOMAIN_BOTH";

    /** Zoom out (range axis only) action command. */
    public static final String ZOOM_OUT_RANGE_COMMAND = "ZOOM_RANGE_BOTH";

    /** Zoom reset (both axes) action command. */
    public static final String ZOOM_RESET_BOTH_COMMAND = "ZOOM_RESET_BOTH";

    /** Zoom reset (domain axis only) action command. */
    public static final String ZOOM_RESET_DOMAIN_COMMAND = "ZOOM_RESET_DOMAIN";

    /** Zoom reset (range axis only) action command. */
    public static final String ZOOM_RESET_RANGE_COMMAND = "ZOOM_RESET_RANGE";

    /** The chart that is displayed in the panel. */
    private JFreeChart chart;

    /** Storage for registered (chart) mouse listeners. */
    private transient EventListenerList chartMouseListeners;

    /** A flag that controls whether or not the off-screen buffer is used. */
    private boolean useBuffer;

    /** A flag that indicates that the buffer should be refreshed. */
    private boolean refreshBuffer;

    /** A buffer for the rendered chart. */
    private transient Image chartBuffer;

    /** The height of the chart buffer. */
    private int chartBufferHeight;

    /** The width of the chart buffer. */
    private int chartBufferWidth;

    /**
     * The minimum width for drawing a chart (uses scaling for smaller widths).
     */
    private int minimumDrawWidth;

    /**
     * The minimum height for drawing a chart (uses scaling for smaller
     * heights).
     */
    private int minimumDrawHeight;

    /**
     * The maximum width for drawing a chart (uses scaling for bigger
     * widths).
     */
    private int maximumDrawWidth;

    /**
     * The maximum height for drawing a chart (uses scaling for bigger
     * heights).
     */
    private int maximumDrawHeight;

    /** The popup menu for the frame. */
    private JPopupMenu popup;

    /** The drawing info collected the last time the chart was drawn. */
    private ChartRenderingInfo info;

    /** The chart anchor point. */
    private Point2D anchor;

    /** The scale factor used to draw the chart. */
    private double scaleX;

    /** The scale factor used to draw the chart. */
    private double scaleY;

    /** The plot orientation. */
    private PlotOrientation orientation = PlotOrientation.VERTICAL;

    /** A flag that controls whether or not domain zooming is enabled. */
    private boolean domainZoomable = false;

    /** A flag that controls whether or not range zooming is enabled. */
    private boolean rangeZoomable = false;

    /**
     * The zoom rectangle starting point (selected by the user with a mouse
     * click).  This is a point on the screen, not the chart (which may have
     * been scaled up or down to fit the panel).
     */
    private Point2D zoomPoint = null;

    /** The zoom rectangle (selected by the user with the mouse). */
    private transient Rectangle2D zoomRectangle = null;

    /** Controls if the zoom rectangle is drawn as an outline or filled. */
    private boolean fillZoomRectangle = true;

    /** The minimum distance required to drag the mouse to trigger a zoom. */
    private int zoomTriggerDistance;

    /** A flag that controls whether or not horizontal tracing is enabled. */
    private boolean horizontalAxisTrace = false;

    /** A flag that controls whether or not vertical tracing is enabled. */
    private boolean verticalAxisTrace = false;

    /** A vertical trace line. */
    private transient Line2D verticalTraceLine;

    /** A horizontal trace line. */
    private transient Line2D horizontalTraceLine;

    /** Menu item for zooming in on a chart (both axes). */
    private JMenuItem zoomInBothMenuItem;

    /** Menu item for zooming in on a chart (domain axis). */
    private JMenuItem zoomInDomainMenuItem;

    /** Menu item for zooming in on a chart (range axis). */
    private JMenuItem zoomInRangeMenuItem;

    /** Menu item for zooming out on a chart. */
    private JMenuItem zoomOutBothMenuItem;

    /** Menu item for zooming out on a chart (domain axis). */
    private JMenuItem zoomOutDomainMenuItem;

    /** Menu item for zooming out on a chart (range axis). */
    private JMenuItem zoomOutRangeMenuItem;

    /** Menu item for resetting the zoom (both axes). */
    private JMenuItem zoomResetBothMenuItem;

    /** Menu item for resetting the zoom (domain axis only). */
    private JMenuItem zoomResetDomainMenuItem;

    /** Menu item for resetting the zoom (range axis only). */
    private JMenuItem zoomResetRangeMenuItem;

    /**
     * The default directory for saving charts to file.
     *
     * @since 1.0.7
     */
    private File defaultDirectoryForSaveAs;

    /** A flag that controls whether or not file extensions are enforced. */
    private boolean enforceFileExtensions;

    /** A flag that indicates if original tooltip delays are changed. */
    private boolean ownToolTipDelaysActive;

    /** Original initial tooltip delay of ToolTipManager.sharedInstance(). */
    private int originalToolTipInitialDelay;

    /** Original reshow tooltip delay of ToolTipManager.sharedInstance(). */
    private int originalToolTipReshowDelay;

    /** Original dismiss tooltip delay of ToolTipManager.sharedInstance(). */
    private int originalToolTipDismissDelay;

    /** Own initial tooltip delay to be used in this chart panel. */
    private int ownToolTipInitialDelay;

    /** Own reshow tooltip delay to be used in this chart panel. */
    private int ownToolTipReshowDelay;

    /** Own dismiss tooltip delay to be used in this chart panel. */
    private int ownToolTipDismissDelay;

    /** The factor used to zoom in on an axis range. */
    private double zoomInFactor = 0.5;

    /** The factor used to zoom out on an axis range. */
    private double zoomOutFactor = 2.0;

    /**
     * A flag that controls whether zoom operations are centred on the
     * current anchor point, or the centre point of the relevant axis.
     *
     * @since 1.0.7
     */
    private boolean zoomAroundAnchor;

    /**
     * The paint used to draw the zoom rectangle outline.
     *
     * @since 1.0.13
     */
    private transient Paint zoomOutlinePaint;

    /**
     * The zoom fill paint (should use transparency).
     *
     * @since 1.0.13
     */
    private transient Paint zoomFillPaint;

    /** The resourceBundle for the localization. */
    protected static ResourceBundle localizationResources
            = ResourceBundleWrapper.getBundle(
                    "org.jfree.chart.LocalizationBundle");

    /** 
     * Temporary storage for the width and height of the chart 
     * drawing area during panning.
     */
    private double panW, panH;

    /** The last mouse position during panning. */
    private Point panLast;

    /**
     * The mask for mouse events to trigger panning.
     *
     * @since 1.0.13
     */
    private int panMask = InputEvent.CTRL_MASK;

    /**
     * A list of overlays for the panel.
     *
     * @since 1.0.13
     */
    private List overlays;
    
    // Constructors omitted for brevity (unchanged)

    // ... (other methods unchanged)

    /**
     * Paints the component by drawing the chart to fill the entire component,
     * but allowing for the insets (which will be non-zero if a border has been
     * set for this component).  To increase performance (at the expense of
     * memory), an off-screen buffer image can be used.
     *
     * @param g  the graphics device for drawing on.
     */
    @Override
    public void paintComponent(Graphics g) {
        super.paintComponent(g);
        if (this.chart == null) {
            return;
        }
        Graphics2D g2 = (Graphics2D) g.create();
        try {
            Dimension size = getSize();
            Insets insets = getInsets();
            Rectangle2D available = new Rectangle2D.Double(insets.left, insets.top,
                    size.getWidth() - insets.left - insets.right,
                    size.getHeight() - insets.top - insets.bottom);

            boolean scaleNeeded = calculateScale(available);
            Rectangle2D chartArea = new Rectangle2D.Double(0.0, 0.0,
                    this.scaleX * available.getWidth() / this.scaleX,
                    this.scaleY * available.getHeight() / this.scaleY);

            if (this.useBuffer) {
                handleBuffer(g2, available, chartArea, scaleNeeded);
            } else {
                drawChartDirectly(g2, available, chartArea, scaleNeeded);
            }

            drawOverlays(g2);
            drawZoomRectangle(g2, !this.useBuffer);
        } finally {
            g2.dispose();
        }

        this.anchor = null;
        this.verticalTraceLine = null;
        this.horizontalTraceLine = null;
    }

    /**
     * Calculates the scaling factors for the chart and updates the internal
     * state.  The method returns {@code true} if scaling is required.
     *
     * @param available  the available drawing area.
     * @return {@code true} if scaling is required.
     */
    private boolean calculateScale(Rectangle2D available) {
        double drawWidth = available.getWidth();
        double drawHeight = available.getHeight();
        this.scaleX = 1.0;
        this.scaleY = 1.0;
        boolean scale = false;

        if (drawWidth < this.minimumDrawWidth) {
            this.scaleX = drawWidth / this.minimumDrawWidth;
            drawWidth = this.minimumDrawWidth;
            scale = true;
        } else if (drawWidth > this.maximumDrawWidth) {
            this.scaleX = drawWidth / this.maximumDrawWidth;
            drawWidth = this.maximumDrawWidth;
            scale = true;
        }

        if (drawHeight < this.minimumDrawHeight) {
            this.scaleY = drawHeight / this.minimumDrawHeight;
            drawHeight = this.minimumDrawHeight;
            scale = true;
        } else if (drawHeight > this.maximumDrawHeight) {
            this.scaleY = drawHeight / this.maximumDrawHeight;
            drawHeight = this.maximumDrawHeight;
            scale = true;
        }

        return scale;
    }

    /**
     * Handles drawing when an off‑screen buffer is used.
     *
     * @param g2          the graphics context.
     * @param available   the available drawing area.
     * @param chartArea   the chart area to draw.
     * @param scaleNeeded {@code true} if scaling is required.
     */
    private void handleBuffer(Graphics2D g2, Rectangle2D available,
            Rectangle2D chartArea, boolean scaleNeeded) {

        Insets insets = getInsets();

        if ((this.chartBuffer == null)
                || (this.chartBufferWidth != (int) available.getWidth())
                || (this.chartBufferHeight != (int) available.getHeight())) {
            this.chartBufferWidth = (int) available.getWidth();
            this.chartBufferHeight = (int) available.getHeight();
            GraphicsConfiguration gc = g2.getDeviceConfiguration();
            this.chartBuffer = gc.createCompatibleImage(
                    this.chartBufferWidth, this.chartBufferHeight,
                    Transparency.TRANSLUCENT);
            this.refreshBuffer = true;
        }

        if (this.refreshBuffer) {
            this.refreshBuffer = false;
            Rectangle2D bufferArea = new Rectangle2D.Double(
                    0, 0, this.chartBufferWidth, this.chartBufferHeight);
            Graphics2D bufferG2 = (Graphics2D) this.chartBuffer.getGraphics();
            Composite savedComposite = bufferG2.getComposite();
            bufferG2.setComposite(AlphaComposite.getInstance(
                    AlphaComposite.CLEAR, 0.0f));
            bufferG2.fill(new Rectangle(this.chartBufferWidth, this.chartBufferHeight));
            bufferG2.setComposite(savedComposite);

            if (scaleNeeded) {
                AffineTransform saved = bufferG2.getTransform();
                AffineTransform st = AffineTransform.getScaleInstance(
                        this.scaleX, this.scaleY);
                bufferG2.transform(st);
                this.chart.draw(bufferG2, chartArea, this.anchor, this.info);
                bufferG2.setTransform(saved);
            } else {
                this.chart.draw(bufferG2, bufferArea, this.anchor, this.info);
            }
            bufferG2.dispose();
        }

        g2.drawImage(this.chartBuffer, insets.left, insets.top, this);
    }

    /**
     * Draws the chart directly onto the component (no buffer).
     *
     * @param g2          the graphics context.
     * @param available   the available drawing area.
     * @param chartArea   the chart area to draw.
     * @param scaleNeeded {@code true} if scaling is required.
     */
    private void drawChartDirectly(Graphics2D g2, Rectangle2D available,
            Rectangle2D chartArea, boolean scaleNeeded) {

        Insets insets = getInsets();
        AffineTransform saved = g2.getTransform();
        g2.translate(insets.left, insets.top);
        if (scaleNeeded) {
            AffineTransform st = AffineTransform.getScaleInstance(
                    this.scaleX, this.scaleY);
            g2.transform(st);
        }
        this.chart.draw(g2, chartArea, this.anchor, this.info);
        g2.setTransform(saved);
    }

    /**
     * Draws all overlays that have been added to the panel.
     *
     * @param g2 the graphics context.
     */
    private void drawOverlays(Graphics2D g2) {
        Iterator iterator = this.overlays.iterator();
        while (iterator.hasNext()) {
            Overlay overlay = (Overlay) iterator.next();
            overlay.paintOverlay(g2, this);
        }
    }

    // Remaining methods unchanged...

    /**
     * Handles a 'mouse pressed' event.
     * <P>
     * This event is the popup trigger on Unix/Linux.  For Windows, the popup
     * trigger is the 'mouse released' event.
     *
     * @param e  The mouse event.
     */
    @Override
    public void mousePressed(MouseEvent e) {
        if (this.chart == null) {
            return;
        }
        Plot plot = this.chart.getPlot();
        int mods = e.getModifiers();
        if ((mods & this.panMask) == this.panMask) {
            if (plot instanceof Pannable) {
                Pannable pannable = (Pannable) plot;
                if (pannable.isDomainPannable() || pannable.isRangePannable()) {
                    Rectangle2D screenDataArea = getScreenDataArea(e.getX(),
                            e.getY());
                    if (screenDataArea != null && screenDataArea.contains(
                            e.getPoint())) {
                        this.panW = screenDataArea.getWidth();
                        this.panH = screenDataArea.getHeight();
                        this.panLast = e.getPoint();
                        setCursor(Cursor.getPredefinedCursor(
                                Cursor.MOVE_CURSOR));
                    }
                }
            }
        } else if (this.zoomRectangle == null) {
            Rectangle2D screenDataArea = getScreenDataArea(e.getX(), e.getY());
            if (screenDataArea != null) {
                this.zoomPoint = getPointInRectangle(e.getX(), e.getY(),
                        screenDataArea);
            } else {
                this.zoomPoint = null;
            }
            if (e.isPopupTrigger()) {
                if (this.popup != null) {
                    displayPopupMenu(e.getX(), e.getY());
                }
            }
        }
    }

    // ... (rest of the class unchanged)
}