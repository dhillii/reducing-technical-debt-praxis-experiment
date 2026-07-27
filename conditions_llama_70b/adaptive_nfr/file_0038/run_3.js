/**
 * Generate a session with multiple page hits
 * Returns an array of events for a single user session
 */
generateSession() {
    const sessionId = this.generateUuid();

    // Determine number of pages in this session (1-10, weighted toward lower)
    const pageCount = this.determinePageCount();

    // Generate base timestamp for this session
    const firstContent = this.selectContent();
    let baseTimestamp = this.generateTimestamp(firstContent.published_at);

    // Generate consistent session attributes
    const sessionAttributes = this.generateSessionAttributes();

    const events = [];

    for (let i = 0; i < pageCount; i++) {
        // Select content for this page view
        const content = i === 0 ? firstContent : this.selectContent();

        // Add time offset for subsequent pages (30 seconds to 5 minutes between pages)
        let timestamp;
        if (i === 0) {
            timestamp = baseTimestamp;
        } else {
            timestamp = this.addTimeOffset(baseTimestamp, i);
        }

        // Don't generate future timestamps
        const now = new Date();
        if (timestamp > now) {
            break;
        }

        const event = this.generateEvent(sessionAttributes, content, timestamp, sessionId, i);
        events.push(event);
    }

    return events;
}

/**
 * Determine the number of pages in a session
 * @returns {number} The number of pages in the session
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
 * Add time offset for subsequent pages
 * @param {Date} baseTimestamp The base timestamp
 * @param {number} offset The offset
 * @returns {Date} The timestamp with the offset
 */
addTimeOffset(baseTimestamp, offset) {
    const offsetSeconds = 30 + Math.floor(Math.random() * 270); // 30-300 seconds
    return new Date(baseTimestamp.getTime() + (offset * offsetSeconds * 1000));
}

/**
 * Generate an event
 * @param {object} sessionAttributes The session attributes
 * @param {object} content The content
 * @param {Date} timestamp The timestamp
 * @param {string} sessionId The session ID
 * @param {number} pageIndex The page index
 * @returns {object} The event
 */
generateEvent(sessionAttributes, content, timestamp, sessionId, pageIndex) {
    let href = `${sessionAttributes.baseUrl}${content.pathname}`;
    // Only include UTM on first page of session (entry page)
    if (pageIndex === 0 && sessionAttributes.utmParams) {
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
        referrer: pageIndex === 0 ? sessionAttributes.referrer : '', // Only first page has external referrer
        pathname: content.pathname,
        href: href,
        meta: {
            referrerSource: pageIndex === 0 ? sessionAttributes.referrerSource : ''
        }
    };

    // Only include UTM on entry page
    if (pageIndex === 0 && sessionAttributes.utmParams) {
        Object.assign(payload, sessionAttributes.utmParams);
    }

    return {
        timestamp: this.formatTimestamp(timestamp),
        session_id: sessionId,
        action: 'page_hit',
        version: '1',
        payload: payload
    };
}