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
    Rectangle2D available = getAvailableSpace();
    boolean scale = isScalingRequired(available);
    Rectangle2D chartArea = getChartArea(available, scale);
    drawChart(g2, chartArea, scale);
    drawOverlays(g2);
    drawZoomRectangle(g2);
    g2.dispose();
}

private Rectangle2D getAvailableSpace() {
    Dimension size = getSize();
    Insets insets = getInsets();
    return new Rectangle2D.Double(insets.left, insets.top,
            size.getWidth() - insets.left - insets.right,
            size.getHeight() - insets.top - insets.bottom);
}

private boolean isScalingRequired(Rectangle2D available) {
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

private Rectangle2D getChartArea(Rectangle2D available, boolean scale) {
    double drawWidth = available.getWidth();
    double drawHeight = available.getHeight();
    return new Rectangle2D.Double(0.0, 0.0, drawWidth, drawHeight);
}

private void drawChart(Graphics2D g2, Rectangle2D chartArea, boolean scale) {
    if (this.useBuffer) {
        drawChartWithBuffer(g2, chartArea, scale);
    } else {
        drawChartWithoutBuffer(g2, chartArea, scale);
    }
}

private void drawChartWithBuffer(Graphics2D g2, Rectangle2D chartArea, boolean scale) {
    if (this.chartBuffer == null || this.chartBufferWidth != chartArea.getWidth() || this.chartBufferHeight != chartArea.getHeight()) {
        this.chartBufferWidth = (int) chartArea.getWidth();
        this.chartBufferHeight = (int) chartArea.getHeight();
        GraphicsConfiguration gc = g2.getDeviceConfiguration();
        this.chartBuffer = gc.createCompatibleImage(this.chartBufferWidth, this.chartBufferHeight, Transparency.TRANSLUCENT);
        this.refreshBuffer = true;
    }

    if (this.refreshBuffer) {
        this.refreshBuffer = false;
        Rectangle2D bufferArea = new Rectangle2D.Double(0, 0, this.chartBufferWidth, this.chartBufferHeight);
        Graphics2D bufferG2 = (Graphics2D) this.chartBuffer.getGraphics();
        Composite savedComposite = bufferG2.getComposite();
        bufferG2.setComposite(AlphaComposite.getInstance(AlphaComposite.CLEAR, 0.0f));
        Rectangle r = new Rectangle(0, 0, this.chartBufferWidth, this.chartBufferHeight);
        bufferG2.fill(r);
        bufferG2.setComposite(savedComposite);

        if (scale) {
            AffineTransform saved = bufferG2.getTransform();
            AffineTransform st = AffineTransform.getScaleInstance(this.scaleX, this.scaleY);
            bufferG2.transform(st);
            this.chart.draw(bufferG2, chartArea, this.anchor, this.info);
            bufferG2.setTransform(saved);
        } else {
            this.chart.draw(bufferG2, bufferArea, this.anchor, this.info);
        }
    }

    g2.drawImage(this.chartBuffer, getInsets().left, getInsets().top, this);
}

private void drawChartWithoutBuffer(Graphics2D g2, Rectangle2D chartArea, boolean scale) {
    AffineTransform saved = g2.getTransform();
    g2.translate(getInsets().left, getInsets().top);
    if (scale) {
        AffineTransform st = AffineTransform.getScaleInstance(this.scaleX, this.scaleY);
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

private void drawZoomRectangle(Graphics2D g2) {
    if (this.zoomRectangle != null) {
        if (this.useBuffer) {
            repaint();
        } else {
            drawZoomRectangle(g2, true);
        }
    }
}

private void drawZoomRectangle(Graphics2D g2, boolean xor) {
    if (this.zoomRectangle != null) {
        if (xor) {
            g2.setXORMode(Color.gray);
        }
        if (this.fillZoomRectangle) {
            g2.setPaint(this.zoomFillPaint);
            g2.fill(this.zoomRectangle);
        } else {
            g2.setPaint(this.zoomOutlinePaint);
            g2.draw(this.zoomRectangle);
        }
        if (xor) {
            g2.setPaintMode();
        }
    }
}