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

    /**
     * Determines if display options should be filtered
     * @returns {boolean}
     */
    _shouldFilterDisplayOptions() {
        return !this._hasPaidConversionData() || !this._hasFreeSignups();
    }

    /**
     * Gets the filtered display options based on available data
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

    /**
     * Gets the effective sort column based on available data
     * @returns {string}
     */
    _getEffectiveSortColumn() {
        if (!this._hasPaidConversionData()) {
            return 'signups';
        }

        if (!this._hasFreeSignups()) {
            return 'paid';
        }

        return this.sortColumn;
    }

    get allowedDisplayOptions() {
        return this._getFilteredDisplayOptions();
    }

    get isDropdownDisabled() {
        return this._shouldFilterDisplayOptions();
    }

    get selectedDisplayOption() {
        const effectiveColumn = this._getEffectiveSortColumn();
        return this.displayOptions.find(d => d.value === effectiveColumn) ?? this.displayOptions[0];
    }

    get selectedSortColumn() {
        return this._getEffectiveSortColumn();
    }

    get hasPaidConversionData() {
        return this._hasPaidConversionData();
    }

    get hasFreeSignups() {
        return this._hasFreeSignups();
    }

    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    /**
     * Builds filter parameter for feedback links
     * @param {string} score - The feedback score (0 or 1)
     * @returns {string}
     */
    _buildFeedbackFilterParam(score) {
        return `(feedback.post_id:'${this.post.id}'+feedback.score:${score})`;
    }

    get feedbackChartData() {
        const values = [this.post.count.positive_feedback, this.post.count.negative_feedback];
        const labels = ['More like this', 'Less like this'];
        const links = [
            {filterParam: this._buildFeedbackFilterParam(1)},
            {filterParam: this._buildFeedbackFilterParam(0)}
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

    /**
     * Builds the filter string for links query
     * @returns {string}
     */
    _buildLinksFilter() {
        return `post_id:'${this.post.id}'`;
    }

    /**
     * Builds the bulk update URL for links
     * @param {string} filter - The filter parameter
     * @returns {string}
     */
    _buildBulkUpdateUrl(filter) {
        return this.ghostPaths.url.api('links/bulk') + `?filter=${encodeURIComponent(filter)}`;
    }

    /**
     * Builds the stats URL for links
     * @param {string} filter - The filter parameter
     * @returns {string}
     */
    _buildLinksStatsUrl(filter) {
        return this.ghostPaths.url.api('links/') + `?filter=${encodeURIComponent(filter)}`;
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

        const filter = `post_id:'${this.post.id}'+to:'${currentLink}'`;
        let bulkUpdateUrl = this._buildBulkUpdateUrl(filter);
        yield this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });

        // Refresh links data
        const linksFilter = this._buildLinksFilter();
        let statsUrl = this._buildLinksStatsUrl(linksFilter);
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
        const filter = this._buildLinksFilter();
        let statsUrl = this._buildLinksStatsUrl(filter);
        let result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    async fetchMentions() {
        if (this._fetchMentions.isRunning) {
            return this._fetchMentions.last;
        }
        return this._fetchMentions.perform();
    }

    /**
     * Builds the filter string for mentions query
     * @returns {string}
     */
    _buildMentionsFilter() {
        return `resource_id:'${this.post.id}'+resource_type:post`;
    }

    @task
    *_fetchMentions() {
        const filter = this._buildMentionsFilter();
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
     * @param {HTMLElement} element - The element to check
     * @returns {boolean}
     */
    _shouldSkipAnimation(element) {
        if (!this.shouldAnimate) {
            return true;
        }

        const checks = [
            {class: 'sent', current: this.post.email.emailCount, previous: this.previousSentCount},
            {class: 'opened', current: this.post.email.openedCount, previous: this.previousOpenedCount},
            {class: 'clicked', current: this.post.count.clicks, previous: this.previousClickedCount},
            {class: 'feedback', current: this.totalFeedback, previous: this.previousFeedbackCount},
            {class: 'conversions', current: this.post.count.conversions, previous: this.previousConversionsCount}
        ];

        return checks.some(check => 
            element.classList.contains(check.class) && check.current === check.previous
        );
    }

    /**
     * Builds the selector string from element classes
     * @param {HTMLElement} element - The element
     * @returns {string}
     */
    _buildClassSelector(element) {
        return Array.from(element.classList).map(className => `.${className}`).join('');
    }

    /**
     * Animates the new number display
     * @param {string} selector - The CSS selector
     */
    _animateNewNumber(selector) {
        anime({
            targets: `${selector} .new-number span`,
            translateY: [10, 0],
            opacity: [0, 1],
            easing: 'easeOutElastic',
            elasticity: 650,
            duration: 1000,
            delay: (el, i) => 100 + 30 * i
        });
    }

    /**
     * Animates the old number display
     * @param {string} selector - The CSS selector
     */
    _animateOldNumber(selector) {
        anime({
            targets: `${selector} .old-number span`,
            translateY: [0, -10],
            opacity: [1, 0],
            easing: 'easeOutExpo',
            duration: 400,
            delay: (el, i) => 100 + 10 * i
        });
    }

    @action
    applyClasses(element) {
        if (this._shouldSkipAnimation(element)) {
            return;
        }

        const selector = this._buildClassSelector(element);
        this._animateNewNumber(selector);
        this._animateOldNumber(selector);
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