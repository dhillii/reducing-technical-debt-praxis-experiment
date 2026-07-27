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

generateBaseTimestamp() {
    const firstContent = this.selectContent();
    return this.generateTimestamp(firstContent.published_at);
}

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

generatePageTimestamp(baseTimestamp, pageIndex) {
    if (pageIndex === 0) {
        return baseTimestamp;
    }

    const offsetSeconds = 30 + Math.floor(Math.random() * 270); // 30-300 seconds
    return new Date(baseTimestamp.getTime() + (pageIndex * offsetSeconds * 1000));
}

generatePagePayload(sessionAttributes, content, pageIndex) {
    const href = `${sessionAttributes.baseUrl}${content.pathname}`;
    const utmParams = pageIndex === 0 ? sessionAttributes.utmParams : null;

    if (utmParams) {
        const utmQueryString = Object.entries(utmParams)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');
        if (utmQueryString) {
            href = `${href}?${utmQueryString}`;
        }
    }

    return {
        site_uuid: this.siteUuid,
        member_uuid: sessionAttributes.memberUuid,
        member_status: sessionAttributes.memberStatus,
        post_uuid: content.post_uuid,
        post_type: content.post_type,
        'user-agent': sessionAttributes.userAgent,
        locale: sessionAttributes.locale,
        location: sessionAttributes.location,
        referrer: pageIndex === 0 ? sessionAttributes.referrer : '',
        pathname: content.pathname,
        href: href,
        meta: {
            referrerSource: pageIndex === 0 ? sessionAttributes.referrerSource : ''
        }
    };
}