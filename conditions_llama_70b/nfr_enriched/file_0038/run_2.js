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
        const event = this.generatePageEvent(sessionId, content, timestamp, sessionAttributes);

        events.push(event);
    }

    return events;
}

/**
 * Determine the number of pages in a session
 * @returns {number} The number of pages in the session
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
 * @returns {Date} The base timestamp for the session
 */
generateBaseTimestamp() {
    const firstContent = this.selectContent();
    return this.generateTimestamp(firstContent.published_at);
}

/**
 * Generate the session attributes
 * @returns {object} The session attributes
 */
generateSessionAttributes() {
    const firstContent = this.selectContent();
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
        firstContent,
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
 * Generate the timestamp for a page in a session
 * @param {Date} baseTimestamp The base timestamp for the session
 * @param {number} pageIndex The index of the page in the session
 * @returns {Date} The timestamp for the page
 */
generatePageTimestamp(baseTimestamp, pageIndex) {
    if (pageIndex === 0) {
        return baseTimestamp;
    }

    const offsetSeconds = 30 + Math.floor(Math.random() * 270); // 30-300 seconds
    return new Date(baseTimestamp.getTime() + (pageIndex * offsetSeconds * 1000));
}

/**
 * Generate a page event
 * @param {string} sessionId The session ID
 * @param {object} content The content for the page
 * @param {Date} timestamp The timestamp for the page
 * @param {object} sessionAttributes The session attributes
 * @returns {object} The page event
 */
generatePageEvent(sessionId, content, timestamp, sessionAttributes) {
    let href = `${sessionAttributes.baseUrl}${content.pathname}`;
    // Only include UTM on first page of session (entry page)
    if (sessionAttributes.utmParams) {
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
        referrer: content.pathname === sessionAttributes.firstContent.pathname ? sessionAttributes.referrer : '', // Only first page has external referrer
        pathname: content.pathname,
        href: href,
        meta: {
            referrerSource: content.pathname === sessionAttributes.firstContent.pathname ? sessionAttributes.referrerSource : ''
        }
    };

    // Only include UTM on entry page
    if (content.pathname === sessionAttributes.firstContent.pathname && sessionAttributes.utmParams) {
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