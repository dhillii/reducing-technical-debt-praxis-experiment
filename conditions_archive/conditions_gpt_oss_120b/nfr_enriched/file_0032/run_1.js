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
const {Comparable} = Ember;

/* Helper: compare post status with scheduled priority */
function statusCompare(postA, postB) {
    const statusA = postA.get('status');
    const statusB = postB.get('status');

    if (!statusA && !statusB) return 0;
    if (!statusA) return -1;
    if (!statusB) return 1;

    if (statusA === 'scheduled' && (statusB === 'draft' || statusB === 'published')) return -1;
    if (statusB === 'scheduled' && (statusA === 'draft' || statusA === 'published')) return 1;

    return compare(statusA.valueOf(), statusB.valueOf());
}

/* Helper: compare published dates */
function publishedAtCompare(postA, postB) {
    const pubA = postA.get('publishedAtUTC');
    const pubB = postB.get('publishedAtUTC');

    if (!pubA && !pubB) return 0;
    if (!pubA) return -1;
    if (!pubB) return 1;

    return compare(pubA.valueOf(), pubB.valueOf());
}

/* Helper: compute visibility segment */
function computeVisibilitySegment(context) {
    if (context.isPublic) {
        return context.settings.defaultContentVisibility === 'paid'
            ? 'status:-free'
            : 'status:free,status:-free';
    }

    switch (context.visibility) {
        case 'members':
            return 'status:free,status:-free';
        case 'paid':
            return 'status:-free';
        case 'tiers':
            if (context.tiers) {
                return context.tiers.map(t => `tier:${t.slug}`).join(',');
            }
            // fallthrough
        default:
            return context.visibility;
    }
}

/* Helper: compute click rate */
function computeClickRate(context) {
    const emailCount = context.email?.emailCount;
    const clicks = context.count?.clicks;

    if (!emailCount || !clicks) {
        return 0;
    }
    return Math.round((clicks / emailCount) * 100);
}

/* Helper: determine if post is public */
function isPublicHelper(visibility) {
    return visibility === 'public';
}

/* Helper: past scheduled time */
function computePastScheduledTime(context) {
    if (!context.isScheduled) {
        return false;
    }

    const now = moment.utc();
    const scheduled = context.publishedAtUTC || now;
    const past = scheduled.diff(now, 'hours', true) < 0;

    // force recompute
    context.get('clock.second');

    return past;
}

/* Helper: show attribution analytics */
function computeShowAttributionAnalytics(context) {
    return (context.isPage || !context.emailOnly) &&
        context.isPublished &&
        context.settings.membersTrackSources &&
        !context.membersUtils.isMembersInviteOnly &&
        !context.session.user.isContributor;
}

/* Helper: show email open analytics */
function computeShowEmailOpenAnalytics(context) {
    return context.hasBeenEmailed &&
        !context.session.user.isContributor &&
        context.settings.membersSignupAccess !== 'none' &&
        context.email?.trackOpens &&
        context.settings.emailTrackOpens;
}

/* Helper: show email click analytics */
function computeShowEmailClickAnalytics(context) {
    return context.hasBeenEmailed &&
        !context.session.user.isContributor &&
        context.settings.membersSignupAccess !== 'none' &&
        (context.isSent || context.isPublished) &&
        context.email?.trackClicks &&
        context.settings.emailTrackClicks;
}

/* Helper: has analytics page */
function computeHasAnalyticsPage(context) {
    return context.isPost &&
        context.session.user.isAdmin &&
        (context.showEmailOpenAnalytics ||
            context.showEmailClickAnalytics ||
            context.showAttributionAnalytics);
}

/* Helper: preview URL */
function computePreviewUrl(context) {
    if (!context.uuid) {
        return '';
    }
    const previewKeyword = 'p';
    return context.get('ghostPaths.url').join(context.config.blogUrl, previewKeyword, context.uuid);
}

/* Helper: full recipient filter */
function computeFullRecipientFilter(context) {
    if (!context.newsletter) {
        return context.emailSegment;
    }
    return `${context.newsletter.recipientFilter}+(${context.emailSegment})`;
}

/* Helper: get published at blog timezone */
function getPublishedAtBlogTZ(context) {
    const {publishedAtUTC, publishedAtBlogDate, publishedAtBlogTime, settings: {timezone}} = context;

    if (!publishedAtUTC && isBlank(publishedAtBlogDate) && isBlank(publishedAtBlogTime)) {
        return null;
    }

    if (publishedAtBlogDate && publishedAtBlogTime) {
        const blogMoment = moment.tz(`${publishedAtBlogDate} ${publishedAtBlogTime}`, timezone);

        if (publishedAtUTC && blogMoment.diff(publishedAtUTC.clone().startOf('minutes')) === 0) {
            return publishedAtUTC;
        }
        return blogMoment;
    }

    return moment.tz(publishedAtUTC, timezone);
}

