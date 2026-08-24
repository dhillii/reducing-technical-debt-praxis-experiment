/**
     * Generate a session with multiple page hits
     * Returns an array of events for a single user session
     */
    generateSession() {
        const sessionId = this.generateUuid();
        const pageCount = this.determinePageCount();
        const baseTimestamp = this.generateSessionBaseTimestamp();
        const sessionAttributes = this.buildSessionAttributes();

        return this.buildSessionEvents(sessionId, pageCount, baseTimestamp, sessionAttributes);
    }

    /**
     * Determine number of pages in this session (1-10, weighted toward lower)
     */
    determinePageCount() {
        const r = Math.random();
        if (r < 0.4) {
            return 1;
        } else if (r < 0.7) {
            return 2 + Math.floor(Math.random() * 2); // 2-3
        } else if (r < 0.9) {
            return 4 + Math.floor(Math.random() * 3); // 4-6
        } else {
            return 7 + Math.floor(Math.random() * 4); // 7-10
        }
    }

    /**
     * Generate base timestamp for this session
     */
    generateSessionBaseTimestamp() {
        const firstContent = this.selectContent();
        return this.generateTimestamp(firstContent.published_at);
    }

    /**
     * Build consistent session attributes
     */
    buildSessionAttributes() {
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
     * Build session events array
     */
    buildSessionEvents(sessionId, pageCount, baseTimestamp, sessionAttributes) {
        const events = [];
        const {memberUuid, memberStatus, userAgent, locale, location, referrer, referrerSource, utmParams, baseUrl} = sessionAttributes;

        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? this.selectContent() : this.selectContent();
            const timestamp = this.calculateSessionTimestamp(baseTimestamp, i);
            const href = this.buildHref(baseUrl, content.pathname, utmParams, i === 0);

            const payload = {
                site_uuid: this.siteUuid,
                member_uuid: memberUuid,
                member_status: memberStatus,
                post_uuid: content.post_uuid,
                post_type: content.post_type,
                'user-agent': userAgent,
                locale: locale,
                location: location,
                referrer: i === 0 ? referrer : '',
                pathname: content.pathname,
                href: href,
                meta: {
                    referrerSource: i === 0 ? referrerSource : ''
                }
            };

            if (i === 0 && utmParams) {
                Object.assign(payload, utmParams);
            }

            events.push({
                timestamp: this.formatTimestamp(timestamp),
                session_id: sessionId,
                action: 'page_hit',
                version: '1',
                payload: payload
            });
        }

        return events;
    }

    /**
     * Calculate timestamp for session page view
     */
    calculateSessionTimestamp(baseTimestamp, pageIndex) {
        if (pageIndex === 0) {
            return baseTimestamp;
        }

        const offsetSeconds = 30 + Math.floor(Math.random() * 270);
        const timestamp = new Date(baseTimestamp.getTime() + (pageIndex * offsetSeconds * 1000));

        const now = new Date();
        return timestamp > now ? now : timestamp;
    }

    /**
     * Build href with optional UTM parameters
     */
    buildHref(baseUrl, pathname, utmParams, includeUtm) {
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