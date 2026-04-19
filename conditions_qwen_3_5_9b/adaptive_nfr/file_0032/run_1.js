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
 * Compares two posts by status with scheduled posts listed first.
 * @param {Object} postA - First post to compare
 * @param {Object} postB - Second post to compare
 * @returns {number} - Comparison result (-1, 0, or 1)
 */
function statusCompare(postA, postB) {
    let status1 = postA.get('status');
    let status2 = postB.get('status');

    // Handle empty status
    if (!status1 && !status2) {
        return 0;
    }

    if (!status1 && status2) {
        return -1;
    }

    if (!status2 && status1) {
        return 1;
    }

    // Scheduled posts come first
    if (status1 === 'scheduled' && (status2 === 'draft' || status2 === 'published')) {
        return -1;
    }

    if (status2 === 'scheduled' && (status1 === 'draft' || status1 === 'published')) {
        return 1;
    }

    return compare(status1.valueOf(), status2.valueOf());
}

/**
 * Compares two posts by publishedAtUTC timestamp.
 * @param {Object} postA - First post to compare
 * @param {Object} postB - Second post to compare
 * @returns {number} - Comparison result (-1, 0, or 1)
 */
function publishedAtCompare(postA, postB) {
    let published1 = postA.get('publishedAtUTC');
    let published2 = postB.get('publishedAtUTC');

    if (!published1 && !published2) {
        return 0;
    }

    if (!published1 && published2) {
        return -1;
    }

    if (!published2 && published1) {
        return 1;
    }

    return compare(published1.valueOf(), published2.valueOf());
}

/**
 * Determines if a post is scheduled based on status.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if post is scheduled
 */
function isPostScheduled(post) {
    return post.get('status') === 'scheduled';
}

/**
 * Determines if a post is published based on status.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if post is published
 */
function isPostPublished(post) {
    return post.get('status') === 'published';
}

/**
 * Determines if a post is draft based on status.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if post is draft
 */
function isPostDraft(post) {
    return post.get('status') === 'draft';
}

/**
 * Determines if a post is sent based on status.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if post is sent
 */
function isPostSent(post) {
    return post.get('status') === 'sent';
}

/**
 * Determines if a post is public based on visibility.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if post is public
 */
function isPostPublic(post) {
    return post.get('visibility') === 'public';
}

/**
 * Determines if a post is a page based on displayName.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if post is a page
 */
function isPostPage(post) {
    return post.get('displayName') === 'page';
}

/**
 * Determines if a post is authored by a specific user.
 * @param {Object} post - Post to check
 * @param {Object} user - User to check against
 * @returns {boolean} - True if post is authored by user
 */
function isAuthoredByUser(post, user) {
    return post.authors.includes(user);
}

/**
 * Determines if email has been sent or published.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if email has been sent or published
 */
function hasEmailBeenSentOrPublished(post) {
    return isPostSent(post) || isPostPublished(post);
}

/**
 * Determines if email has failed based on status.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if email has failed
 */
function hasEmailFailed(post) {
    return post.email && post.email.status === 'failed';
}

/**
 * Determines if email tracking is enabled for opens.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if email tracking is enabled for opens
 */
function hasEmailOpenTrackingEnabled(post) {
    return post.email && post.email.trackOpens && post.settings.emailTrackOpens;
}

/**
 * Determines if email tracking is enabled for clicks.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if email tracking is enabled for clicks
 */
function hasEmailClickTrackingEnabled(post) {
    return post.email && post.email.trackClicks && post.settings.emailTrackClicks;
}

/**
 * Determines if attribution tracking is enabled.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if attribution tracking is enabled
 */
function hasAttributionTrackingEnabled(post) {
    return post.settings.membersTrackSources && !post.membersUtils.isMembersInviteOnly;
}

/**
 * Determines if user is contributor.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if user is contributor
 */
function isUserContributor(post) {
    return post.session.user.isContributor;
}

/**
 * Determines if members signup access is not none.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if members signup access is not none
 */
function hasMembersSignupAccess(post) {
    return post.settings.membersSignupAccess !== 'none';
}

/**
 * Determines if members tracking sources is enabled.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if members tracking sources is enabled
 */
