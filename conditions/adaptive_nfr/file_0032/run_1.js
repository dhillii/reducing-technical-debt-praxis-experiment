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
 * Compares two values handling null/undefined cases
 * @param {*} val1 - First value
 * @param {*} val2 - Second value
 * @returns {number} -1 if val1 is null, 1 if val2 is null, 0 if both null
 */
function compareNullValues(val1, val2) {
    if (!val1 && !val2) {
        return 0;
    }
    if (!val1) {
        return -1;
    }
    if (!val2) {
        return 1;
    }
    return null;
}

/**
 * Checks if status is draft or published
 * @param {string} status - Status value
 * @returns {boolean}
 */
function isDraftOrPublished(status) {
    return status === 'draft' || status === 'published';
}

/**
 * Checks if status is scheduled
 * @param {string} status - Status value
 * @returns {boolean}
 */
function isScheduledStatus(status) {
    return status === 'scheduled';
}

function statusCompare(postA, postB) {
    let status1 = postA.get('status');
    let status2 = postB.get('status');

    let nullResult = compareNullValues(status1, status2);
    if (nullResult !== null) {
        return nullResult;
    }

    // Scheduled posts listed first, then draft and published alphabetically
    if (isScheduledStatus(status1) && isDraftOrPublished(status2)) {
        return -1;
    }

    if (isScheduledStatus(status2) && isDraftOrPublished(status1)) {
        return 1;
    }

    return compare(status1.valueOf(), status2.valueOf());
}

function publishedAtCompare(postA, postB) {
    let published1 = postA.get('publishedAtUTC');
    let published2 = postB.get('publishedAtUTC');

    let nullResult = compareNullValues(published1, published2);
    if (nullResult !== null) {
        return nullResult;
    }

    return compare(published1.valueOf(), published2.valueOf());
}

/**
 * Visibility segment strategy lookup
 */
const visibilitySegmentStrategies = {
    /**
     * @param {Object} context - Post model context
     * @returns {string}
     */
    members(context) {
        return 'status:free,status:-free';
    },
    /**
     * @param {Object} context - Post model context
     * @returns {string}
     */
    paid(context) {
        return 'status:-free';
    },
    /**
     * @param {Object} context - Post model context
     * @returns {string}
     */
    tiers(context) {
        if (context.tiers) {
            return context.tiers.map((tier) => {
                return `tier:${tier.slug}`;
            }).join(',');
        }
        return context.visibility;
    }
};

/**
 * Gets visibility segment for non-public visibility
 * @param {Object} context - Post model context
 * @returns {string}
 */
function getNonPublicVisibilitySegment(context) {
    const strategy = visibilitySegmentStrategies[context.visibility];
    if (strategy) {
        return strategy(context);
    }
    return context.visibility;
}

/**
 * Gets visibility segment based on visibility and settings
 * @param {Object} context - Post model context
 * @returns {string}
 */
function getVisibilitySegment(context) {
    if (context.isPublic) {
        return context.settings.defaultContentVisibility === 'paid' ? 'status:-free' : 'status:free,status:-free';
    }
    return getNonPublicVisibilitySegment(context);
}

/**
 * Checks if post is public
 * @param {string} visibility - Visibility value
 * @returns {boolean}
 */
function isPublicVisibility(visibility) {
    return visibility === 'public';
}

/**
 * Checks if email tracking is available
 * @param {Object} context - Post model context
 * @returns {boolean}
 */
function canShowEmailOpenAnalytics(context) {
    return context.hasBeenEmailed
        && !context.session.user.isContributor
        && context.settings.membersSignupAccess !== 'none'
        && context.email.trackOpens
        && context.settings.emailTrackOpens;
}

/**
 * Checks if email click analytics are available
 * @param {Object} context - Post model context
 * @returns {boolean}
 */
function canShowEmailClickAnalytics(context) {
    return context.hasBeenEmailed
        && !context.session.user.isContributor
        && context.settings.membersSignupAccess !== 'none'
        && (context.isSent || context.isPublished)
        && context.email.trackClicks
        && context.settings.emailTrackClicks;
}

/**
 * Checks if attribution analytics are available
 * @param {Object} context - Post model context
 * @returns {boolean}
 */
function canShowAttributionAnalytics(context) {
    return (context.isPage || !context.emailOnly)
            && context.isPublished
            && context.settings.membersTrackSources
            && !context.membersUtils.isMembersInviteOnly
            && !context.session.user.isContributor;
}

/**
 * Checks if analytics page should be shown
 * @param {Object} context - Post model context
 * @returns {boolean}
 */
function canShowAnalyticsPage(context) {
    return context.isPost
        && context.session.user.isAdmin
        && (
            context.showEmailOpenAnalytics
            || context.showEmailClickAnalytics
            || context.showAttributionAnalytics
        );
}

/**
 * Checks if post has been emailed
 * @param {Object} context - Post model context
 * @returns {boolean}
 */
function hasBeenEmailedCheck(context) {
    return context.isPost
        && (context.isSent || context.isPublished)
        && context.email && context.email.status !== 'failed';
}

/**
 * Checks if email failed
 * @param {Object} context - Post model context
 * @returns {boolean}
 */
