```javascript
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

const DISPLAY_OPTIONS = [{
    name: 'Free signups',
    value: 'signups'
}, {
    name: 'Paid conversions',
    value: 'paid'
}];

/**
 * Builds a filter string for API queries
 * @param {string} postId - The post ID
 * @param {string} filterContent - The filter content
 * @returns {string} Encoded filter string
 */
function buildFilterUrl(postId, filterContent) {
    return `?filter=${encodeURIComponent(filterContent)}`;
}

/**
 * Builds a feedback link filter
 * @param {string} postId - The post ID
 * @param {number} score - The feedback score
 * @returns {object} Filter object
 */
function buildFeedbackLink(postId, score) {
    const filterParam = `(feedback.post_id:'${postId}'+feedback.score:${score})`;
    return {filterParam};
}

/**
 * Determines if data should be loaded based on feature flag
 * @param {boolean} shouldShow - Whether feature is enabled
 * @param {Function} fetchFn - Function to fetch data
 * @returns {void}
 */
function loadDataConditionally(shouldShow, fetchFn) {
    if (shouldShow) {
        fetchFn();
    }
}

/**
 * Determines allowed display options based on data availability
 * @param {boolean} hasPaidData - Whether paid conversion data exists
 * @param {boolean} hasFreeData - Whether free signup data exists
 * @param {Array} allOptions - All available display options
 * @returns {Array} Filtered display options
 */
function getAllowedDisplayOptions(hasPaidData, hasFreeData, allOptions) {
    if (!hasPaidData) {
        return allOptions.filter(d => d.value === 'signups');
    }
    if (!hasFreeData) {
        return allOptions.filter(d => d.value === 'paid');
    }
    return allOptions;
}

/**
 * Determines if dropdown should be disabled
 * @param {boolean} hasPaidData - Whether paid conversion data exists
 * @param {boolean} hasFreeData - Whether free signup data exists
 * @returns {boolean} Whether dropdown is disabled
 */
function isDropdownDisabledPredicate(hasPaidData, hasFreeData) {
    return !hasPaidData || !hasFreeData;
}

/**
 * Gets selected display option based on data availability
 * @param {boolean} hasPaidData - Whether paid conversion data exists
 * @param {boolean} hasFreeData - Whether free signup data exists
 * @param {string} sortColumn - Current sort column
 * @param {Array} allOptions - All available display options
 * @returns {object} Selected display option
 */
function getSelectedDisplayOption(hasPaidData, hasFreeData, sortColumn, allOptions) {
    if (!hasPaidData) {
        return allOptions.find(d => d.value === 'signups');
    }
    if (!hasFreeData) {
        return allOptions.find(d => d.value === 'paid');
    }
    return allOptions.find(d => d.value === sortColumn) ?? allOptions[0];
}

/**
 * Gets selected sort column based on data availability
 * @param {boolean} hasPaidData - Whether paid conversion data exists
 * @param {boolean} hasFreeData - Whether free signup data exists
 * @param {string} sortColumn - Current sort column
 * @returns {string} Selected sort column
 */
function getSelectedSortColumn(hasPaidData, hasFreeData, sortColumn) {
    if (!hasPaidData) {
        return 'signups';
    }
    if (!hasFreeData) {
        return 'paid';
    }
    return sortColumn;
}

/**
 * Checks if animation should be skipped for an element
 * @param {boolean} shouldAnimate - Whether animation is enabled
 * @param {HTMLElement} element - The element to check
 * @param {object} counts - Current count values
 * @param {object} previousCounts - Previous count values
 * @returns {boolean} Whether to skip animation
 */
function shouldSkipAnimation(shouldAnimate, element, counts, previousCounts) {
    if (!shouldAnimate) {
        return true;
    }

    const animationChecks = [
        {
            className: 'sent',
            current: counts.sent,
            previous: previousCounts.sent
        },
        {
            className: 'opened',
            current: counts.opened,
            previous: previousCounts.opened
        },
        {
            className: 'clicked',
            current: counts.clicked,
            previous: previousCounts.clicked
        },
        {
            className: 'feedback',
            current: counts.feedback,
            previous: previousCounts.feedback
        },
        {
            className: 'conversions',
            current: counts.conversions,
            previous: previousCounts.conversions
        }
    ];

    return animationChecks.some(check =>
        element.classList.contains(check.className) && check.current === check.previous
    );
}

/**
 * Builds anime selector from element classes
 * @param {HTMLElement} element - The element
 * @returns {string} Anime selector
 */
function buildAnimeSelector(element) {
    return Array.from(element.classList).map(className => `.${className}`).join('');
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
        return getAllowedDisplayOptions(
            this.hasPaidConversionData,
            this.hasFreeSignups,
            this.displayOptions
        );
    }

    get isDropdownDisabled() {
        return isDropdownDisabledPredicate(
            this.hasPaidConversionData,
            this.hasFreeSignups
        );
    }

    get selectedDisplayOption() {
        return getSelectedDisplayOption(
            this.hasPaidConversionData,
            this.hasFreeSignups,
            this.sortColumn,
            this.displayOptions
        );
    }

    get selectedSortColumn() {
        return getSelectedSortColumn(
            this.hasPaidConversionData,
            this.hasFreeSignups,
            this.sortColumn
        );
    }

    get hasPaidConversionData() {
        return this.sources.some(sourceData => sourceData.paidConversions > 0);
    }

    get hasFreeSignups() {
        return this.sources.some(sourceData => sourceData.signups > 0);
    }

    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    get feedbackChartData() {
        const values = [this.post.count.positive_feedback, this.post.count.negative_feedback];
        const labels = ['More like this', 'Less like this'];
        const links = [
            buildFeedbackLink(this.post.id, 1),
            buildFeedbackLink(this.post.id, 0)
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
        loadDataConditionally(this.showSources, () => this.fetchReferrersStats());
        if (!this.showSources) {
            this.sources = [];
        }

        loadDataConditionally(this.showLinks, () => this.fetchLinks());
        if (!this.showLinks) {
            this.links = [];
        }

        loadDataConditionally(this.showMentions, () => this.fetchMentions());
        if (!this.showMentions) {
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
        let cleanedLinks = linksData.map((link) => {
            return {
                ...link,
                link: {
                    ...link.link,
                    originalTo: link.link.to,
                    to: this.utils.cleanTrackedUrl(link.link.to, false),
                    title: this.utils.cleanTrackedUrl(link.link.to, true)
                }
            };
        });

        const linksByTitle = cleanedLinks.reduce((acc, link) => {
            if (!acc[link.link.title]) {
                acc[link.link.title] = link;
            } else {
                if (!acc[link.link.title].count) {
                    acc[link.link.title].count = {clicks: 0};
                }
                if (!acc[link.link.title].count.clicks) {
                    acc[link.link.title].count.clicks = 0;
                }

                acc[link.link.title].count.clicks += (link.count?.clicks ?? 0);
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
            // Do not throw cancellation errors
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
            // Do not throw cancellation errors
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
        this.links = this.links?.map((link) => {
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

        const filterContent = `post_id:'${this.post.id}'+to:'${currentLink}'`;
        let bulkUpdateUrl = this.ghostPaths.url.api('links/bulk') + buildFilterUrl(this.post.id, filterContent);
        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        // Refresh links data
        const linksFilter = `post_id:'${this.post.id}'`;
        let statsUrl = this.ghostPaths.url.api('links/') + buildFilterUrl(this.post.id, linksFilter);
        let result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
        this.showSuccess = this.updateLinkId;
        setTimeout(() => {
            this.showSuccess = null;
        }, 2000);
    }

    @task
    *_fetchReferrersStats() {
        let statsUrl = this.ghostPaths.url.api(`stats/referrers/posts/${this.post.id}`);
        let result = yield this.ajax.request(statsUrl);
        this.sources = result.stats.map((stat) => {
            return {
                source: stat.source ?? 'Direct',
                signups: stat.signups,
                paidConversions: stat.paid_conversions
            };
        });
    }

    @task
    *_fetchLinks() {
        const filter = `post_id:'${this.post.id}'`;
        let statsUrl = this.ghostPaths.url.api('links/') + buildFilterUrl(this.post.id, filter);
        let result = yield this.ajax.request(statsUrl);
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
        const filter = `resource_id:'${this.post.id}'+resource_type:post`;
        this.mentions = yield this.store.query('mention', {limit: 5, order: 'created_at desc', filter});
    }

    @task
    *fetchPostCountTask() {
        if (!this.post.emailOnly) {
            const result = yield this.store.query('post', {filter: 'status:published', limit: 1});
            let count = result.meta.pagination.total;

            this.postCount = count;
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

        const result = yield this.store.query('post', {filter: `id:${this.post.id}`, include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment', limit: 1});
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
        const counts = {
            sent: this.post.email.emailCount,
            opened: this.post.email.openedCount,
            clicked: this.post.count.clicks,
            feedback: this.totalFeedback,
            conversions: this.post.count.conversions
        };

        const previousCounts = {
            sent: this.previousSentCount,
            opened: this.previousOpenedCount,
            clicked: this.previousClickedCount,
            feedback: this.previousFeedbackCount,
            conversions: this.previousConversionsCount
        };

        if (shouldSkipAnimation(this.shouldAnimate, element, counts, previousCounts)) {
            return;
        }

        const selector = buildAnimeSelector(element);

        anime({
            targets: `${selector} .new-number span`,
            translateY: [10, 0],
            opacity: [0, 1],
            easing: 'easeOutElastic',
            elasticity: 650,
            duration: 1000,
            delay: (el, i) => 100 + 30 * i
        });

        anime({
            targets: `${selector} .old-number span`,
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
        return this.links !== null && this.souces !== null && this.mentions !== null;
    }
}
```