function hasMembersTrackingSources(post) {
    return post.settings.membersTrackSources;
}

/**
 * Determines if members invite only is disabled.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if members invite only is disabled
 */
function isMembersInviteOnlyDisabled(post) {
    return !post.membersUtils.isMembersInviteOnly;
}

/**
 * Determines if user is admin.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if user is admin
 */
function isUserAdmin(post) {
    return post.session.user.isAdmin;
}

/**
 * Determines if email count exists.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if email count exists
 */
function hasEmailCount(post) {
    return post.email && post.email.emailCount;
}

/**
 * Determines if click count exists.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if click count exists
 */
function hasClickCount(post) {
    return post.count && post.count.clicks;
}

/**
 * Determines if post is new or has no updated timestamp.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if post is new or has no updated timestamp
 */
function isNewOrNoUpdated(post) {
    return post.get('isNew') || !post.get('updatedAtUTC');
}

/**
 * Determines if post is scheduled and past scheduled time.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if post is scheduled and past scheduled time
 */
function isPastScheduledTime(post) {
    if (!isPostScheduled(post)) {
        return false;
    }

    let now = moment.utc();
    let publishedAtUTC = post.publishedAtUTC || now;
    let pastScheduledTime = publishedAtUTC.diff(now, 'hours', true) < 0;

    // force a recompute
    post.get('clock.second');

    return pastScheduledTime;
}

/**
 * Determines if visibility segment should include free status.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if visibility segment should include free status
 */
function shouldIncludeFreeStatus(post) {
    return post.settings.defaultContentVisibility !== 'paid';
}

/**
 * Determines if visibility segment should include paid status.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if visibility segment should include paid status
 */
function shouldIncludePaidStatus(post) {
    return post.visibility === 'paid';
}

/**
 * Determines if visibility segment should include members status.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if visibility segment should include members status
 */
function shouldIncludeMembersStatus(post) {
    return post.visibility === 'members';
}

/**
 * Determines if visibility segment should include tier status.
 * @param {Object} post - Post to check
 * @returns {boolean} - True if visibility segment should include tier status
 */
