/**
 * Generate a session with multiple page hits
 * Returns an array of events for a single user session
 */
generateSession() {
    const sessionId = this.generateUuid();
    const pageCount = this.determinePageCount();
    const baseTimestamp = this.generateBaseTimestamp();
    const sessionAttributes = this.generateSessionAttributes();

    const events = [];

    for (let i = 0; i < pageCount; i++) {
        const content = i === 0 ? sessionAttributes.firstContent : this.selectContent();
        const timestamp = this.generatePageTimestamp(baseTimestamp, i);
        const payload = this.generatePagePayload(sessionAttributes, content, i);

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
        memberUuid: memberUuid,
        memberStatus: memberStatus,
        userAgent: userAgent,
        locale: locale,
        location: location,
        referrer: referrer,
        referrerSource: referrerSource,
        utmParams: utmParams,
        baseUrl: baseUrl,
        firstContent: this.selectContent()
    };
}

/**
 * Generate the timestamp for a page
 * @param {Date} baseTimestamp The base timestamp
 * @param {number} pageIndex The page index
 * @returns {Date} The page timestamp
 */
generatePageTimestamp(baseTimestamp, pageIndex) {
    let timestamp;
    if (pageIndex === 0) {
        timestamp = baseTimestamp;
    } else {
        const offsetSeconds = 30 + Math.floor(Math.random() * 270); // 30-300 seconds
        timestamp = new Date(baseTimestamp.getTime() + (pageIndex * offsetSeconds * 1000));
    }

    // Don't generate future timestamps
    const now = new Date();
    if (timestamp > now) {
        return new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
    }

    return timestamp;
}

/**
 * Generate the payload for a page
 * @param {object} sessionAttributes The session attributes
 * @param {object} content The content
 * @param {number} pageIndex The page index
 * @returns {object} The page payload
 */
generatePagePayload(sessionAttributes, content, pageIndex) {
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

    return payload;
}