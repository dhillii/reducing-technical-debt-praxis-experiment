@Override
    public void paintComponent(Graphics g) {
        super.paintComponent(g);
        if (this.chart == null) {
            return;
        }
        Graphics2D g2 = (Graphics2D) g.create();
        Dimension size = getSize();
        Insets insets = getInsets();
        Rectangle2D available = new Rectangle2D.Double(insets.left, insets.top,
                size.getWidth() - insets.left - insets.right,
                size.getHeight() - insets.top - insets.bottom);
        double[] dims = new double[2];
        boolean scale = computeScale(available, dims);
        double drawWidth = dims[0];
        double drawHeight = dims[1];
        Rectangle2D chartArea = new Rectangle2D.Double(0.0, 0.0, drawWidth, drawHeight);
        if (this.useBuffer) {
            handleBuffer(g2, available, chartArea, scale);
        } else {
            drawChartDirect(g2, insets, chartArea, scale);
        }
        for (Object obj : this.overlays) {
            ((Overlay) obj).paintOverlay(g2, this);
        }
        drawZoomRectangle(g2, !this.useBuffer);
        g2.dispose();
        this.anchor = null;
        this.verticalTraceLine = null;
        this.horizontalTraceLine = null;
    }

    private boolean computeScale(Rectangle2D available, double[] out) {
        double drawWidth = available.getWidth();
        double drawHeight = available.getHeight();
        this.scaleX = 1.0;
        this.scaleY = 1.0;
        boolean scaleNeeded = false;
        if (drawWidth < this.minimumDrawWidth) {
            this.scaleX = drawWidth / this.minimumDrawWidth;
            drawWidth = this.minimumDrawWidth;
            scaleNeeded = true;
        } else if (drawWidth > this.maximumDrawWidth) {
            this.scaleX = drawWidth / this.maximumDrawWidth;
            drawWidth = this.maximumDrawWidth;
            scaleNeeded = true;
        }
        if (drawHeight < this.minimumDrawHeight) {
            this.scaleY = drawHeight / this.minimumDrawHeight;
            drawHeight = this.minimumDrawHeight;
            scaleNeeded = true;
        } else if (drawHeight > this.maximumDrawHeight) {
            this.scaleY = drawHeight / this.maximumDrawHeight;
            drawHeight = this.maximumDrawHeight;
            scaleNeeded = true;
        }
        out[0] = drawWidth;
        out[1] = drawHeight;
        return scaleNeeded;
    }

    private void handleBuffer(Graphics2D g2, Rectangle2D available, Rectangle2D chartArea, boolean scale) {
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
            bufferG2.fill(new Rectangle(0, 0, this.chartBufferWidth,
                    this.chartBufferHeight));
            bufferG2.setComposite(savedComposite);
            if (scale) {
                AffineTransform saved = bufferG2.getTransform();
                bufferG2.transform(AffineTransform.getScaleInstance(
                        this.scaleX, this.scaleY));
                this.chart.draw(bufferG2, chartArea, this.anchor,
                        this.info);
                bufferG2.setTransform(saved);
            } else {
                this.chart.draw(bufferG2, bufferArea, this.anchor,
                        this.info);
            }
        }
        g2.drawImage(this.chartBuffer, (int) available.getX(),
                (int) available.getY(), this);
    }

    private void drawChartDirect(Graphics2D g2, Insets insets, Rectangle2D chartArea, boolean scale) {
        AffineTransform saved = g2.getTransform();
        g2.translate(insets.left, insets.top);
        if (scale) {
            g2.transform(AffineTransform.getScaleInstance(
                    this.scaleX, this.scaleY));
        }
        this.chart.draw(g2, chartArea, this.anchor, this.info);
        g2.setTransform(saved);
    }