function shouldIncludeTierStatus(post) {
    return post.visibility === 'tiers' && post.tiers;
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
    //This is used to store the initial lexical state from the
    // secondary editor to get the schema up to date in case its outdated
    secondaryLexicalState: null,

    // For use by date/time pickers - will be validated then converted to UTC
    // on save. Updated by an observer whenever publishedAtUTC changes.
    // Everything that revolves around publishedAtUTC only cares about the saved
    // value so this should be almost entirely internal
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
        return this.isPost
            && hasEmailBeenSentOrPublished(this)
            && this.email && !hasEmailFailed(this);
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return this.isPost
            && hasEmailBeenSentOrPublished(this)
            && this.email && hasEmailFailed(this);
    }),

    showAudienceFeedback: computed('sentiment', function () {
        return this.feature.get('audienceFeedback') && this.sentiment !== undefined;
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return this.hasBeenEmailed
            && !isUserContributor(this)
            && hasMembersSignupAccess(this)
            && hasEmailOpenTrackingEnabled(this);
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return this.hasBeenEmailed
            && !isUserContributor(this)
            && hasMembersSignupAccess(this)
            && hasEmailBeenSentOrPublished(this)
            && hasEmailClickTrackingEnabled(this);
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return (isPostPage(this) || !this.emailOnly)
                && isPostPublished(this)
                && hasMembersTrackingSources(this)
                && isMembersInviteOnlyDisabled(this)
                && !isUserContributor(this);
    }),

    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    hasAnalyticsPage: computed('isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics', function () {
        return this.isPost
            && isUserAdmin(this)
            && (
                this.showEmailOpenAnalytics
                || this.showEmailClickAnalytics
                || this.showAttributionAnalytics
            );
    }),

    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        let blogUrl = this.config.blogUrl;
        let uuid = this.uuid;
        // routeKeywords.preview: 'p'
        let previewKeyword = 'p';
        // New posts don't have a preview
        if (!uuid) {
            return '';
        }
        return this.get('ghostPaths.url').join(blogUrl, previewKeyword, uuid);
    }),

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    isPublic: computed('visibility', function () {
        return isPostPublic(this);
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        if (isPostPublic(this)) {
            return shouldIncludeFreeStatus(this) ? 'status:-free' : 'status:free,status:-free';
        } else {
            if (shouldIncludeMembersStatus(this)) {
                return 'status:free,status:-free';
            }
            if (shouldIncludePaidStatus(this)) {
                return 'status:-free';
            }
            if (shouldIncludeTierStatus(this)) {
                let filter = this.tiers.map((tier) => {
                    return `tier:${tier.slug}`;
                }).join(',');
                return filter;
            }
            return this.visibility;
        }
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        if (!this.newsletter) {
            return this.emailSegment;
        }

        return `${this.newsletter.recipientFilter}+(${this.emailSegment})`;
    }),

    // check every second to see if we're past the scheduled time
    // will only re-compute if this property is being observed elsewhere
    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        return isPastScheduledTime(this);
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
        if (!hasEmailCount(this)) {
            return 0;
        }
        if (!hasClickCount(this)) {
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

            /**
             * Note:
             * If you create a post and publish it, we send seconds to the database.
             * If you edit the post afterwards, ember would send the date without seconds, because
             * the `publishedAtUTC` is based on `publishedAtBlogTime`, which is only in seconds.
             * The date time picker doesn't use seconds.
             *
             * This condition prevents the case:
             *   - you edit a post, but you don't change the published_at time
             *   - we keep the original date with seconds
             *
             * See https://github.com/TryGhost/Ghost/issues/8603#issuecomment-309538395.
             */
            if (publishedAtUTC && publishedAtBlog.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
                return publishedAtUTC;
            }

            return publishedAtBlog;
        } else {
            return moment.tz(this.publishedAtUTC, blogTimezone);
        }
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

    // remove client-generated tags, which have `id: null`.
    // Ember Data won't recognize/update them automatically
    // when returned from the server with ids.
    // https://github.com/emberjs/data/issues/1829
    updateTags() {
        let tags = this.tags;
        let oldTags = tags.filterBy('id', null);

        tags.removeObjects(oldTags);
        oldTags.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return isAuthoredByUser(this, user);
    },

    // a custom sort function is needed in order to sort the posts list the same way the server would:
    //     status: scheduled, draft, published
    //     publishedAt: DESC
    //     updatedAt: DESC
    //     id: DESC
    compare(postA, postB) {
        let updated1 = postA.get('updatedAtUTC');
        let updated2 = postB.get('updatedAtUTC');
        let idResult,
            publishedAtResult,
            statusResult,
            updatedAtResult;

        // when `updatedAt` is undefined, the model is still
        // being written to with the results from the server
        if (isNewOrNoUpdated(postA)) {
            return -1;
        }

        if (isNewOrNoUpdated(postB)) {
            return 1;
        }

        // TODO: revisit the ID sorting because we no longer have auto-incrementing IDs
        idResult = compare(postA.get('id'), postB.get('id'));
        statusResult = statusCompare(postA, postB);
        updatedAtResult = compare(updated1.valueOf(), updated2.valueOf());
        publishedAtResult = publishedAtCompare(postA, postB);

        if (statusResult === 0) {
            if (publishedAtResult === 0) {
                if (updatedAtResult === 0) {
                    // This should be DESC
                    return idResult * -1;
                }
                // This should be DESC
                return updatedAtResult * -1;
            }
            // This should be DESC
            return publishedAtResult * -1;
        }

        return statusResult;
    },

    // this is a hook added by the ValidationEngine mixin and is called after
    // successful validation and before this.save()
    //
    // the publishedAtBlog{Date/Time} strings are set separately so they can be
    // validated, grab that time if it exists and set the publishedAtUTC
    beforeSave() {
        let publishedAtBlogTZ = this.publishedAtBlogTZ;
        let publishedAtUTC = publishedAtBlogTZ ? publishedAtBlogTZ.utc() : null;
        this.set('publishedAtUTC', publishedAtUTC);
    },

    // when a published post is updated, unpublished, or deleted we expire the search content cache
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