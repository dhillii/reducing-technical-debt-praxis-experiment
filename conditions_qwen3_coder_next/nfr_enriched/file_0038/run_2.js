generateSession() {
        const sessionId = this.generateUuid();
        const pageCount = this.getSessionPageCount();
        const {firstContent, baseTimestamp} = this.getBaseSessionData();
        const consistentData = this.buildConsistentSessionData();

        return this.buildSessionEvents(
            sessionId,
            pageCount,
            firstContent,
            baseTimestamp,
            consistentData
        );
    }

    /**
     * Determine number of pages in session (1-10, weighted toward lower)
     */
    getSessionPageCount() {
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
     * Generate base analytics session data (first page and timestamp)
     */
    getBaseSessionData() {
        const firstContent = this.selectContent();
        const baseTimestamp = this.generateTimestamp(firstContent.published_at);
        return {firstContent, baseTimestamp};
    }

    /**
     * Build consistent session attributes shared across all pages in session
     */
    buildConsistentSessionData() {
        const memberStatus = this.weightedChoice(this.memberStatusWeights);
        const memberUuid = memberStatus === 'undefined' ? 'undefined' : (
            this.memberUuids.length > 0 && Math.random() < 0.7 ? this.randomChoice(this.memberUuids) : this.generateUuid()
        );
        const userAgent = this.randomChoice(this.userAgents);
        const locale = this.randomChoice(this.locales);
        const location = this.weightedChoice(this.locationWeights);
        const referrer = this.weightedChoice(this.referrerWeights);

        return {
            memberStatus,
            memberUuid,
            userAgent,
            locale,
            location,
            referrer,
            referrerSource: this.referrerSourceMap[referrer] || referrer,
            utmParams: this.generateUtmParameters(),
            baseUrl: this.siteConfig.url || 'http://localhost:2368'
        };
    }

    /**
     * Build events array for session with given attributes
     */
    buildSessionEvents(sessionId, pageCount, firstContent, baseTimestamp, consistentData) {
        const {
            memberStatus,
            memberUuid,
            userAgent,
            locale,
            location,
            referrer,
            referrerSource,
            utmParams,
            baseUrl
        } = consistentData;

        const events = [];

        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.selectContent();
            const timestamp = i === 0 ? baseTimestamp : this.adjustTimestampForPage(baseTimestamp, i);
            if (timestamp > new Date()) {
                break;
            }

            const href = this.buildHref(baseUrl, content.pathname, i === 0 ? utmParams : null);
            const payload = this.buildSessionPayload(
                content,
                memberUuid,
                memberStatus,
                userAgent,
                locale,
                location,
                i === 0 ? referrer : '',
                i === 0 ? referrerSource : '',
                this.siteUuid,
                href,
                utmParams
            );

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
     * Adjust timestamp for a given page index in session (30s to 5min between pages)
     */
    adjustTimestampForPage(baseTimestamp, pageIndex) {
        const offsetSeconds = 30 + Math.floor(Math.random() * 270);
        return new Date(baseTimestamp.getTime() + (pageIndex * offsetSeconds * 1000));
    }

    /**
     * Build href with optional UTM parameters
     */
    buildHref(baseUrl, pathname, utmParams) {
        let href = `${baseUrl}${pathname}`;
        if (!utmParams) {
            return href;
        }

        const utmQueryString = Object.entries(utmParams)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');

        return utmQueryString ? `${href}?${utmQueryString}` : href;
    }

    /**
     * Build consistent payload for session event
     */
    buildSessionPayload(content, memberUuid, memberStatus, userAgent, locale, location, referrer, referrerSource, siteUuid, href, utmParams) {
        const payload = {
            site_uuid: siteUuid,
            member_uuid: memberUuid,
            member_status: memberStatus,
            post_uuid: content.post_uuid,
            post_type: content.post_type,
            'user-agent': userAgent,
            locale: locale,
            location: location,
            referrer: referrer,
            pathname: content.pathname,
            href: href,
            meta: {
                referrerSource: referrerSource
            }
        };

        if (utmParams) {
            Object.assign(payload, utmParams);
        }

        return payload;
    }