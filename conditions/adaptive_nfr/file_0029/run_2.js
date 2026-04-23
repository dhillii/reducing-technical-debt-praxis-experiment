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

    /**
     * Determines if paid conversion data exists in sources
     * @returns {boolean}
     */
    _hasPaidConversionData() {
        return this.sources.some(sourceData => sourceData.paidConversions > 0);
    }

    /**
     * Determines if free signups exist in sources
     * @returns {boolean}
     */
    _hasFreeSignups() {
        return this.sources.some(sourceData => sourceData.signups > 0);
    }

    get hasPaidConversionData() {
        return this._hasPaidConversionData();
    }

    get hasFreeSignups() {
        return this._hasFreeSignups();
    }

    /**
     * Filters display options based on available data
     * @returns {Array}
     */
    _getFilteredDisplayOptions() {
        if (!this._hasPaidConversionData()) {
            return this.displayOptions.filter(d => d.value === 'signups');
        }

        if (!this._hasFreeSignups()) {
            return this.displayOptions.filter(d => d.value === 'paid');
        }

        return this.displayOptions;
    }

    get allowedDisplayOptions() {
        return this._getFilteredDisplayOptions();
    }

    /**
     * Determines if display dropdown should be disabled
     * @returns {boolean}
     */
    _isDropdownDisabled() {
        return !this._hasPaidConversionData() || !this._hasFreeSignups();
    }

    get isDropdownDisabled() {
        return this._isDropdownDisabled();
    }

    /**
     * Gets the currently selected display option
     * @returns {Object}
     */
    _getSelectedDisplayOption() {
        if (!this._hasPaidConversionData()) {
            return this.displayOptions.find(d => d.value === 'signups');
        }

        if (!this._hasFreeSignups()) {
            return this.displayOptions.find(d => d.value === 'paid');
        }

        return this.displayOptions.find(d => d.value === this.sortColumn) ?? this.displayOptions[0];
    }

    get selectedDisplayOption() {
        return this._getSelectedDisplayOption();
    }

    /**
     * Gets the currently selected sort column
     * @returns {string}
     */
    _getSelectedSortColumn() {
        if (!this._hasPaidConversionData()) {
            return 'signups';
        }

        if (!this._hasFreeSignups()) {
            return 'paid';
        }

        return this.sortColumn;
    }

    get selectedSortColumn() {
        return this._getSelectedSortColumn();
    }

    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    /**
     * Builds filter parameter for feedback query
     * @param {string} postId
     * @param {number} score
     * @returns {string}
     */
    _buildFeedbackFilter(postId, score) {
        return `(feedback.post_id:'${postId}'+feedback.score:${score})`;
    }

    get feedbackChartData() {
        const values = [this.post.count.positive_feedback, this.post.count.negative_feedback];
        const labels = ['More like this', 'Less like this'];
        const positiveFilter = this._buildFeedbackFilter(this.post.id, 1);
        const negativeFilter = this._buildFeedbackFilter(this.post.id, 0);
        const links = [
            {filterParam: positiveFilter},
            {filterParam: negativeFilter}
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

    /**
     * Loads data based on feature flags
     */
    _loadDataForFeature(shouldLoad, loadFn, emptyValue) {
        if (shouldLoad) {
            loadFn();
        } else {
            return emptyValue;
        }
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

    /**
     * Aggregates link data by title and sums click counts
     * @param {Array} cleanedLinks
     * @returns {Object}
     */
    _aggregateLinksByTitle(cleanedLinks) {
        return cleanedLinks.reduce((acc, link) => {
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
    }

    /**
     * Sorts links by click count in descending order
     * @param {Array} links
     * @returns {Array}
     */
    _sortLinksByClicks(links) {
        return links.sort((a, b) => {
            const aClicks = a.count?.clicks || 0;
            const bClicks = b.count?.clicks || 0;
            return bClicks - aClicks;
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

        const linksByTitle = this._aggregateLinksByTitle(cleanedLinks);
        this.links = this._sortLinksByClicks(Object.values(linksByTitle));
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

    /**
     * Builds the bulk update URL for links
     * @param {string} postId
     * @param {URL} currentLink
     * @returns {string}
     */
    _buildBulkUpdateUrl(postId, currentLink) {
        const filter = `post_id:'${postId}'+to:'${currentLink}'`;
        return this.ghostPaths.url.api('links/bulk') + `?filter=${encodeURIComponent(filter)}`;
    }

    /**
     * Builds the stats URL for fetching links
     * @param {string} postId
     * @returns {string}
     */
    _buildLinksStatsUrl(postId) {
        const linksFilter = `post_id:'${postId}'`;
        return this.ghostPaths.url.api('links/') + `?filter=${encodeURIComponent(linksFilter)}`;
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

        let bulkUpdateUrl = this._buildBulkUpdateUrl(this.post.id, currentLink);
        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        // Refresh links data
        let statsUrl = this._buildLinksStatsUrl(this.post.id);
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
        let statsUrl = this._buildLinksStatsUrl(this.post.id);
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

    /**
     * Checks if animation should be skipped for the given element
     * @param {Element} element
     * @returns {boolean}
     */
    _shouldSkipAnimation(element) {
        if (!this.shouldAnimate) {
            return true;
        }

        const checks = [
            {
                condition: element.classList.contains('sent'),
                value: this.post.email.emailCount,
                previous: this.previousSentCount
            },
            {
                condition: element.classList.contains('opened'),
                value: this.post.email.openedCount,
                previous: this.previousOpenedCount
            },
            {
                condition: element.classList.contains('clicked'),
                value: this.post.count.clicks,
                previous: this.previousClickedCount
            },
            {
                condition: element.classList.contains('feedback'),
                value: this.totalFeedback,
                previous: this.previousFeedbackCount
            },
            {
                condition: element.classList.contains('conversions'),
                value: this.post.count.conversions,
                previous: this.previousConversionsCount
            }
        ];

        return checks.some(check => check.condition && check.value === check.previous);
    }

    /**
     * Builds anime selector from element classes
     * @param {Element} element
     * @returns {string}
     */
    _buildAnimeSelector(element) {
        return Array.from(element.classList).map(className => `.${className}`).join('');
    }

    @action
    applyClasses(element) {
        if (this._shouldSkipAnimation(element)) {
            return;
        }

        const selector = this._buildAnimeSelector(element);

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