import Component from '@glimmer/component';
import DeletePostModal from '../modals/delete-post';
import PostSuccessModal from '../modal-post-success';
import anime from 'animejs/lib/anime.es.js';
import {action} from '@ember/object';
import {didCancel, task} from 'ember-concurrency';
import {inject} from 'ghost-admin/decorators/inject';
import {inject as service} from '@ember/service';
import {tracked} from '@glimmer/tracking';

/**
 * @typedef {import('../../services/dashboard-stats').SourceAttributionCount} SourceAttributionCount
*/

const DISPLAY_OPTIONS = [
    {name: 'Free signups', value: 'signups'},
    {name: 'Paid conversions', value: 'paid'}
];

/**
 * Build a CSS selector string for the given element's class list and a suffix.
 *
 * @param {Element} element
 * @param {string} suffix
 * @returns {string}
 */
function buildSelector(element, suffix) {
    const classSelector = Array.from(element.classList)
        .map(className => '.' + className)
        .join('');
    return classSelector + ' ' + suffix;
}

/**
 * Determine whether the animation should be applied to the element.
 *
 * @param {Analytics} ctx
 * @param {Element} element
 * @returns {boolean}
 */
function shouldAnimateElement(ctx, element) {
    if (!ctx.shouldAnimate) {
        return false;
    }

    const classList = element.classList;
    if (classList.contains('sent') && ctx.post.email.emailCount === ctx.previousSentCount) {
        return false;
    }
    if (classList.contains('opened') && ctx.post.email.openedCount === ctx.previousOpenedCount) {
        return false;
    }
    if (classList.contains('clicked') && ctx.post.count.clicks === ctx.previousClickedCount) {
        return false;
    }
    if (classList.contains('feedback') && ctx.totalFeedback === ctx.previousFeedbackCount) {
        return false;
    }
    if (classList.contains('conversions') && ctx.post.count.conversions === ctx.previousConversionsCount) {
        return false;
    }
    return true;
}

/**
 * Resolve the appropriate display option based on data availability.
 *
 * @param {Analytics} ctx
 * @returns {Array<{name:string,value:string}>}
 */
function resolveAllowedDisplayOptions(ctx) {
    if (!ctx.hasPaidConversionData) {
        return ctx.displayOptions.filter(d => d.value === 'signups');
    }
    if (!ctx.hasFreeSignups) {
        return ctx.displayOptions.filter(d => d.value === 'paid');
    }
    return ctx.displayOptions;
}

/**
 * Resolve the selected display option.
 *
 * @param {Analytics} ctx
 * @returns {{name:string,value:string}|undefined}
 */
function resolveSelectedDisplayOption(ctx) {
    if (!ctx.hasPaidConversionData) {
        return ctx.displayOptions.find(d => d.value === 'signups');
    }
    if (!ctx.hasFreeSignups) {
        return ctx.displayOptions.find(d => d.value === 'paid');
    }
    return ctx.displayOptions.find(d => d.value === ctx.sortColumn) ?? ctx.displayOptions[0];
}

/**
 * Resolve the selected sort column.
 *
 * @param {Analytics} ctx
 * @returns {string}
 */
function resolveSelectedSortColumn(ctx) {
    if (!ctx.hasPaidConversionData) {
        return 'signups';
    }
    if (!ctx.hasFreeSignups) {
        return 'paid';
    }
    return ctx.sortColumn;
}

/**
 * Resolve the disabled state of the dropdown.
 *
 * @param {Analytics} ctx
 * @returns {boolean}
 */
function resolveDropdownDisabled(ctx) {
    return !(ctx.hasPaidConversionData && ctx.hasFreeSignups);
}

export default class Analytics extends Component {
    @service ajax;
    @service ghostPaths;
    @service settings;
    @service membersUtils;
    @service utils;
    @service feature;
    @service store;
    @service router;
    @service modals;
    @service notifications;
    @service session;

    @inject config;

    @tracked sources = null;
    @tracked links = null;
    @tracked mentions = null;
    @tracked sortColumn = 'signups';
    @tracked showSuccess;
    @tracked updateLinkId;
    @tracked _post = null;
    @tracked postCount = null;
    @tracked showPostCount = false;
    @tracked shouldAnimate = false;
    @tracked previousSentCount = this.post.email?.emailCount;
    @tracked previousOpenedCount = this.post.email?.openedCount;
    @tracked previousClickedCount = this.post.count.clicks;
    @tracked previousFeedbackCount = this.totalFeedback;
    @tracked previousConversionsCount = this.post.count.conversions;
    displayOptions = DISPLAY_OPTIONS;

