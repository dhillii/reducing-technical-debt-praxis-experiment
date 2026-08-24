generateSession() {
        const sessionId = this.generateUuid();
        const pageCount = this.determineSessionPageCount();
        const firstContent = this.selectContent();
        let baseTimestamp = this.generateTimestamp(firstContent.published_at);
        const sessionContext = this.buildSessionContext();

        const events = [];
        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.selectContent();
            const timestamp = this.calculateSessionTimestamp(baseTimestamp, i);
            if (timestamp > new Date()) {
                break;
            }

            const event = this.buildSessionEvent(
                sessionId,
                content,
                timestamp,
                sessionContext,
                i === 0
            );
            events.push(event);
        }

        return events;
    }

    /**
     * Determine number of pages in session using weighted distribution
     */
    determineSessionPageCount() {
        const r = Math.random();
        if (r < 0.4) {
            return 1;
        } else if (r < 0.7) {
            return 2 + Math.floor(Math.random() * 2);
        } else if (r < 0.9) {
            return 4 + Math.floor(Math.random() * 3);
        }
        return 7 + Math.floor(Math.random() * 4);
    }

    /**
     * Build consistent session attributes
     */
    buildSessionContext() {
        const memberStatus = this.weightedChoice(this.memberStatusWeights);
        let memberUuid;
        if (memberStatus === 'undefined') {
            memberUuid = 'undefined';
        } else if (this.memberUuids.length > 0 && Math.random() < 0.7) {
            memberUuid = this.randomChoice(this.memberUuids);
        } else {
            memberUuid = this.generateUuid();
        }

        const referrer = this.weightedChoice(this.referrerWeights);
        const referrerSource = this.referrerSourceMap[referrer] || referrer;
        const utmParams = this.generateUtmParameters();
        const baseUrl = this.siteConfig.url || 'http://localhost:2368';

        return {
            memberUuid,
            memberStatus,
            userAgent: this.randomChoice(this.userAgents),
            locale: this.randomChoice(this.locales),
            location: this.weightedChoice(this.locationWeights),
            referrer,
            referrerSource,
            utmParams,
            baseUrl
        };
    }

    /**
     * Calculate timestamp for session page view
     */
    calculateSessionTimestamp(baseTimestamp, index) {
        if (index === 0) {
            return baseTimestamp;
        }
        const offsetSeconds = 30 + Math.floor(Math.random() * 270);
        return new Date(baseTimestamp.getTime() + (index * offsetSeconds * 1000));
    }

    /**
     * Build analytics event for session page view
     */
    buildSessionEvent(sessionId, content, timestamp, context, isFirstPage) {
        const href = this.buildHref(content.pathname, context.utmParams, isFirstPage, context.baseUrl);
        const payload = {
            site_uuid: this.siteUuid,
            member_uuid: context.memberUuid,
            member_status: context.memberStatus,
            post_uuid: content.post_uuid,
            post_type: content.post_type,
            'user-agent': context.userAgent,
            locale: context.locale,
            location: context.location,
            referrer: isFirstPage ? context.referrer : '',
            pathname: content.pathname,
            href: href,
            meta: {
                referrerSource: isFirstPage ? context.referrerSource : ''
            }
        };

        if (isFirstPage && context.utmParams) {
            Object.assign(payload, context.utmParams);
        }

        return {
            timestamp: this.formatTimestamp(timestamp),
            session_id: sessionId,
            action: 'page_hit',
            version: '1',
            payload: payload
        };
    }

    /**
     * Build href with optional UTM parameters
     */
    buildHref(pathname, utmParams, includeUtm, baseUrl) {
        let href = `${baseUrl}${pathname}`;
        if (includeUtm && utmParams) {
            const utmQueryString = Object.entries(utmParams)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
                .join('&');
            if (utmQueryString) {
                href = `${href}?${utmQueryString}`;
            }
        }
        return href;
    }