/**
 * Generate a session with multiple page hits
 * Returns an array of events for a single user session
 */
generateSession() {
    const sessionId = this.generateUuid();
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
            const offsetSeconds = this.calculateOffsetSeconds();
            timestamp = new Date(baseTimestamp.getTime() + (i * offsetSeconds * 1000));
        }

        // Don't generate future timestamps
        const now = new Date();
        if (timestamp > now) {
            break;
        }

        const event = this.generatePageHitEvent(sessionId, content, timestamp, sessionAttributes, i === 0);
        events.push(event);
    }

    return events;
}

/**
 * Determine the number of pages in a session
 * @returns {number} The number of pages in the session
 */
determinePageCount() {
    const distribution = [
        { probability: 0.4, pageCount: 1 },
        { probability: 0.3, pageCount: 2 + Math.floor(Math.random() * 2) },
        { probability: 0.2, pageCount: 4 + Math.floor(Math.random() * 3) },
        { probability: 0.1, pageCount: 7 + Math.floor(Math.random() * 4) }
    ];

    const random = Math.random();
    let cumulativeProbability = 0;

    for (const { probability, pageCount } of distribution) {
        cumulativeProbability += probability;
        if (random <= cumulativeProbability) {
            return pageCount;
        }
    }

    return distribution[distribution.length - 1].pageCount;
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
 * Calculate the offset seconds between pages
 * @returns {number} The offset seconds
 */
calculateOffsetSeconds() {
    return 30 + Math.floor(Math.random() * 270);
}

/**
 * Generate a page hit event
 * @param {string} sessionId The session ID
 * @param {object} content The content
 * @param {Date} timestamp The timestamp
 * @param {object} sessionAttributes The session attributes
 * @param {boolean} isFirstPage Whether this is the first page
 * @returns {object} The page hit event
 */
generatePageHitEvent(sessionId, content, timestamp, sessionAttributes, isFirstPage) {
    const { memberUuid, memberStatus, userAgent, locale, location, referrer, referrerSource, utmParams, baseUrl } = sessionAttributes;

    let href = `${baseUrl}${content.pathname}`;
    if (isFirstPage && utmParams) {
        const utmQueryString = Object.entries(utmParams)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');
        if (utmQueryString) {
            href = `${href}?${utmQueryString}`;
        }
    }

    const payload = {
        site_uuid: this.siteUuid,
        member_uuid: memberUuid,
        member_status: memberStatus,
        post_uuid: content.post_uuid,
        post_type: content.post_type,
        'user-agent': userAgent,
        locale: locale,
        location: location,
        referrer: isFirstPage ? referrer : '',
        pathname: content.pathname,
        href: href,
        meta: {
            referrerSource: isFirstPage ? referrerSource : ''
        }
    };

    if (isFirstPage && utmParams) {
        Object.assign(payload, utmParams);
    }

    return {
        timestamp: this.formatTimestamp(timestamp),
        session_id: sessionId,
        action: 'page_hit',
        version: '1',
        payload: payload
    };
}