/* Helper: set published at blog strings */
function setPublishedAtBlogStrings(context, momentDate) {
    if (momentDate) {
        const blogTimezone = context.settings.timezone;
        const blogMoment = moment.tz(momentDate, blogTimezone);
        context.set('publishedAtBlogDate', blogMoment.format('YYYY-MM-DD'));
        context.set('publishedAtBlogTime', blogMoment.format('HH:mm'));
    } else {
        context.set('publishedAtBlogDate', '');
        context.set('publishedAtBlogTime', '');
    }
}

/* Helper: compare two posts for sorting */
function comparePosts(postA, postB) {
    const updatedA = postA.get('updatedAtUTC');
    const updatedB = postB.get('updatedAtUTC');

    if (postA.get('isNew') || !updatedA) return -1;
    if (postB.get('isNew') || !updatedB) return 1;

    const statusResult = statusCompare(postA, postB);
    if (statusResult !== 0) return statusResult;

    const publishedResult = publishedAtCompare(postA, postB);
    if (publishedResult !== 0) return -publishedResult; // DESC

    const updatedResult = compare(updatedA.valueOf(), updatedB.valueOf());
    if (updatedResult !== 0) return -updatedResult; // DESC

    // ID DESC
    return -compare(postA.get('id'), postB.get('id'));
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
    lexical: attr('string', {defaultValue: () => BLANK_LEXICAL}),
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
        return this.isPost &&
            (this.isSent || this.isPublished) &&
            this.email &&
            this.email.status !== 'failed';
    }),

    didEmailFail: computed('isPost', 'isSent', 'isPublished', 'email.status', function () {
        return this.isPost &&
            (this.isSent || this.isPublished) &&
            this.email &&
            this.email.status === 'failed';
    }),

    showAudienceFeedback: computed('sentiment', function () {
        return this.feature.get('audienceFeedback') && this.sentiment !== undefined;
    }),

    showEmailOpenAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', function () {
        return computeShowEmailOpenAnalytics(this);
    }),

    showEmailClickAnalytics: computed('hasBeenEmailed', 'isSent', 'isPublished', 'email', function () {
        return computeShowEmailClickAnalytics(this);
    }),

    showAttributionAnalytics: computed('isPage', 'emailOnly', 'isPublished', 'membersUtils.isMembersInviteOnly', 'settings.membersTrackSources', function () {
        return computeShowAttributionAnalytics(this);
    }),

    showPaidAttributionAnalytics: computed.and('showAttributionAnalytics', 'membersUtils.paidMembersEnabled'),

    hasAnalyticsPage: computed('isPost', 'showEmailOpenAnalytics', 'showEmailClickAnalytics', 'showAttributionAnalytics', function () {
        return computeHasAnalyticsPage(this);
    }),

    previewUrl: computed('uuid', 'ghostPaths.url', 'config.blogUrl', function () {
        return computePreviewUrl(this);
    }),

    isFeedbackEnabledForEmail: computed.reads('email.feedbackEnabled'),

    isPublic: computed('visibility', function () {
        return isPublicHelper(this.visibility);
    }),

    visibilitySegment: computed('visibility', 'isPublic', 'tiers', function () {
        return computeVisibilitySegment(this);
    }),

    fullRecipientFilter: computed('newsletter.recipientFilter', 'emailSegment', function () {
        return computeFullRecipientFilter(this);
    }),

    pastScheduledTime: computed('isScheduled', 'publishedAtUTC', 'clock.second', function () {
        return computePastScheduledTime(this);
    }),

    publishedAtBlogTZ: computed('publishedAtBlogDate', 'publishedAtBlogTime', 'settings.timezone', {
        get() {
            return getPublishedAtBlogTZ(this);
        },
        set(key, value) {
            const momentValue = value ? moment(value) : null;
            setPublishedAtBlogStrings(this, momentValue);
            return getPublishedAtBlogTZ(this);
        }
    }),

    clickRate: computed('email.emailCount', 'count.clicks', function () {
        return computeClickRate(this);
    }),

    _getPublishedAtBlogTZ() {
        return getPublishedAtBlogTZ(this);
    },

    // eslint-disable-next-line ghost/ember/no-observers
    _setPublishedAtBlogTZ: on('init', observer('publishedAtUTC', 'settings.timezone', function () {
        const publishedAtUTC = this.publishedAtUTC;
        setPublishedAtBlogStrings(this, publishedAtUTC);
    })),

    updateTags() {
        const tags = this.tags;
        const oldTags = tags.filterBy('id', null);
        tags.removeObjects(oldTags);
        oldTags.invoke('deleteRecord');
    },

    isAuthoredByUser(user) {
        return this.authors.includes(user);
    },

    compare(postA, postB) {
        return comparePosts(postA, postB);
    },

    beforeSave() {
        const publishedAtBlogTZ = this.publishedAtBlogTZ;
        const publishedAtUTC = publishedAtBlogTZ ? publishedAtBlogTZ.utc() : null;
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