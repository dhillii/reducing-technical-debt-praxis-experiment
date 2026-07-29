public void paintComponent(Graphics g) {
    super.paintComponent(g);
    if (this.chart == null) {
        return;
    }
    Graphics2D g2 = (Graphics2D) g.create();
    try {
        Dimension size = getSize();
        Insets insets = getInsets();
        Rectangle2D available = new Rectangle2D.Double(
                insets.left, insets.top,
                size.getWidth() - insets.left - insets.right,
                size.getHeight() - insets.top - insets.bottom);

        ScaleInfo scaleInfo = calculateScale(available);
        Rectangle2D chartArea = new Rectangle2D.Double(
                0.0, 0.0, scaleInfo.drawWidth, scaleInfo.drawHeight);

        if (this.useBuffer) {
            drawWithBuffer(g2, available, scaleInfo, chartArea);
        } else {
            drawDirect(g2, insets, scaleInfo, chartArea);
        }

        drawOverlays(g2);
        drawZoomRectangle(g2, !this.useBuffer);
    } finally {
        g2.dispose();
        this.anchor = null;
        this.verticalTraceLine = null;
        this.horizontalTraceLine = null;
    }
}

private static class ScaleInfo {
    double scaleX = 1.0;
    double scaleY = 1.0;
    double drawWidth;
    double drawHeight;
    boolean scaled;
}

private ScaleInfo calculateScale(Rectangle2D available) {
    ScaleInfo info = new ScaleInfo();
    double w = available.getWidth();
    double h = available.getHeight();
    info.scaled = false;
    if (w < this.minimumDrawWidth) {
        info.scaleX = w / this.minimumDrawWidth;
        w = this.minimumDrawWidth;
        info.scaled = true;
    } else if (w > this.maximumDrawWidth) {
        info.scaleX = w / this.maximumDrawWidth;
        w = this.maximumDrawWidth;
        info.scaled = true;
    }
    if (h < this.minimumDrawHeight) {
        info.scaleY = h / this.minimumDrawHeight;
        h = this.minimumDrawHeight;
        info.scaled = true;
    } else if (h > this.maximumDrawHeight) {
        info.scaleY = h / this.maximumDrawHeight;
        h = this.maximumDrawHeight;
        info.scaled = true;
    }
    info.drawWidth = w;
    info.drawHeight = h;
    this.scaleX = info.scaleX;
    this.scaleY = info.scaleY;
    return info;
}

private void drawWithBuffer(Graphics2D g2, Rectangle2D available,
                            ScaleInfo scaleInfo, Rectangle2D chartArea) {
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
        try {
            bufferG2.setComposite(AlphaComposite.getInstance(
                    AlphaComposite.CLEAR, 0.0f));
            bufferG2.fillRect(0, 0, this.chartBufferWidth, this.chartBufferHeight);
            bufferG2.setComposite(AlphaComposite.getInstance(
                    AlphaComposite.SRC_OVER, 1.0f));
            if (scaleInfo.scaled) {
                AffineTransform st = AffineTransform.getScaleInstance(
                        this.scaleX, this.scaleY);
                bufferG2.transform(st);
                this.chart.draw(bufferG2, chartArea, this.anchor, this.info);
                bufferG2.setTransform(new AffineTransform());
            } else {
                this.chart.draw(bufferG2, new Rectangle2D.Double(
                        0, 0, this.chartBufferWidth, this.chartBufferHeight),
                        this.anchor, this.info);
            }
        } finally {
            bufferG2.dispose();
        }
    }
    g2.drawImage(this.chartBuffer, insets.left, insets.top, this);
}

private void drawDirect(Graphics2D g2, Insets insets, ScaleInfo scaleInfo,
                        Rectangle2D chartArea) {
    AffineTransform saved = g2.getTransform();
    g2.translate(insets.left, insets.top);
    if (scaleInfo.scaled) {
        g2.transform(AffineTransform.getScaleInstance(
                this.scaleX, this.scaleY));
    }
    this.chart.draw(g2, chartArea, this.anchor, this.info);
    g2.setTransform(saved);
}

private void drawOverlays(Graphics2D g2) {
    for (Object obj : this.overlays) {
        ((Overlay) obj).paintOverlay(g2, this);
    }
}