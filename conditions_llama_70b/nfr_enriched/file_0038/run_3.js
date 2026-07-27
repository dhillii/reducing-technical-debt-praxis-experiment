/**
 * Generate a session with multiple page hits
 * Returns an array of events for a single user session
 */
generateSession() {
    const sessionId = this.generateUuid();
    const pageCount = this.determinePageCount();
    const baseTimestamp = this.generateBaseTimestamp();
    const sessionAttributes = this.generateSessionAttributes();

    return this.generatePageHits(sessionId, pageCount, baseTimestamp, sessionAttributes);
}

/**
 * Determine the number of pages in a session
 * @returns {number} The number of pages
 */
determinePageCount() {
    // Distribution: ~40% single page, ~30% 2-3 pages, ~20% 4-6 pages, ~10% 7-10 pages
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
 * Generate the base timestamp for a session
 * @returns {Date} The base timestamp
 */
generateBaseTimestamp() {
    const firstContent = this.selectContent();
    return this.generateTimestamp(firstContent.published_at);
}

/**
 * Generate consistent session attributes
 * @returns {object} The session attributes
 */
generateSessionAttributes() {
    const memberStatus = this.weightedChoice(this.memberStatusWeights);
    let memberUuid;
    if (memberStatus === 'undefined') {
        memberUuid = 'undefined';
    } else if (this.memberUuids.length > 0 && Math.random() < 0.7) {
        memberUuid = this.randomChoice(this.memberUuids);
    } else {
        memberUuid = this.generateUuid();
    }

    const userAgent = this.randomChoice(this.userAgents);
    const locale = this.randomChoice(this.locales);
    const location = this.weightedChoice(this.locationWeights);
    const referrer = this.weightedChoice(this.referrerWeights);
    const referrerSource = this.referrerSourceMap[referrer] || referrer;
    const utmParams = this.generateUtmParameters();
    const baseUrl = this.siteConfig.url || 'http://localhost:2368';

    return {
        memberUuid,
        memberStatus,
        userAgent,
        locale,
        location,
        referrer,
        referrerSource,
        utmParams,
        baseUrl
    };
}

/**
 * Generate page hits for a session
 * @param {string} sessionId The session ID
 * @param {number} pageCount The number of pages
 * @param {Date} baseTimestamp The base timestamp
 * @param {object} sessionAttributes The session attributes
 * @returns {Array} The page hits
 */
generatePageHits(sessionId, pageCount, baseTimestamp, sessionAttributes) {
    const events = [];

    for (let i = 0; i < pageCount; i++) {
        // Select content for this page view
        const content = i === 0 ? this.selectContent() : this.selectContent();

        // Add time offset for subsequent pages (30 seconds to 5 minutes between pages)
        let timestamp;
        if (i === 0) {
            timestamp = baseTimestamp;
        } else {
            const offsetSeconds = 30 + Math.floor(Math.random() * 270); // 30-300 seconds
            timestamp = new Date(baseTimestamp.getTime() + (i * offsetSeconds * 1000));
        }

        // Don't generate future timestamps
        const now = new Date();
        if (timestamp > now) {
            break;
        }

        let href = `${sessionAttributes.baseUrl}${content.pathname}`;
        // Only include UTM on first page of session (entry page)
        if (i === 0 && sessionAttributes.utmParams) {
            const utmQueryString = Object.entries(sessionAttributes.utmParams)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
                .join('&');
            if (utmQueryString) {
                href = `${href}?${utmQueryString}`;
            }
        }

        const payload = {
            site_uuid: this.siteUuid,
            member_uuid: sessionAttributes.memberUuid,
            member_status: sessionAttributes.memberStatus,
            post_uuid: content.post_uuid,
            post_type: content.post_type,
            'user-agent': sessionAttributes.userAgent,
            locale: sessionAttributes.locale,
            location: sessionAttributes.location,
            referrer: i === 0 ? sessionAttributes.referrer : '', // Only first page has external referrer
            pathname: content.pathname,
            href: href,
            meta: {
                referrerSource: i === 0 ? sessionAttributes.referrerSource : ''
            }
        };

        // Only include UTM on entry page
        if (i === 0 && sessionAttributes.utmParams) {
            Object.assign(payload, sessionAttributes.utmParams);
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