    constructor() {
        super(...arguments);
        this.checkPublishFlowModal();
    }

    openPublishFlowModal() {
        this.modals.open(PostSuccessModal, {
            post: this.post,
            postCount: this.postCount,
            showPostCount: this.showPostCount
        });
    }

    async checkPublishFlowModal() {
        if (localStorage.getItem('ghost-last-published-post')) {
            await this.fetchPostCountTask.perform();
            this.showPostCount = true;
            this.openPublishFlowModal();
            localStorage.removeItem('ghost-last-published-post');
        }
    }

    get post() {
        return this._post ?? this.args.post;
    }

    set post(value) {
        this._post = value;
    }

    get allowedDisplayOptions() {
        return resolveAllowedDisplayOptions(this);
    }

    get isDropdownDisabled() {
        return resolveDropdownDisabled(this);
    }

    get selectedDisplayOption() {
        return resolveSelectedDisplayOption(this);
    }

    get selectedSortColumn() {
        return resolveSelectedSortColumn(this);
    }

    get hasPaidConversionData() {
        return this.sources?.some(sourceData => sourceData.paidConversions > 0) ?? false;
    }

    get hasFreeSignups() {
        return this.sources?.some(sourceData => sourceData.signups > 0) ?? false;
    }

    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    get feedbackChartData() {
        const values = [this.post.count.positive_feedback, this.post.count.negative_feedback];
        const labels = ['More like this', 'Less like this'];
        const links = [
            {filterParam: '(feedback.post_id:\'' + this.post.id + '\'+feedback.score:1)'},
            {filterParam: '(feedback.post_id:\'' + this.post.id + '\'+feedback.score:0)'}
        ];
        const colors = ['#F080B2', '#8452f633'];
        return {values, labels, links, colors};
    }

    @action
    onDisplayChange(selected) {
        this.sortColumn = selected.value;
    }

    @action
    setSortColumn(column) {
        this.sortColumn = column;
    }

    @action
    updateLink(linkId, linkTo) {
        if (this._updateLinks.isRunning) {
            return this._updateLinks.last;
        }
        return this._updateLinks.perform(linkId, linkTo);
    }

    @action
    loadData() {
        if (this.showSources) {
            this.fetchReferrersStats();
        } else {
            this.sources = [];
        }

        if (this.showLinks) {
            this.fetchLinks();
        } else {
            this.links = [];
        }

        if (this.showMentions) {
            this.fetchMentions();
        } else {
            this.mentions = [];
        }
    }

    @action
    togglePublishFlowModal() {
        this.showPostCount = false;
        this.openPublishFlowModal();
    }

    @action
    confirmDeleteMember() {
        this.modals.open(DeletePostModal, {
            post: this.post
        });
    }

    updateLinkData(linksData) {
        const cleanedLinks = linksData.map(link => ({
            ...link,
            link: {
                ...link.link,
                originalTo: link.link.to,
                to: this.utils.cleanTrackedUrl(link.link.to, false),
                title: this.utils.cleanTrackedUrl(link.link.to, true)
            }
        }));

        const linksByTitle = cleanedLinks.reduce((acc, link) => {
            const title = link.link.title;
            if (!acc[title]) {
                acc[title] = link;
            } else {
                acc[title].count = acc[title].count || {clicks: 0};
                acc[title].count.clicks = (acc[title].count.clicks ?? 0) + (link.count?.clicks ?? 0);
            }
            return acc;
        }, {});

        this.links = Object.values(linksByTitle).sort((a, b) => {
            const aClicks = a.count?.clicks || 0;
            const bClicks = b.count?.clicks || 0;
            return bClicks - aClicks;
        });
    }

    async fetchReferrersStats() {
        try {
            if (this._fetchReferrersStats.isRunning) {
                return this._fetchReferrersStats.last;
            }
            return this._fetchReferrersStats.perform();
        } catch (e) {
            if (didCancel(e)) {
                return;
            }
            throw e;
        }
    }

