/**
 * Determine number of pages in a session
 * @returns {number} Number of pages
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
 * Generate base timestamp for a session
 * @param {string} publishedAt - Published date of the content
 * @returns {Date} Base timestamp
 */
generateBaseTimestamp(publishedAt) {
    const now = new Date();
    const monthsBack = 12;
    let startDate = new Date(now.getTime() - (monthsBack * 30 * 24 * 60 * 60 * 1000));

    // If content has a publication date, ensure views only happen after publication
    if (publishedAt) {
        const pubDate = new Date(publishedAt);
        if (pubDate > startDate) {
            startDate = pubDate;
        }
    }

    // Ensure valid range
    if (startDate >= now) {
        startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    }

    const timeRange = now.getTime() - startDate.getTime();

    // Use a power distribution to create gradual growth
    // position = random^0.6 gives a nice S-curve growth pattern:
    //   - Earliest months: ~5-10% of traffic
    //   - Middle months: steady growth
    //   - Recent months: ~15-20% of traffic (not overwhelming spike)
    const random = Math.random();
    const timePosition = Math.pow(random, 0.6);

    let timestamp = new Date(startDate.getTime() + (timePosition * timeRange));

    // Apply realistic daily patterns (but don't shift dates, only hours)
    const hour = timestamp.getHours();

    // Reduce overnight traffic (midnight to 6am) by shifting hours only
    if (hour >= 0 && hour < 6) {
        if (Math.random() < 0.7) {
            // Shift to daytime hours (same day)
            timestamp.setHours(9 + Math.floor(Math.random() * 12));
        }
    }

    // Add random minute/second variation
    timestamp.setMinutes(Math.floor(Math.random() * 60));
    timestamp.setSeconds(Math.floor(Math.random() * 60));

    // Safety check: never return future timestamp
    if (timestamp > now) {
        timestamp = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
    }

    return timestamp;
}

/**
 * Generate session attributes
 * @returns {object} Session attributes
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
 * Generate a session with multiple page hits
 * Returns an array of events for a single user session
 */
generateSession() {
    const sessionId = this.generateUuid();
    const pageCount = this.determinePageCount();
    const firstContent = this.selectContent();
    const baseTimestamp = this.generateBaseTimestamp(firstContent.published_at);
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