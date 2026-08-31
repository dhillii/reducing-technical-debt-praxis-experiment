public void render(Graphics2D g2, Rectangle2D dataArea,
                       PlotRenderingInfo info, CrosshairState crosshairState) {

        RenderParameters params = new RenderParameters(
            this.dataset, this.colorBar, this.clipPath, this.renderAsPoints,
            this.domainAxis, this.rangeAxis, this.missingPaint,
            this.ptSizePct, this.domainCrosshairValue, this.rangeCrosshairValue,
            this.domainCrosshairVisible, this.rangeCrosshairVisible,
            this.domainCrosshairLockedOnData, this.rangeCrosshairLockedOnData,
            this.domainCrosshairStroke, this.domainCrosshairPaint,
            this.rangeCrosshairStroke, this.rangeCrosshairPaint,
            this.toolTipGenerator, this.annotations, this.drawingSupply);
        renderWith(g2, dataArea, info, crosshairState, params);
    }

    private void renderWith(Graphics2D g2, Rectangle2D dataArea,
                            PlotRenderingInfo info, CrosshairState crosshairState,
                            RenderParameters params) {
        if (params.dataset != null) {
            if (params.clipPath != null) {
                GeneralPath clipper = params.clipPath.draw(g2, dataArea,
                        params.domainAxis, params.rangeAxis);
                if (params.clipPath.isClip()) {
                    g2.clip(clipper);
                }
            }

            if (params.renderAsPoints) {
                pointRendererWith(g2, dataArea, info, params);
            } else {
                contourRendererWith(g2, dataArea, info, params);
            }

            if (params.domainCrosshairVisible) {
                drawVerticalLine(g2, dataArea,
                        params.domainCrosshairValue,
                        params.domainCrosshairStroke,
                        params.domainCrosshairPaint);
            }

            if (params.rangeCrosshairVisible) {
                drawHorizontalLine(g2, dataArea,
                        params.rangeCrosshairValue,
                        params.rangeCrosshairStroke,
                        params.rangeCrosshairPaint);
            }
        } else if (params.clipPath != null) {
            params.clipPath.draw(g2, dataArea, params.domainAxis, params.rangeAxis);
        }
    }

    private void contourRendererWith(Graphics2D g2, Rectangle2D dataArea,
                                     PlotRenderingInfo info, RenderParameters params) {
        EntityCollection entities = (info != null) ? info.getOwner().getEntityCollection() : null;
        Rectangle2D.Double rect = new Rectangle2D.Double();
        Object antiAlias = g2.getRenderingHint(RenderingHints.KEY_ANTIALIASING);
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                RenderingHints.VALUE_ANTIALIAS_OFF);

        Number[] xNumber = params.dataset.getXValues();
        Number[] yNumber = params.dataset.getYValues();
        Number[] zNumber = params.dataset.getZValues();

        double[] x = new double[xNumber.length];
        double[] y = new double[yNumber.length];
        for (int i = 0; i < x.length; i++) {
            x[i] = xNumber[i].doubleValue();
            y[i] = yNumber[i].doubleValue();
        }

        int[] xIndex = params.dataset.indexX();
        int[] indexX = params.dataset.getXIndices();
        boolean vertInverted = ((NumberAxis) params.rangeAxis).isInverted();
        boolean horizInverted = false;
        if (params.domainAxis instanceof NumberAxis) {
            horizInverted = ((NumberAxis) params.domainAxis).isInverted();
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
                    transX = params.domainAxis.valueToJava2D(x[k], dataArea, RectangleEdge.BOTTOM);
                    transXm1 = transX;
                    transXp1 = params.domainAxis.valueToJava2D(
                            x[indexX[i + 1]], dataArea, RectangleEdge.BOTTOM);
                    transDXm1 = Math.abs(0.5 * (transX - transXm1));
                    transDXp1 = Math.abs(0.5 * (transX - transXp1));
                } else if (i == iMax) {
                    transX = params.domainAxis.valueToJava2D(x[k], dataArea, RectangleEdge.BOTTOM);
                    transXm1 = params.domainAxis.valueToJava2D(x[indexX[i - 1]],
                            dataArea, RectangleEdge.BOTTOM);
                    transXp1 = transX;
                    transDXm1 = Math.abs(0.5 * (transX - transXm1));
                    transDXp1 = Math.abs(0.5 * (transX - transXp1));
                } else {
                    transX = params.domainAxis.valueToJava2D(x[k], dataArea, RectangleEdge.BOTTOM);
                    transXp1 = params.domainAxis.valueToJava2D(x[indexX[i + 1]],
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

                transY = params.rangeAxis.valueToJava2D(y[k], dataArea,RectangleEdge.LEFT);
                transYm1 = transY;
                if (k + 1 == y.length) { continue; }
                transYp1 = params.rangeAxis.valueToJava2D(y[k + 1], dataArea, RectangleEdge.LEFT);
                transDYm1 = Math.abs(0.5 * (transY - transYm1));
                transDYp1 = Math.abs(0.5 * (transY - transYp1));
            } else if ((i < indexX.length - 1 && indexX[i + 1] - 1 == k) || k == x.length - 1) {
                transY = params.rangeAxis.valueToJava2D(y[k], dataArea, RectangleEdge.LEFT);
                transYm1 = params.rangeAxis.valueToJava2D(y[k - 1], dataArea, RectangleEdge.LEFT);
                transYp1 = transY;
                transDYm1 = Math.abs(0.5 * (transY - transYm1));
                transDYp1 = Math.abs(0.5 * (transY - transYp1));
            } else {
                transY = params.rangeAxis.valueToJava2D(y[k], dataArea, RectangleEdge.LEFT);
                transYp1 = params.rangeAxis.valueToJava2D(y[k + 1], dataArea, RectangleEdge.LEFT);
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
                g2.setPaint(params.colorBar.getPaint(zNumber[k].doubleValue()));
                g2.fill(rect);
            } else if (params.missingPaint != null) {
                g2.setPaint(params.missingPaint);
                g2.fill(rect);
            }

            if (entities != null) {
                String tip = (params.toolTipGenerator != null)
                        ? params.toolTipGenerator.generateToolTip(params.dataset, k) : "";
                String url = null;
                ContourEntity entity = new ContourEntity(
                        (Rectangle2D.Double) rect.clone(), tip, url);
                entity.setIndex(k);
                entities.add(entity);
            }
        }
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, antiAlias);
    }

    private void pointRendererWith(Graphics2D g2, Rectangle2D dataArea,
                                   PlotRenderingInfo info, RenderParameters params) {
        EntityCollection entities = (info != null) ? info.getOwner().getEntityCollection() : null;
        RectangularShape rect = new Ellipse2D.Double();
        Object antiAlias = g2.getRenderingHint(RenderingHints.KEY_ANTIALIASING);
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                RenderingHints.VALUE_ANTIALIAS_OFF);

        Number[] xNumber = params.dataset.getXValues();
        Number[] yNumber = params.dataset.getYValues();
        Number[] zNumber = params.dataset.getZValues();

        double[] x = new double[xNumber.length];
        double[] y = new double[yNumber.length];
        for (int i = 0; i < x.length; i++) {
            x[i] = xNumber[i].doubleValue();
            y[i] = yNumber[i].doubleValue();
        }

        double size = dataArea.getWidth() * params.ptSizePct;

        for (int k = 0; k < x.length; k++) {
            double transX = params.domainAxis.valueToJava2D(x[k], dataArea, RectangleEdge.BOTTOM) - 0.5 * size;
            double transY = params.rangeAxis.valueToJava2D(y[k], dataArea, RectangleEdge.LEFT) - 0.5 * size;

            rect.setFrame(transX, transY, size, size);

            if (zNumber[k] != null) {
                g2.setPaint(params.colorBar.getPaint(zNumber[k].doubleValue()));
                g2.fill(rect);
            } else if (params.missingPaint != null) {
                g2.setPaint(params.missingPaint);
                g2.fill(rect);
            }

            if (entities != null) {
                String tip = (params.toolTipGenerator != null)
                        ? params.toolTipGenerator.generateToolTip(params.dataset, k) : "";
                String url = null;
                ContourEntity entity = new ContourEntity(
                        (RectangularShape) rect.clone(), tip, url);
                entity.setIndex(k);
                entities.add(entity);
            }
        }
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, antiAlias);
    }

    private static class RenderParameters {
        final ContourDataset dataset;
        final ColorBar colorBar;
        final ClipPath clipPath;
        final boolean renderAsPoints;
        final ValueAxis domainAxis;
        final ValueAxis rangeAxis;
        final Paint missingPaint;
        final double ptSizePct;
        final double domainCrosshairValue;
        final double rangeCrosshairValue;
        final boolean domainCrosshairVisible;
        final boolean rangeCrosshairVisible;
        final boolean domainCrosshairLockedOnData;
        final boolean rangeCrosshairLockedOnData;
        final Stroke domainCrosshairStroke;
        final Paint domainCrosshairPaint;
        final Stroke rangeCrosshairStroke;
        final Paint rangeCrosshairPaint;
        final ContourToolTipGenerator toolTipGenerator;
        final List annotations;
        final Object drawingSupply;

        @SuppressWarnings("unused")
        RenderParametersBuilder builder() {
            return new RenderParametersBuilder();
        }

        RenderParameters(ContourDataset dataset, ColorBar colorBar, ClipPath clipPath, boolean renderAsPoints,
                         ValueAxis domainAxis, ValueAxis rangeAxis, Paint missingPaint, double ptSizePct,
                         double domainCrosshairValue, double rangeCrosshairValue,
                         boolean domainCrosshairVisible, boolean rangeCrosshairVisible,
                         boolean domainCrosshairLockedOnData, boolean rangeCrosshairLockedOnData,
                         Stroke domainCrosshairStroke, Paint domainCrosshairPaint,
                         Stroke rangeCrosshairStroke, Paint rangeCrosshairPaint,
                         ContourToolTipGenerator toolTipGenerator, List annotations, Object drawingSupply) {
            this.dataset = dataset;
            this.colorBar = colorBar;
            this.clipPath = clipPath;
            this.renderAsPoints = renderAsPoints;
            this.domainAxis = domainAxis;
            this.rangeAxis = rangeAxis;
            this.missingPaint = missingPaint;
            this.ptSizePct = ptSizePct;
            this.domainCrosshairValue = domainCrosshairValue;
            this.rangeCrosshairValue = rangeCrosshairValue;
            this.domainCrosshairVisible = domainCrosshairVisible;
            this.rangeCrosshairVisible = rangeCrosshairVisible;
            this.domainCrosshairLockedOnData = domainCrosshairLockedOnData;
            this.rangeCrosshairLockedOnData = rangeCrosshairLockedOnData;
            this.domainCrosshairStroke = domainCrosshairStroke;
            this.domainCrosshairPaint = domainCrosshairPaint;
            this.rangeCrosshairStroke = rangeCrosshairStroke;
            this.rangeCrosshairPaint = rangeCrosshairPaint;
            this.toolTipGenerator = toolTipGenerator;
            this.annotations = annotations;
            this.drawingSupply = drawingSupply;
        }
    }

    private static class RenderParametersBuilder {
        private ContourDataset dataset;
        private ColorBar colorBar;
        private ClipPath clipPath;
        private boolean renderAsPoints;
        private ValueAxis domainAxis;
        private ValueAxis rangeAxis;
        private Paint missingPaint;
        private double ptSizePct;
        private double domainCrosshairValue;
        private double rangeCrosshairValue;
        private boolean domainCrosshairVisible;
        private boolean rangeCrosshairVisible;
        private boolean domainCrosshairLockedOnData;
        private boolean rangeCrosshairLockedOnData;
        private Stroke domainCrosshairStroke;
        private Paint domainCrosshairPaint;
        private Stroke rangeCrosshairStroke;
        private Paint rangeCrosshairPaint;
        private ContourToolTipGenerator toolTipGenerator;
        private List annotations;
        private Object drawingSupply;

        RenderParametersBuilder dataset(ContourDataset dataset) { this.dataset = dataset; return this; }
        RenderParametersBuilder colorBar(ColorBar colorBar) { this.colorBar = colorBar; return this; }
        RenderParametersBuilder clipPath(ClipPath clipPath) { this.clipPath = clipPath; return this; }
        RenderParametersBuilder renderAsPoints(boolean renderAsPoints) { this.renderAsPoints = renderAsPoints; return this; }
        RenderParametersBuilder domainAxis(ValueAxis domainAxis) { this.domainAxis = domainAxis; return this; }
        RenderParametersBuilder rangeAxis(ValueAxis rangeAxis) { this.rangeAxis = rangeAxis; return this; }
        RenderParametersBuilder missingPaint(Paint missingPaint) { this.missingPaint = missingPaint; return this; }
        RenderParametersBuilder ptSizePct(double ptSizePct) { this.ptSizePct = ptSizePct; return this; }
        RenderParametersBuilder domainCrosshairValue(double domainCrosshairValue) { this.domainCrosshairValue = domainCrosshairValue; return this; }
        RenderParametersBuilder rangeCrosshairValue(double rangeCrosshairValue) { this.rangeCrosshairValue = rangeCrosshairValue; return this; }
        RenderParametersBuilder domainCrosshairVisible(boolean domainCrosshairVisible) { this.domainCrosshairVisible = domainCrosshairVisible; return this; }
        RenderParametersBuilder rangeCrosshairVisible(boolean rangeCrosshairVisible) { this.rangeCrosshairVisible = rangeCrosshairVisible; return this; }
        RenderParametersBuilder domainCrosshairLockedOnData(boolean domainCrosshairLockedOnData) { this.domainCrosshairLockedOnData = domainCrosshairLockedOnData; return this; }
        RenderParametersBuilder rangeCrosshairLockedOnData(boolean rangeCrosshairLockedOnData) { this.rangeCrosshairLockedOnData = rangeCrosshairLockedOnData; return this; }
        RenderParametersBuilder domainCrosshairStroke(Stroke domainCrosshairStroke) { this.domainCrosshairStroke = domainCrosshairStroke; return this; }
        RenderParametersBuilder domainCrosshairPaint(Paint domainCrosshairPaint) { this.domainCrosshairPaint = domainCrosshairPaint; return this; }
        RenderParametersBuilder rangeCrosshairStroke(Stroke rangeCrosshairStroke) { this.rangeCrosshairStroke = rangeCrosshairStroke; return this; }
        RenderParametersBuilder rangeCrosshairPaint(Paint rangeCrosshairPaint) { this.rangeCrosshairPaint = rangeCrosshairPaint; return this; }
        RenderParametersBuilder toolTipGenerator(ContourToolTipGenerator toolTipGenerator) { this.toolTipGenerator = toolTipGenerator; return this; }
        RenderParametersBuilder annotations(List annotations) { this.annotations = annotations; return this; }
        RenderParametersBuilder drawingSupply(Object drawingSupply) { this.drawingSupply = drawingSupply; return this; }

        RenderParameters build() {
            return new RenderParameters(dataset, colorBar, clipPath, renderAsPoints,
                    domainAxis, rangeAxis, missingPaint, ptSizePct,
                    domainCrosshairValue, rangeCrosshairValue,
                    domainCrosshairVisible, rangeCrosshairVisible,
                    domainCrosshairLockedOnData, rangeCrosshairLockedOnData,
                    domainCrosshairStroke, domainCrosshairPaint,
                    rangeCrosshairStroke, rangeCrosshairPaint,
                    toolTipGenerator, annotations, drawingSupply);
        }
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
     * Extends plot cloning to this plot type
     * @see org.jfree.chart.plot.Plot#clone()
     */
    @Override
    public Object clone() throws CloneNotSupportedException {
        ContourPlot clone = (ContourPlot) super.clone();

        clone.domainAxis = (ValueAxis) ObjectUtilities.clone(this.domainAxis);
        if (clone.domainAxis != null) {
            clone.domainAxis.setPlot(clone);
            clone.domainAxis.addChangeListener(clone);
        }

        clone.rangeAxis = (ValueAxis) ObjectUtilities.clone(this.rangeAxis);
        if (clone.rangeAxis != null) {
            clone.rangeAxis.setPlot(clone);
            clone.rangeAxis.addChangeListener(clone);
        }

        if (clone.dataset != null) {
            clone.dataset.addChangeListener(clone);
        }

        if (this.colorBar != null) {
            clone.colorBar = (ColorBar) ObjectUtilities.clone(this.colorBar);
        }

        clone.domainMarkers = (List) ObjectUtilities.deepClone(
                this.domainMarkers);
        clone.rangeMarkers = (List) ObjectUtilities.deepClone(
                this.rangeMarkers);
        clone.annotations = (List) ObjectUtilities.deepClone(this.annotations);

        if (this.clipPath != null) {
            clone.clipPath = (ClipPath) ObjectUtilities.clone(this.clipPath);
        }

        return clone;
    }