    async fetchLinks() {
        try {
            if (this._fetchLinks.isRunning) {
                return this._fetchLinks.last;
            }
            return this._fetchLinks.perform();
        } catch (e) {
            if (didCancel(e)) {
                return;
            }
            throw e;
        }
    }

    @task
    *_updateLinks(linkId, newLink) {
        this.updateLinkId = linkId;
        let currentLink;
        this.links = this.links?.map(link => {
            if (link.link.link_id === linkId) {
                currentLink = new URL(link.link.originalTo);
                return {
                    ...link,
                    link: {
                        ...link.link,
                        to: this.utils.cleanTrackedUrl(newLink, false),
                        title: this.utils.cleanTrackedUrl(newLink, true)
                    }
                };
            }
            return link;
        });

        const filter = 'post_id:\'' + this.post.id + '\'+to:\'' + currentLink + '\'';
        const bulkUpdateUrl = this.ghostPaths.url.api('links/bulk') + '?filter=' + encodeURIComponent(filter);
        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        const linksFilter = 'post_id:\'' + this.post.id + '\'';
        const statsUrl = this.ghostPaths.url.api('links/') + '?filter=' + encodeURIComponent(linksFilter);
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
        this.showSuccess = this.updateLinkId;
        setTimeout(() => {
            this.showSuccess = null;
        }, 2000);
    }

    @task
    *_fetchReferrersStats() {
        const statsUrl = this.ghostPaths.url.api('stats/referrers/posts/' + this.post.id);
        const result = yield this.ajax.request(statsUrl);
        this.sources = result.stats.map(stat => ({
            source: stat.source ?? 'Direct',
            signups: stat.signups,
            paidConversions: stat.paid_conversions
        }));
    }

    @task
    *_fetchLinks() {
        const filter = 'post_id:\'' + this.post.id + '\'';
        const statsUrl = this.ghostPaths.url.api('links/') + '?filter=' + encodeURIComponent(filter);
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    async fetchMentions() {
        if (this._fetchMentions.isRunning) {
            return this._fetchMentions.last;
        }
        return this._fetchMentions.perform();
    }

    @task
    *_fetchMentions() {
        const filter = 'resource_id:\'' + this.post.id + '\'+resource_type:post';
        this.mentions = yield this.store.query('mention', {limit: 5, order: 'created_at desc', filter});
    }

    @task
    *fetchPostCountTask() {
        if (!this.post.emailOnly) {
            const result = yield this.store.query('post', {filter: 'status:published', limit: 1});
            this.postCount = result.meta.pagination.total;
        }
    }

    @task
    *fetchPostTask() {
        const currentSentCount = this.post.email?.emailCount;
        const currentOpenedCount = this.post.email?.openedCount;
        const currentClickedCount = this.post.count.clicks;
        const currentFeedbackCount = this.totalFeedback;
        const currentConversionsCount = this.post.count.conversions;

        this.shouldAnimate = true;

        const result = yield this.store.query('post', {
            filter: 'id:' + this.post.id,
            include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment',
            limit: 1
        });
        this.post = result.toArray()[0];

        this.previousSentCount = currentSentCount;
        this.previousOpenedCount = currentOpenedCount;
        this.previousClickedCount = currentClickedCount;
        this.previousFeedbackCount = currentFeedbackCount;
        this.previousConversionsCount = currentConversionsCount;

        yield this.fetchLinks();

        return true;
    }

    @action
    applyClasses(element) {
        if (!shouldAnimateElement(this, element)) {
            return;
        }

        anime({
            targets: buildSelector(element, '.new-number span'),
            translateY: [10, 0],
            opacity: [0, 1],
            easing: 'easeOutElastic',
            elasticity: 650,
            duration: 1000,
            delay: (el, i) => 100 + 30 * i
        });

        anime({
            targets: buildSelector(element, '.old-number span'),
            translateY: [0, -10],
            opacity: [1, 0],
            easing: 'easeOutExpo',
            duration: 400,
            delay: (el, i) => 100 + 10 * i
        });
    }

    get showLinks() {
        return this.post.showEmailClickAnalytics;
    }

    get showSources() {
        return this.post.showAttributionAnalytics;
    }

    get showMentions() {
        return this.feature.get('webmentions');
    }

    get isLoaded() {
        return this.links !== null && this.sources !== null && this.mentions !== null;
    }
}