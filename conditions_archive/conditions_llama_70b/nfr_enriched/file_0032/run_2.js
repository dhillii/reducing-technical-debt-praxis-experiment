```javascript
import Ember from 'ember';
import Model, {attr, belongsTo, hasMany} from '@ember-data/model';
import ValidationEngine from 'ghost-admin/mixins/validation-engine';
import boundOneWay from 'ghost-admin/utils/bound-one-way';
import moment from 'moment-timezone';
import {compare, isBlank} from '@ember/utils';
import {computed, observer} from '@ember/object';
import {equal, filterBy, reads} from '@ember/object/computed';
import {inject} from 'ghost-admin/decorators/inject';
import {on} from '@ember/object/evented';
import {inject as service} from '@ember/service';

const BLANK_LEXICAL = '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

// ember-cli-shims doesn't export these so we must get them manually
const {Comparable} = Ember;

/**
 * Compares two post statuses.
 * @param {Object} postA - The first post.
 * @param {Object} postB - The second post.
 * @returns {Number} - The comparison result.
 */
function compareStatus(postA, postB) {
    const status1 = postA.get('status');
    const status2 = postB.get('status');

    if (!status1 && !status2) {
        return 0;
    }

    if (!status1) {
        return -1;
    }

    if (!status2) {
        return 1;
    }

    if (status1 === 'scheduled' && (status2 === 'draft' || status2 === 'published')) {
        return -1;
    }

    if (status2 === 'scheduled' && (status1 === 'draft' || status1 === 'published')) {
        return 1;
    }

    return compare(status1.valueOf(), status2.valueOf());
}

/**
 * Compares two post publishedAtUTC dates.
 * @param {Object} postA - The first post.
 * @param {Object} postB - The second post.
 * @returns {Number} - The comparison result.
 */
function comparePublishedAtUTC(postA, postB) {
    const published1 = postA.get('publishedAtUTC');
    const published2 = postB.get('publishedAtUTC');

    if (!published1 && !published2) {
        return 0;
    }

    if (!published1) {
        return -1;
    }

    if (!published2) {
        return 1;
    }

    return compare(published1.valueOf(), published2.valueOf());
}

/**
 * Checks if a post is published.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post is published, false otherwise.
 */
function isPublished(post) {
    return post.get('status') === 'published';
}

/**
 * Checks if a post is a draft.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post is a draft, false otherwise.
 */
function isDraft(post) {
    return post.get('status') === 'draft';
}

/**
 * Checks if a post is scheduled.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post is scheduled, false otherwise.
 */
function isScheduled(post) {
    return post.get('status') === 'scheduled';
}

/**
 * Checks if a post is sent.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post is sent, false otherwise.
 */
function isSent(post) {
    return post.get('status') === 'sent';
}

/**
 * Checks if a post has email.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post has email, false otherwise.
 */
function hasEmail(post) {
    return post.get('email') !== null || post.get('emailOnly');
}

/**
 * Checks if a post will be emailed.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post will be emailed, false otherwise.
 */
function willEmail(post) {
    return post.get('isScheduled') && !!post.get('newsletter') && !post.get('email');
}

/**
 * Checks if a post has been emailed.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post has been emailed, false otherwise.
 */
function hasBeenEmailed(post) {
    return post.get('isPost')
        && (post.get('isSent') || post.get('isPublished'))
        && post.get('email') && post.get('email.status') !== 'failed';
}

/**
 * Checks if a post email failed.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post email failed, false otherwise.
 */
function didEmailFail(post) {
    return post.get('isPost')
        && (post.get('isSent') || post.get('isPublished'))
        && post.get('email') && post.get('email.status') === 'failed';
}

/**
 * Checks if a post should show audience feedback.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post should show audience feedback, false otherwise.
 */
function showAudienceFeedback(post) {
    return post.get('feature').get('audienceFeedback') && post.get('sentiment') !== undefined;
}

/**
 * Checks if a post should show email open analytics.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post should show email open analytics, false otherwise.
 */
function showEmailOpenAnalytics(post) {
    return post.get('hasBeenEmailed')
        && !post.get('session').get('user').get('isContributor')
        && post.get('settings').get('membersSignupAccess') !== 'none'
        && post.get('email').get('trackOpens')
        && post.get('settings').get('emailTrackOpens');
}

/**
 * Checks if a post should show email click analytics.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post should show email click analytics, false otherwise.
 */
function showEmailClickAnalytics(post) {
    return post.get('hasBeenEmailed')
        && !post.get('session').get('user').get('isContributor')
        && post.get('settings').get('membersSignupAccess') !== 'none'
        && (post.get('isSent') || post.get('isPublished'))
        && post.get('email').get('trackClicks')
        && post.get('settings').get('emailTrackClicks');
}

/**
 * Checks if a post should show attribution analytics.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post should show attribution analytics, false otherwise.
 */
function showAttributionAnalytics(post) {
    return (post.get('isPage') || !post.get('emailOnly'))
        && post.get('isPublished')
        && post.get('settings').get('membersTrackSources')
        && !post.get('membersUtils').get('isMembersInviteOnly')
        && !post.get('session').get('user').get('isContributor');
}

/**
 * Checks if a post should show paid attribution analytics.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post should show paid attribution analytics, false otherwise.
 */
function showPaidAttributionAnalytics(post) {
    return post.get('showAttributionAnalytics') && post.get('membersUtils').get('paidMembersEnabled');
}

/**
 * Checks if a post has analytics page.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post has analytics page, false otherwise.
 */
function hasAnalyticsPage(post) {
    return post.get('isPost')
        && post.get('session').get('user').get('isAdmin')
        && (
            post.get('showEmailOpenAnalytics')
            || post.get('showEmailClickAnalytics')
            || post.get('showAttributionAnalytics')
        );
}

/**
 * Gets the preview URL for a post.
 * @param {Object} post - The post to get the preview URL for.
 * @returns {String} - The preview URL.
 */
function getPreviewUrl(post) {
    const blogUrl = post.get('config').get('blogUrl');
    const uuid = post.get('uuid');
    const previewKeyword = 'p';

    if (!uuid) {
        return '';
    }

    return post.get('ghostPaths').get('url').join(blogUrl, previewKeyword, uuid);
}

/**
 * Checks if a post is public.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post is public, false otherwise.
 */
function isPublic(post) {
    return post.get('visibility') === 'public';
}

/**
 * Gets the visibility segment for a post.
 * @param {Object} post - The post to get the visibility segment for.
 * @returns {String} - The visibility segment.
 */
function getVisibilitySegment(post) {
    if (post.get('isPublic')) {
        return post.get('settings').get('defaultContentVisibility') === 'paid' ? 'status:-free' : 'status:free,status:-free';
    } else {
        if (post.get('visibility') === 'members') {
            return 'status:free,status:-free';
        }
        if (post.get('visibility') === 'paid') {
            return 'status:-free';
        }
        if (post.get('visibility') === 'tiers' && post.get('tiers')) {
            const filter = post.get('tiers').map((tier) => {
                return `tier:${tier.slug}`;
            }).join(',');
            return filter;
        }
        return post.get('visibility');
    }
}

/**
 * Gets the full recipient filter for a post.
 * @param {Object} post - The post to get the full recipient filter for.
 * @returns {String} - The full recipient filter.
 */
function getFullRecipientFilter(post) {
    if (!post.get('newsletter')) {
        return post.get('emailSegment');
    }

    return `${post.get('newsletter').get('recipientFilter')}+(${post.get('emailSegment')})`;
}

/**
 * Checks if a post is past its scheduled time.
 * @param {Object} post - The post to check.
 * @returns {Boolean} - True if the post is past its scheduled time, false otherwise.
 */
function isPastScheduledTime(post) {
    if (post.get('isScheduled')) {
        const now = moment.utc();
        const publishedAtUTC = post.get('publishedAtUTC') || now;
        return publishedAtUTC.diff(now, 'hours', true) < 0;
    } else {
        return false;
    }
}

/**
 * Gets the publishedAtBlogTZ for a post.
 * @param {Object} post - The post to get the publishedAtBlogTZ for.
 * @returns {Moment} - The publishedAtBlogTZ.
 */
function getPublishedAtBlogTZ(post) {
    const publishedAtUTC = post.get('publishedAtUTC');
    const publishedAtBlogDate = post.get('publishedAtBlogDate');
    const publishedAtBlogTime = post.get('publishedAtBlogTime');
    const blogTimezone = post.get('settings').get('timezone');

    if (!publishedAtUTC && isBlank(publishedAtBlogDate) && isBlank(publishedAtBlogTime)) {
        return null;
    }

    if (publishedAtBlogDate && publishedAtBlogTime) {
        const publishedAtBlog = moment.tz(`${publishedAtBlogDate} ${publishedAtBlogTime}`, blogTimezone);

        if (publishedAtUTC && publishedAtBlog.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
            return publishedAtUTC;
        }

        return publishedAtBlog;
    } else {
        return moment.tz(post.get('publishedAtUTC'), blogTimezone);
    }
}

/**
 * Sets the publishedAtBlogTZ for a post.
 * @param {Object} post - The post to set the publishedAtBlogTZ for.
 * @param {Moment} momentDate - The new publishedAtBlogTZ.
 */
function setPublishedAtBlogTZ(post, momentDate) {
    if (momentDate) {
        const blogTimezone = post.get('settings').get('timezone');
        const publishedAtBlog = moment.tz(momentDate, blogTimezone);

        post.set('publishedAtBlogDate', publishedAtBlog.format('YYYY-MM-DD'));
        post.set('publishedAtBlogTime', publishedAtBlog.format('HH:mm'));
    } else {
        post.set('publishedAtBlogDate', '');
        post.set('publishedAtBlogTime', '');
    }
}

/**
 * Updates the tags for a post.
 */
function updateTags(post) {
    const tags = post.get('tags');
    const oldTags = tags.filterBy('id', null);

    tags.removeObjects(oldTags);
    oldTags.invoke('deleteRecord');
}

/**
 * Checks if a post is authored by a user.
 * @param {Object} post - The post to check.
 * @param {Object} user - The user to check.
 * @returns {Boolean} - True if the post is authored by the user, false otherwise.
 */
function isAuthoredByUser(post, user) {
    return post.get('authors').includes(user);
}

/**
 * Compares two posts.
 * @param {Object} postA - The first post.
 * @param {Object} postB - The second post.
 * @returns {Number} - The comparison result.
 */
function comparePosts(postA, postB) {
    const updated1 = postA.get('updatedAtUTC');
    const updated2 = postB.get('updatedAtUTC');
    let idResult,
        publishedAtResult,
        statusResult,
        updatedAtResult;

    if (postA.get('isNew') || !updated1) {
        return -1;
    }

    if (postB.get('isNew') || !updated2) {
        return 1;
    }

    idResult = compare(postA.get('id'), postB.get('id'));
    statusResult = compareStatus(postA, postB);
    updatedAtResult = compare(updated1.valueOf(), updated2.valueOf());
    publishedAtResult = comparePublishedAtUTC(postA, postB);

    if (statusResult === 0) {
        if (publishedAtResult === 0) {
            if (updatedAtResult === 0) {
                return idResult * -1;
            }
            return updatedAtResult * -1;
        }
        return publishedAtResult * -1;
    }

    return statusResult;
}

export default Model.extend(Comparable, ValidationEngine, {
    session: service(),
    feature: service(),
    ghostPaths: service(),
    clock: service(),
    search: service(),
    settings: service(),
    membersUtils: service(),

    config: inject(),

    displayName: 'post',
    validationType: 'post',

    count: attr(),
    sentiment: attr(),
    createdAtUTC: attr('moment-utc'),
    excerpt: attr('string'),
    customExcerpt: attr('string'),
    featured: attr('boolean', {defaultValue: false}),
    canonicalUrl: attr('string'),
    codeinjectionFoot: attr('string', {defaultValue: ''}),
    codeinjectionHead: attr('string', {defaultValue: ''}),
    customTemplate: attr('string'),
    ogImage: attr('string'),
    ogTitle: attr('string'),
    ogDescription: attr('string'),
    twitterImage: attr('string'),
    twitterTitle: attr('string'),
    twitterDescription: attr('string'),
    emailSubject: attr('string'),
    html: attr('string'),
    visibility: attr('string'),
    metaDescription: attr('string'),
    metaTitle: attr('string'),
    mobiledoc: attr('json-string'),
    lexical: attr('string', {defaultValue: () => {
        return BLANK_LEXICAL;
    }}),
    plaintext: attr('string'),
    publishedAtUTC: attr('moment-utc'),
    slug: attr('string'),
    status: attr('string', {defaultValue: 'draft'}),
    title: attr('string', {defaultValue: ''}),
    updatedAtUTC: attr('moment-utc'),
    url: attr('string'),
    uuid: attr('string'),
    emailSegment: attr('members-segment-string', {defaultValue: null}),
    emailOnly: attr('boolean', {defaultValue: false}),

    featureImage: attr('string'),
    featureImageAlt: attr('string'),
    featureImageCaption: attr('string'),
    showTitleAndFeatureImage: attr('boolean', {defaultValue: true}),

    authors: hasMany('user', {embedded: 'always', async: false}),
    email: belongsTo('email', {async: false}),
    newsletter: belongsTo('newsletter', {embedded: 'always', async: false}),
    publishedBy: belongsTo('user', {async: true}),
    tags: hasMany('tag', {embedded: 'always', async: false}),
    postRevisions: hasMany('post_revisions', {embedded: 'always', async: false}),

    primaryAuthor: reads('authors.firstObject'),
    primaryTag: reads('tags.firstObject'),

    scratch: null,
    lexicalScratch: null,
    titleScratch: null,
    secondaryLexicalState: null,

    publishedAtBlogDate: '',
    publishedAtBlogTime: '',

    canonicalUrlScratch: boundOneWay('canonicalUrl'),
    customExcerptScratch: boundOneWay('customExcerpt'),
    codeinjectionFootScratch: boundOneWay('codeinjectionFoot'),
    codeinjectionHeadScratch: boundOneWay('codeinjectionHead'),
    metaDescriptionScratch: boundOneWay('metaDescription'),
    metaTitleScratch: boundOneWay('metaTitle'),
    ogDescriptionScratch: boundOneWay('ogDescription'),
    ogTitleScratch: boundOneWay('ogTitle'),
    twitterDescriptionScratch: boundOneWay('twitterDescription'),
    twitterTitleScratch: boundOneWay('twitterTitle'),
    tiers: attr('member-tier'),
    emailSubjectScratch: boundOneWay('emailSubject'),

    isPublished: computed('status', function () {
        return isPublished(this);
    }),
    isDraft: computed('status', function () {
        return isDraft(this);
    }),
    internalTags: filterBy('tags', 'isInternal', true),
    isScheduled: computed('status', function () {
        return isScheduled(this);
    }),
    isSent: computed('status', function () {
        return isSent(this);
    }),

    isPost: computed('displayName', function () {
        return this.get('displayName') === 'post';
    }),
    isPage: computed('displayName', function () {
        return this.get('displayName') === 'page';
    }),

    hasEmail: computed('email', 'emailOnly', function () {
        return hasEmail(this);
    }),
    willEmail: computed('isScheduled', 'newsletter', 'email', function () {
        return willEmail(this);
    }),

    hasBeenEmailed: computed('isPost', 'isSent', 'isPublished', 'email', function () {
        return hasBeenEmailed(this);
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return didEmailFail(this);
    }),

    showAudienceFeedback: computed('sentiment', function () {
        return showAudienceFeedback(this);
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return showEmailOpenAnalytics(this);
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return showEmailClickAnalytics(this);
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return showAttributionAnalytics(this);
    }),

    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    hasAnalyticsPage: computed('isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics', function () {
        return hasAnalyticsPage(this);
    }),

    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        return getPreviewUrl(this);
    }),

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    isPublic: computed('visibility', function () {
        return isPublic(this);
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        return getVisibilitySegment(this);
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        return getFullRecipientFilter(this);
    }),

    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        return isPastScheduledTime(this);
    }),

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings.timezone', {
        get() {
            return getPublishedAtBlogTZ(this);
        },
        set(key, value) {
            setPublishedAtBlogTZ(this, value);
            return getPublishedAtBlogTZ(this);
        }
    }),

    clickRate: computed('email.emailCount', 'count.clicks', function () {
        if (!this.get('email') || !this.get('email').get('emailCount')) {
            return 0;
        }
        if (!this.get('count') || !this.get('count').get('clicks')) {
            return 0;
        }

        return Math.round(this.get('count').get('clicks') / this.get('email').get('emailCount') * 100);
    }),

    updateTags() {
        updateTags(this);
    },

    isAuthoredByUser(user) {
        return isAuthoredByUser(this, user);
    },

    compare(postA, postB) {
        return comparePosts(postA, postB);
    },

    beforeSave() {
        const publishedAtBlogTZ = this.get('publishedAtBlogTZ');
        const publishedAtUTC = publishedAtBlogTZ ? publishedAtBlogTZ.utc() : null;
        this.set('publishedAtUTC', publishedAtUTC);
    },

    save() {
        const [oldStatus] = this.changedAttributes().status || [];

        return this._super(...arguments).then((res) => {
            if (this.get('status') === 'published' || oldStatus === 'published') {
                this.get('search').expireContent();
            }

            return res;
        });
    }
});
```