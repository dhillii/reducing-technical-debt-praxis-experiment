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

function compareStatus(postA, postB) {
    // if any of those is empty
    if (!postA.get('status') && !postB.get('status')) {
        return 0;
    }

    if (!postA.get('status') && postB.get('status')) {
        return -1;
    }

    if (!postB.get('status') && postA.get('status')) {
        return 1;
    }

    // We have to make sure, that scheduled posts will be listed first
    // after that, draft and published will be sorted alphabetically and don't need
    // any manual comparison.

    if (postA.get('status') === 'scheduled' && (postB.get('status') === 'draft' || postB.get('status') === 'published')) {
        return -1;
    }

    if (postB.get('status') === 'scheduled' && (postA.get('status') === 'draft' || postA.get('status') === 'published')) {
        return 1;
    }

    return compare(postA.get('status').valueOf(), postB.get('status').valueOf());
}

function comparePublishedAt(postA, postB) {
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

function isPublished(post) {
    return post.get('status') === 'published';
}

function isDraft(post) {
    return post.get('status') === 'draft';
}

function isScheduled(post) {
    return post.get('status') === 'scheduled';
}

function isSent(post) {
    return post.get('status') === 'sent';
}

function hasEmail(post) {
    return post.get('email') !== null || post.get('emailOnly');
}

function willEmail(post) {
    return post.get('isScheduled') && !!post.get('newsletter') && !post.get('email');
}

function hasBeenEmailed(post) {
    return post.get('isPost') && (post.get('isSent') || post.get('isPublished')) && post.get('email') && post.get('email.status') !== 'failed';
}

function didEmailFail(post) {
    return post.get('isPost') && (post.get('isSent') || post.get('isPublished')) && post.get('email') && post.get('email.status') === 'failed';
}

function getVisibilitySegment(post) {
    if (post.get('isPublic')) {
        return post.get('settings.defaultContentVisibility') === 'paid' ? 'status:-free' : 'status:free,status:-free';
    } else {
        if (post.get('visibility') === 'members') {
            return 'status:free,status:-free';
        }
        if (post.get('visibility') === 'paid') {
            return 'status:-free';
        }
        if (post.get('visibility') === 'tiers' && post.get('tiers')) {
            let filter = post.get('tiers').map((tier) => {
                return `tier:${tier.slug}`;
            }).join(',');
            return filter;
        }
        return post.get('visibility');
    }
}

function getFullRecipientFilter(post) {
    if (!post.get('newsletter')) {
        return post.get('emailSegment');
    }

    return `${post.get('newsletter.recipientFilter')}+(${post.get('emailSegment')})`;
}

function getPublishedAtBlogTZ(post) {
    let publishedAtUTC = post.get('publishedAtUTC');
    let publishedAtBlogDate = post.get('publishedAtBlogDate');
    let publishedAtBlogTime = post.get('publishedAtBlogTime');
    let blogTimezone = post.get('settings.timezone');

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
        return moment.tz(post.get('publishedAtUTC'), blogTimezone);
    }
}

function setPublishedAtBlogStrings(post, momentDate) {
    if (momentDate) {
        let blogTimezone = post.get('settings.timezone');
        let publishedAtBlog = moment.tz(momentDate, blogTimezone);

        post.set('publishedAtBlogDate', publishedAtBlog.format('YYYY-MM-DD'));
        post.set('publishedAtBlogTime', publishedAtBlog.format('HH:mm'));
    } else {
        post.set('publishedAtBlogDate', '');
        post.set('publishedAtBlogTime', '');
    }
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
        return this.get('feature').get('audienceFeedback') && this.get('sentiment') !== undefined;
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return this.get('hasBeenEmailed')
            && !this.get('session.user').get('isContributor')
            && this.get('settings').get('membersSignupAccess') !== 'none'
            && this.get('email').get('trackOpens')
            && this.get('settings').get('emailTrackOpens');
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return this.get('hasBeenEmailed')
            && !this.get('session.user').get('isContributor')
            && this.get('settings').get('membersSignupAccess') !== 'none'
            && (this.get('isSent') || this.get('isPublished'))
            && this.get('email').get('trackClicks')
            && this.get('settings').get('emailTrackClicks');
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return (this.get('isPage') || !this.get('emailOnly'))
                && this.get('isPublished')
                && this.get('settings').get('membersTrackSources')
                && !this.get('membersUtils').get('isMembersInviteOnly')
                && !this.get('session.user').get('isContributor');
    }),

    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    hasAnalyticsPage: computed('isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics', function () {
        return this.get('isPost')
            && this.get('session.user').get('isAdmin')
            && (
                this.get('showEmailOpenAnalytics')
                || this.get('showEmailClickAnalytics')
                || this.get('showAttributionAnalytics')
            );
    }),

    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        let blogUrl = this.get('config').get('blogUrl');
        let uuid = this.get('uuid');
        // routeKeywords.preview: 'p'
        let previewKeyword = 'p';
        // New posts don't have a preview
        if (!uuid) {
            return '';
        }
        return this.get('ghostPaths').get('url').join(blogUrl, previewKeyword, uuid);
    }),

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    isPublic: computed('visibility', function () {
        return this.get('visibility') === 'public';
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        return getVisibilitySegment(this);
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        return getFullRecipientFilter(this);
    }),

    // check every second to see if we're past the scheduled time
    // will only re-compute if this property is being observed elsewhere
    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        if (this.get('isScheduled')) {
            let now = moment.utc();
            let publishedAtUTC = this.get('publishedAtUTC') || now;
            let pastScheduledTime = publishedAtUTC.diff(now, 'hours', true) < 0;

            // force a recompute
            this.get('clock.second');

            return pastScheduledTime;
        } else {
            return false;
        }
    }),

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings.timezone', {
        get() {
            return getPublishedAtBlogTZ(this);
        },
        set(key, value) {
            let momentValue = value ? moment(value) : null;
            setPublishedAtBlogStrings(this, momentValue);
            return getPublishedAtBlogTZ(this);
        }
    }),

    clickRate: computed('email.emailCount', 'count.clicks', function () {
        if (!this.get('email') || !this.get('email.emailCount')) {
            return 0;
        }
        if (!this.get('count') || !this.get('count.clicks')) {
            return 0;
        }

        return Math.round(this.get('count.clicks') / this.get('email.emailCount') * 100);
    }),

    updateTags() {
        let tags = this.get('tags');
        let oldTags = tags.filterBy('id', null);

        tags.removeObjects(oldTags);
        oldTags.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return this.get('authors').includes(user);
    },

    compare(postA, postB) {
        let updated1 = postA.get('updatedAtUTC');
        let updated2 = postB.get('updatedAtUTC');
        let idResult,
            publishedAtResult,
            statusResult,
            updatedAtResult;

        // when `updatedAt` is undefined, the model is still
        // being written to with the results from the server
        if (postA.get('isNew') || !updated1) {
            return -1;
        }

        if (postB.get('isNew') || !updated2) {
            return 1;
        }

        // TODO: revisit the ID sorting because we no longer have auto-incrementing IDs
        idResult = compare(postA.get('id'), postB.get('id'));
        statusResult = compareStatus(postA, postB);
        updatedAtResult = compare(updated1.valueOf(), updated2.valueOf());
        publishedAtResult = comparePublishedAt(postA, postB);

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

    beforeSave() {
        let publishedAtBlogTZ = this.get('publishedAtBlogTZ');
        let publishedAtUTC = publishedAtBlogTZ ? publishedAtBlogTZ.utc() : null;
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