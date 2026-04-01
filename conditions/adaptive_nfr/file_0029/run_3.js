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
     * Determines if dropdown should be disabled based on data availability
     * @returns {boolean}
     */
    _isDropdownDisabled() {
        return !this._hasPaidConversionData() || !this._hasFreeSignups();
    }

    /**
     * Gets filtered display options based on available data
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
     * Gets the selected display option based on available data
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
        return this._isDropdownDisabled();
    }

    get selectedDisplayOption() {
        return this._getSelectedDisplayOption();
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
     * Builds filter parameter string for feedback queries
     * @param {string} postId - The post ID
     * @param {number} score - The feedback score (0 or 1)
     * @returns {string}
     */
    _buildFeedbackFilterParam(postId, score) {
        return `(feedback.post_id:'${postId}'+feedback.score:${score})`;
    }

    get feedbackChartData() {
        const values = [this.post.count.positive_feedback, this.post.count.negative_feedback];
        const labels = ['More like this', 'Less like this'];
        const links = [
            {filterParam: this._buildFeedbackFilterParam(this.post.id, 1)},
            {filterParam: this._buildFeedbackFilterParam(this.post.id, 0)}
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
    _loadDataByFeature() {
        const dataLoaders = {
            showSources: () => this.fetchReferrersStats(),
            showLinks: () => this.fetchLinks(),
            showMentions: () => this.fetchMentions()
        };

        const dataResets = {
            showSources: () => { this.sources = []; },
            showLinks: () => { this.links = []; },
            showMentions: () => { this.mentions = []; }
        };

        Object.entries(dataLoaders).forEach(([feature, loader]) => {
            if (this[feature]) {
                loader();
            } else {
                dataResets[feature]();
            }
        });
    }

    @action
    loadData() {
        this._loadDataByFeature();
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
     * Builds the bulk update URL for link modifications
     * @param {string} postId - The post ID
     * @param {URL} currentLink - The current link URL
     * @returns {string}
     */
    _buildBulkUpdateUrl(postId, currentLink) {
        const filter = `post_id:'${postId}'+to:'${currentLink}'`;
        return this.ghostPaths.url.api('links/bulk') + `?filter=${encodeURIComponent(filter)}`;
    }

    /**
     * Builds the stats URL for fetching links
     * @param {string} postId - The post ID
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
        const filter = `post_id:'${this.post.id}'`;
        let statsUrl = this.ghostPaths.url.api('links/') + `?filter=${encodeURIComponent(filter)}`;
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
     * @param {Element} element - The DOM element
     * @returns {boolean}
     */
    _shouldSkipAnimation(element) {
        if (!this.shouldAnimate) {
            return true;
        }

        const animationChecks = [
            {
                className: 'sent',
                condition: () => this.post.email.emailCount === this.previousSentCount
            },
            {
                className: 'opened',
                condition: () => this.post.email.openedCount === this.previousOpenedCount
            },
            {
                className: 'clicked',
                condition: () => this.post.count.clicks === this.previousClickedCount