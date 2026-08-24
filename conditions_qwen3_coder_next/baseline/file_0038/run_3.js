generateSession() {
        const sessionId = this.generateUuid();
        const pageCount = this.determinePageCount();
        const firstContent = this.selectContent();
        let baseTimestamp = this.generateTimestamp(firstContent.published_at);
        const sessionData = this.buildSessionData(firstContent, baseTimestamp);

        const events = [];
        for (let i = 0; i < pageCount; i++) {
            const event = this.buildSessionEvent(i, sessionData, firstContent, baseTimestamp);
            if (!event) break;
            events.push(event);
        }

        return events;
    }

    determinePageCount() {
        const r = Math.random();
        if (r < 0.4) return 1;
        if (r < 0.7) return 2 + Math.floor(Math.random() * 2);
        if (r < 0.9) return 4 + Math.floor(Math.random() * 3);
        return 7 + Math.floor(Math.random() * 4);
    }

    buildSessionData(firstContent, baseTimestamp) {
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
            baseUrl,
            baseTimestamp,
            firstContent
        };
    }

    buildSessionEvent(index, sessionData, firstContent, baseTimestamp) {
        const content = index === 0 ? firstContent : this.selectContent();
        const timestamp = this.calculateTimestamp(index, baseTimestamp);
        const now = new Date();

        if (timestamp > now) return null;

        const {memberUuid, memberStatus, userAgent, locale, location, referrer, referrerSource, utmParams, baseUrl, firstContent} = sessionData;
        const href = this.buildHref(baseUrl, content, utmParams, index === 0);
        const isEntryPage = index === 0;

        const payload = {
            site_uuid: this.siteUuid,
            member_uuid: memberUuid,
            member_status: memberStatus,
            post_uuid: content.post_uuid,
            post_type: content.post_type,
            'user-agent': userAgent,
            locale: locale,
            location: location,
            referrer: isEntryPage ? referrer : '',
            pathname: content.pathname,
            href: href,
            meta: {
                referrerSource: isEntryPage ? referrerSource : ''
            }
        };

        if (isEntryPage && utmParams) {
            Object.assign(payload, utmParams);
        }

        return {
            timestamp: this.formatTimestamp(timestamp),
            session_id: this.generateUuid(),
            action: 'page_hit',
            version: '1',
            payload: payload
        };
    }

    calculateTimestamp(index, baseTimestamp) {
        if (index === 0) return baseTimestamp;
        const offsetSeconds = 30 + Math.floor(Math.random() * 270);
        return new Date(baseTimestamp.getTime() + (index * offsetSeconds * 1000));
    }

    buildHref(baseUrl, content, utmParams, includeUtm) {
        let href = `${baseUrl}${content.pathname}`;
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