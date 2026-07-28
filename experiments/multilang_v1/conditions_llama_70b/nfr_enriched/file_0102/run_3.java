@Override
public void paintComponent(Graphics g) {
    super.paintComponent(g);
    if (this.chart == null) {
        return;
    }
    paintChart(g);
}

private void paintChart(Graphics g) {
    Graphics2D g2 = (Graphics2D) g.create();
    Dimension size = getSize();
    Insets insets = getInsets();
    Rectangle2D available = new Rectangle2D.Double(insets.left, insets.top,
            size.getWidth() - insets.left - insets.right,
            size.getHeight() - insets.top - insets.bottom);
    boolean scale = calculateScale(available);
    Rectangle2D chartArea = new Rectangle2D.Double(0.0, 0.0, available.getWidth(),
            available.getHeight());
    if (this.useBuffer) {
        drawBufferedChart(g2, chartArea, available, scale);
    } else {
        drawNonBufferedChart(g2, chartArea, available, scale);
    }
    drawOverlays(g2);
    drawZoomRectangle(g2, !this.useBuffer);
    g2.dispose();
    resetAnchorAndTraces();
}

private boolean calculateScale(Rectangle2D available) {
    boolean scale = false;
    double drawWidth = available.getWidth();
    double drawHeight = available.getHeight();
    this.scaleX = 1.0;
    this.scaleY = 1.0;

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

private void drawBufferedChart(Graphics2D g2, Rectangle2D chartArea,
        Rectangle2D available, boolean scale) {
    if (this.chartBuffer == null || this.chartBufferWidth != available.getWidth()
            || this.chartBufferHeight != available.getHeight()) {
        this.chartBufferWidth = (int) available.getWidth();
        this.chartBufferHeight = (int) available.getHeight();
        GraphicsConfiguration gc = g2.getDeviceConfiguration();
        this.chartBuffer = gc.createCompatibleImage(this.chartBufferWidth,
                this.chartBufferHeight, Transparency.TRANSLUCENT);
        this.refreshBuffer = true;
    }
    if (this.refreshBuffer) {
        this.refreshBuffer = false;
        Graphics2D bufferG2 = (Graphics2D) this.chartBuffer.getGraphics();
        clearBuffer(bufferG2);
        if (scale) {
            AffineTransform saved = bufferG2.getTransform();
            AffineTransform st = AffineTransform.getScaleInstance(this.scaleX,
                    this.scaleY);
            bufferG2.transform(st);
            this.chart.draw(bufferG2, chartArea, this.anchor, this.info);
            bufferG2.setTransform(saved);
        } else {
            this.chart.draw(bufferG2, available, this.anchor, this.info);
        }
    }
    g2.drawImage(this.chartBuffer, insets.left, insets.top, this);
}

private void drawNonBufferedChart(Graphics2D g2, Rectangle2D chartArea,
        Rectangle2D available, boolean scale) {
    AffineTransform saved = g2.getTransform();
    g2.translate(insets.left, insets.top);
    if (scale) {
        AffineTransform st = AffineTransform.getScaleInstance(this.scaleX,
                this.scaleY);
        g2.transform(st);
    }
    this.chart.draw(g2, chartArea, this.anchor, this.info);
    g2.setTransform(saved);
}

private void drawOverlays(Graphics2D g2) {
    Iterator iterator = this.overlays.iterator();
    while (iterator.hasNext()) {
        Overlay overlay = (Overlay) iterator.next();
        overlay.paintOverlay(g2, this);
    }
}

private void resetAnchorAndTraces() {
    this.anchor = null;
    this.verticalTraceLine = null;
    this.horizontalTraceLine = null;
}

private void clearBuffer(Graphics2D bufferG2) {
    Composite savedComposite = bufferG2.getComposite();
    bufferG2.setComposite(AlphaComposite.getInstance(AlphaComposite.CLEAR, 0.0f));
    Rectangle r = new Rectangle(0, 0, this.chartBufferWidth, this.chartBufferHeight);
    bufferG2.fill(r);
    bufferG2.setComposite(savedComposite);
}