function didEmailFailCheck(context) {
    return context.isPost
        && (context.isSent || context.isPublished)
        && context.email && context.email.status === 'failed';
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

    isPublished: equal('status', 'published'),
    isDraft: equal('status', 'draft'),
    internalTags: filterBy('tags', 'isInternal', true),
    isScheduled: equal('status', 'scheduled'),
    isSent: equal('status', 'sent'),

    isPost: equal('displayName', 'post'),
    isPage: equal('displayName', 'page'),

    hasEmail: computed('email', 'emailOnly', function () {
        return this.email !== null || this.emailOnly;
    }),
    willEmail: computed('isScheduled', 'newsletter', 'email', function () {
        return this.isScheduled && !!this.newsletter && !this.email;
    }),

    hasBeenEmailed: computed('isPost', 'isSent', 'isPublished', 'email', function () {
        return hasBeenEmailedCheck(this);
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return didEmailFailCheck(this);
    }),

    showAudienceFeedback: computed('sentiment', function () {
        return this.feature.get('audienceFeedback') && this.sentiment !== undefined;
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return canShowEmailOpenAnalytics(this);
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return canShowEmailClickAnalytics(this);
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return canShowAttributionAnalytics(this);
    }),

    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    hasAnalyticsPage: computed('isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics', function () {
        return canShowAnalyticsPage(this);
    }),

    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        let blogUrl = this.config.blogUrl;
        let uuid = this.uuid;
        let previewKeyword = 'p';
        if (!uuid) {
            return '';
        }
        return this.get('ghostPaths.url').join(blogUrl, previewKeyword, uuid);
    }),

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    isPublic: computed('visibility', function () {
        return isPublicVisibility(this.visibility);
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        return getVisibilitySegment(this);
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        if (!this.newsletter) {
            return this.emailSegment;
        }

        return `${this.newsletter.recipientFilter}+(${this.emailSegment})`;
    }),

    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        if (this.isScheduled) {
            let now = moment.utc();
            let publishedAtUTC = this.publishedAtUTC || now;
            let pastScheduledTime = publishedAtUTC.diff(now, 'hours', true) < 0;

            this.get('clock.second');

            return pastScheduledTime;
        }
        return false;
    }),

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings.timezone', {
        get() {
            return this._getPublishedAtBlogTZ();
        },
        set(key, value) {
            let momentValue = value ? moment(value) : null;
            this._setPublishedAtBlogStrings(momentValue);
            return this._getPublishedAtBlogTZ();
        }
    }),

    clickRate: computed('email.emailCount', 'count.clicks', function () {
        if (!this.email || !this.email.emailCount) {
            return 0;
        }
        if (!this.count || !this.count.clicks) {
            return 0;
        }

        return Math.round(this.count.clicks / this.email.emailCount * 100);
    }),

    _getPublishedAtBlogTZ() {
        let publishedAtUTC = this.publishedAtUTC;
        let publishedAtBlogDate = this.publishedAtBlogDate;
        let publishedAtBlogTime = this.publishedAtBlogTime;
        let blogTimezone = this.settings.timezone;

        if (!publishedAtUTC && isBlank(publishedAtBlogDate) && isBlank(publishedAtBlogTime)) {
            return null;
        }

        if (publishedAtBlogDate && publishedAtBlogTime) {
            let publishedAtBlog = moment.tz(`${publishedAtBlogDate} ${publishedAtBlogTime}`, blogTimezone);

            if (publishedAtUTC && publishedAtBlog.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
                return publishedAtUTC;
            }

            return publishedAtBlog;
        }
        return moment.tz(this.publishedAtUTC, blogTimezone);
    },

    // TODO: is there a better way to handle this?
    // eslint-disable-next-line ghost/ember/no-observers
    _setPublishedAtBlogTZ: on('init', observer('publishedAtUTC', 'settings.timezone', function () {
        let publishedAtUTC = this.publishedAtUTC;
        this._setPublishedAtBlogStrings(publishedAtUTC);
    })),

    _setPublishedAtBlogStrings(momentDate) {
        if (momentDate) {
            let blogTimezone = this.settings.timezone;
            let publishedAtBlog = moment.tz(momentDate, blogTimezone);

            this.set('publishedAtBlogDate', publishedAtBlog.format('YYYY-MM-DD'));
            this.set('publishedAtBlogTime', publishedAtBlog.format('HH:mm'));
        } else {
            this.set('publishedAtBlogDate', '');
            this.set('publishedAtBlogTime', '');
        }
    },

    updateTags() {
        let tags = this.tags;
        let oldTags = tags.filterBy('id', null);

        tags.removeObjects(oldTags);
        oldTags.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return this.authors.includes(user);
    },

    compare(postA, postB) {
        let updated1 = postA.get('updatedAtUTC');
        let updated2 = postB.get('updatedAtUTC');
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
        statusResult = statusCompare(postA, postB);
        updatedAtResult = compare(updated1.valueOf(), updated2.valueOf());
        publishedAtResult = publishedAtCompare(postA, postB);

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
    },

    beforeSave() {
        let publishedAtBlogTZ = this.publishedAtBlogTZ;
        let publishedAtUTC = publishedAtBlogTZ ? publishedAtBlogTZ.utc() : null;
        this.set('publishedAtUTC', publishedAtUTC);
    },

    save() {
        const [oldStatus] = this.changedAttributes().status || [];

        return this._super(...arguments).then((res) => {
            if (this.status === 'published' || oldStatus === 'published') {
                this.search.expireContent();
            }

            return res;
        });
    }
});
```