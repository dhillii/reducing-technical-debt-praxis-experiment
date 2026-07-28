@Override
    public void paintComponent(Graphics g) {
        super.paintComponent(g);
        if (this.chart == null) {
            return;
        }
        Graphics2D g2 = (Graphics2D) g.create();

        Rectangle2D available = getAvailableArea();
        Dimension drawSize = calculateDrawSize(available);
        this.scaleX = drawSize.getWidth() / available.getWidth();
        this.scaleY = drawSize.getHeight() / available.getHeight();

        Rectangle2D chartArea = new Rectangle2D.Double(0.0, 0.0,
                drawSize.getWidth(), drawSize.getHeight());

        if (this.useBuffer) {
            drawWithBuffer(g2, available, chartArea);
        } else {
            drawDirect(g2, available, chartArea);
        }

        drawOverlays(g2);
        drawZoomRectangle(g2, !this.useBuffer);
        g2.dispose();

        resetTransientState();
    }

    /**
     * Returns the available drawing area inside the panel insets.
     *
     * @return the available area.
     */
    private Rectangle2D getAvailableArea() {
        Dimension size = getSize();
        Insets insets = getInsets();
        return new Rectangle2D.Double(insets.left, insets.top,
                size.getWidth() - insets.left - insets.right,
                size.getHeight() - insets.top - insets.bottom);
    }

    /**
     * Calculates the width and height to be used for drawing the chart,
     * applying minimum/maximum constraints.
     *
     * @param available the available area.
     * @return a Dimension containing the width and height to draw.
     */
    private Dimension calculateDrawSize(Rectangle2D available) {
        double drawWidth = available.getWidth();
        double drawHeight = available.getHeight();

        if (drawWidth < this.minimumDrawWidth) {
            drawWidth = this.minimumDrawWidth;
        } else if (drawWidth > this.maximumDrawWidth) {
            drawWidth = this.maximumDrawWidth;
        }

        if (drawHeight < this.minimumDrawHeight) {
            drawHeight = this.minimumDrawHeight;
        } else if (drawHeight > this.maximumDrawHeight) {
            drawHeight = this.maximumDrawHeight;
        }

        return new Dimension((int) drawWidth, (int) drawHeight);
    }

    /**
     * Draws the chart using the off‑screen buffer.
     *
     * @param g2 the graphics context.
     * @param available the available drawing area.
     * @param chartArea the chart area after scaling.
     */
    private void drawWithBuffer(Graphics2D g2, Rectangle2D available,
            Rectangle2D chartArea) {

        if (this.chartBuffer == null
                || this.chartBufferWidth != (int) available.getWidth()
                || this.chartBufferHeight != (int) available.getHeight()) {
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
            Graphics2D bufferG2 = (Graphics2D) this.chartBuffer.getGraphics();
            clearBuffer(bufferG2);
            if (this.scaleX != 1.0 || this.scaleY != 1.0) {
                AffineTransform saved = bufferG2.getTransform();
                bufferG2.transform(AffineTransform.getScaleInstance(
                        this.scaleX, this.scaleY));
                this.chart.draw(bufferG2, chartArea, this.anchor, this.info);
                bufferG2.setTransform(saved);
            } else {
                this.chart.draw(bufferG2, available, this.anchor, this.info);
            }
        }

        g2.drawImage(this.chartBuffer,
                (int) available.getX(), (int) available.getY(), this);
    }

    /**
     * Clears the buffer to a fully transparent background.
     *
     * @param g2 the graphics context for the buffer.
     */
    private void clearBuffer(Graphics2D g2) {
        Composite savedComposite = g2.getComposite();
        g2.setComposite(AlphaComposite.getInstance(AlphaComposite.CLEAR, 0.0f));
        g2.fillRect(0, 0, this.chartBufferWidth, this.chartBufferHeight);
        g2.setComposite(savedComposite);
    }

    /**
     * Draws the chart directly without using a buffer.
     *
     * @param g2 the graphics context.
     * @param available the available drawing area.
     * @param chartArea the chart area after scaling.
     */
    private void drawDirect(Graphics2D g2, Rectangle2D available,
            Rectangle2D chartArea) {

        AffineTransform saved = g2.getTransform();
        g2.translate(available.getX(), available.getY());
        if (this.scaleX != 1.0 || this.scaleY != 1.0) {
            g2.transform(AffineTransform.getScaleInstance(
                    this.scaleX, this.scaleY));
        }
        this.chart.draw(g2, chartArea, this.anchor, this.info);
        g2.setTransform(saved);
    }

    /**
     * Paints all registered overlays.
     *
     * @param g2 the graphics context.
     */
    private void drawOverlays(Graphics2D g2) {
        for (Object obj : this.overlays) {
            Overlay overlay = (Overlay) obj;
            overlay.paintOverlay(g2, this);
        }
    }

    /**
     * Resets transient state after painting.
     */
    private void resetTransientState() {
        this.anchor = null;
        this.verticalTraceLine = null;
        this.horizontalTraceLine = null;
    }