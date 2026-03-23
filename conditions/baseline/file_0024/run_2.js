Here's the refactored code with reduced complexity, better organization, and improved maintainability:

```javascript
import Component from '@glimmer/component';
import DeletePostModal from '../modals/delete-post';
import PostSuccessModal from '../modal-post-success';
import anime from 'animejs/lib/anime.es.js';
import { action } from '@ember/object';
import { didCancel, task } from 'ember-concurrency';
import { inject } from 'ghost-admin/decorators/inject';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

/**
 * @typedef {import('../../services/dashboard-stats').SourceAttributionCount} SourceAttributionCount
 */

const DISPLAY_OPTIONS = [
    { name: 'Free signups', value: 'signups' },
    { name: 'Paid conversions', value: 'paid' }
];

const ANIMATION_CONFIG = {
    newNumber: {
        translateY: [10, 0],
        opacity: [0, 1],
        easing: 'easeOutElastic',
        elasticity: 650,
        duration: 1000,
        delay: (el, i) => 100 + 30 * i
    },
    oldNumber: {
        translateY: [0, -10],
        opacity: [1, 0],
        easing: 'easeOutExpo',
        duration: 400,
        delay: (el, i) => 100 + 10 * i
    }
};

const ANIMATION_CLASS_MAP = {
    sent: () => ['email', 'emailCount'],
    opened: () => ['email', 'openedCount'],
    clicked: () => ['count', 'clicks'],
    feedback: null,
    conversions: () => ['count', 'conversions']
};

export default class Analytics extends Component {
    // Services
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

    // Tracked state
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

    // Previous counts for animation comparison
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

    // ==================
    // Post getter/setter
    // ==================

    get post() {
        return this._post ?? this.args.post;
    }

    set post(value) {
        this._post = value;
    }

    // ==================
    // Computed properties
    // ==================

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

    get hasPaidConversionData() {
        return this.sources.some(source => source.paidConversions > 0);
    }

    get hasFreeSignups() {
        return this.sources.some(source => source.signups > 0);
    }

    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    get isDropdownDisabled() {
        return !this.hasPaidConversionData || !this.hasFreeSignups;
    }

    get allowedDisplayOptions() {
        if (!this.hasPaidConversionData) {
            return this.displayOptions.filter(d => d.value === 'signups');
        }
        if (!this.hasFreeSignups) {
            return this.displayOptions.filter(d => d.value === 'paid');
        }
        return this.displayOptions;
    }

    get selectedDisplayOption() {
        if (!this.hasPaidConversionData) {
            return this.displayOptions.find(d => d.value === 'signups');
        }
        if (!this.hasFreeSignups) {
            return this.displayOptions.find(d => d.value === 'paid');
        }
        return this.displayOptions.find(d => d.value === this.sortColumn) ?? this.displayOptions[0];
    }

    get selectedSortColumn() {
        if (!this.hasPaidConversionData) {
            return 'signups';
        }
        if (!this.hasFreeSignups) {
            return 'paid';
        }
        return this.sortColumn;
    }

    get feedbackChartData() {
        const { id, count } = this.post;
        return {
            values: [count.positive_feedback, count.negative_feedback],
            labels: ['More like this', 'Less like this'],
            links: [
                { filterParam: `(feedback.post_id:'${id}'+feedback.score:1)` },
                { filterParam: `(feedback.post_id:'${id}'+feedback.score:0)` }
            ],
            colors: ['#F080B2', '#8452f633']
        };
    }

    // ==================
    // Actions
    // ==================

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
        this.sources = this.showSources ? undefined : [];
        this.links = this.showLinks ? undefined : [];
        this.mentions = this.showMentions ? undefined : [];

        if (this.showSources) {
            this.fetchReferrersStats();
        }
        if (this.showLinks) {
            this.fetchLinks();
        }
        if (this.showMentions) {
            this.fetchMentions();
        }
    }

    @action
    togglePublishFlowModal() {
        this.showPostCount = false;
        this.openPublishFlowModal();
    }

    @action
    confirmDeleteMember() {
        this.modals.open(DeletePostModal, { post: this.post });
    }

    @action
    applyClasses(element) {
        if (!this.shouldAnimate || !this._hasCountChanged(element)) {
            return;
        }
        this._animateElement(element);
    }

    // ==================
    // Tasks
    // ==================

    @task
    *_updateLinks(linkId, newLink) {
        this.updateLinkId = linkId;

        const currentLink = this._applyOptimisticLinkUpdate(linkId, newLink);
        yield this._bulkUpdateLink(currentLink, newLink);
        yield this._refreshLinks();

        this.showSuccess = this.updateLinkId;
        setTimeout(() => (this.showSuccess = null), 2000);
    }

    @task
    *_fetchReferrersStats() {
        const statsUrl = this.ghostPaths.url.api(`stats/referrers/posts/${this.post.id}`);
        const result = yield this.ajax.request(statsUrl);
        this.sources = result.stats.map(stat => ({
            source: stat.source ?? 'Direct',
            signups: stat.signups,
            paidConversions: stat.paid_conversions
        }));
    }

    @task
    *_fetchLinks() {
        const filter = `post_id:'${this.post.id}'`;
        const statsUrl = this.ghostPaths.url.api(`links/`) + `?filter=${encodeURIComponent(filter)}`;
        const result = yield this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    @task
    *_fetchMentions() {
        const filter = `resource_id:'${this.post.id}'+resource_type:post`;
        this.mentions = yield this.store.query('mention', {
            limit: 5,
            order: 'created_at desc',
            filter
        });
    }

    @task
    *fetchPostCountTask() {
        if (this.post.emailOnly) {
            return;
        }
        const result = yield this.store.query('post', { filter: 'status:published', limit: 1 });
        this.postCount = result.meta.pagination.total;
    }

    @task
    *fetchPostTask() {
        this._captureCurrentCounts();
        this.shouldAnimate = true;

        const result = yield this.store.query('post', {
            filter: `id:${this.post.id}`,
            include: 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment',
            limit: 1
        });
        this.post = result.toArray()[0];

        yield this.fetchLinks();
        return true;
    }

    // ==================
    // Private methods
    // ==================

    openPublishFlowModal() {
        this.modals.open(PostSuccessModal, {
            post: this.post,
            postCount: this.postCount,
            showPostCount: this.showPostCount
        });
    }

    async checkPublishFlowModal() {
        if (!localStorage.getItem('ghost-last-published-post')) {
            return;
        }
        await this.fetchPostCountTask.perform();
        this.showPostCount = true;
        this.openPublishFlowModal();
        localStorage.removeItem('ghost-last-published-post');
    }

    updateLinkData(linksData) {
        const cleanedLinks = linksData.map(link => this._cleanLink(link));
        const linksByTitle = this._groupLinksByTitle(cleanedLinks);
        this.links = Object.values(linksByTitle).sort((a, b) => {
            return (b.count?.clicks || 0) - (a.count?.clicks || 0);
        });
    }

    async fetchReferrersStats() {
        return this._runTask(this._fetchReferrersStats);
    }

    async fetchLinks() {
        return this._runTask(this._fetchLinks);
    }

    async fetchMentions() {
        return this._runTask(this._fetchMentions);
    }

    _cleanLink(link) {
        return {
            ...link,
            link: {
                ...link.link,
                originalTo: link.link.to,
                to: this.utils.cleanTrackedUrl(link.link.to, false),
                title: this.utils.cleanTrackedUrl(link.link.to, true)
            }
        };
    }

    _groupLinksByTitle(links) {
        return links.reduce((acc, link) => {
            const { title } = link.link;
            if (!acc[title]) {
                acc[title] = link;
            } else {
                acc[title].count = acc[title].count ?? { clicks: 0 };
                acc[title].count.clicks = (acc[title].count.clicks ?? 0) + (link.count?.clicks ?? 0);
            }
            return acc;
        }, {});
    }

    async _runTask(taskInstance) {
        try {
            if (taskInstance.isRunning) {
                return taskInstance.last;
            }
            return taskInstance.perform();
        } catch (e) {
            if (!didCancel(e)) {
                throw e;
            }
        }
    }

    _captureCurrentCounts() {
        this.previousSentCount = this.post.email?.emailCount;
        this.previousOpenedCount = this.post.email?.openedCount;
        this.previousClickedCount = this.post.count.clicks;
        this.previousFeedbackCount = this.totalFeedback;
        this.previousConversionsCount = this.post.count.conversions;
    }

    _applyOptimisticLinkUpdate(linkId, newLink) {
        let currentLink;
        this.links = this.links?.map((link) => {
            if (link.link.link_id !== linkId) {
                return link;
            }
            currentLink = new URL(link.link.originalTo);
            return {
                ...link,
                link: {
                    ...link.link,
                    to: this.utils.cleanTrackedUrl(newLink, false),
                    title: this.utils.cleanTrackedUrl(newLink, true)
                }
            };
        });
        return currentLink;
    }

    async _bulkUpdateLink(currentLink, newLink) {
        const filter = `post_id:'${this.post.id}'+to:'${currentLink}'`;
        const bulkUpdateUrl = this.ghostPaths.url.api(`links/bulk`) + `?filter=${encodeURIComponent(filter)}`;
        return this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: { link: { to: newLink } }
                }
            }
        });
    }

    async _refreshLinks() {
        const filter = `post_id:'${this.post.id}'`;
        const statsUrl = this.ghostPaths.url.api(`links/`) + `?filter=${encodeURIComponent(filter)}`;
        const result = await this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
    }

    _hasCountChanged(element) {
        const checks = {
            sent: () => this.post.email.emailCount !== this.previousSentCount,
            opened: () => this.post.email.openedCount !== this.previousOpenedCount,
            clicked: () => this.post.count.clicks !== this.previousClickedCount,
            feedback: () => this.totalFeedback !== this.previousFeedbackCount,
            conversions: () => this.post.count.conversions !== this.previousConversionsCount
        };

        return Object.entries(checks).some(
            ([className, hasChanged]) => element.classList.contains(className) && hasChanged()
        );
    }

    _animateElement(element) {
        const selector = Array.from(element.classList)
            .map(className => `.${className}`)
            .join('');

        anime({ targets: `${selector} .new-number span`, ...ANIMATION_CONFIG.newNumber });
        anime({ targets: `${selector} .old-number span`, ...ANIMATION_CONFIG.oldNumber });
    }
}
```

Key refactoring improvements:

1. **Extracted constants**: `ANIMATION_CONFIG` centralizes animation parameters, eliminating duplication in `applyClasses`.

2. **Simplified `isDropdownDisabled`**: Replaced verbose `if/return true/return false` with a single boolean expression.

3. **Extracted private methods**: `_captureCurrentCounts`, `_applyOptimisticLinkUpdate`, `_bulkUpdateLink`, `_refreshLinks`, `_cleanLink`, `_groupLinksByTitle`, `_hasCountChanged`, and `_animateElement` break up large methods into focused, testable units.

4. **Unified task runner**: `_runTask` eliminates the repeated try/catch/isRunning pattern across `fetchReferrersStats`, `fetchLinks`, and `fetchMentions`.

5. **Simplified `checkPublishFlowModal`**: Early return replaces nested `if` block.

6. **Simplified `fetchPostCountTask`**: Early return replaces wrapping the logic in an `if` block.

7. **Replaced `_hasCountChanged` logic**: Replaced the long conditional chain in `applyClasses` with a data-driven lookup map.

8. **Fixed typo**: `this.souces` → `this.sources` in `isLoaded`.

9. **Organized sections**: Clear comment headers group related members for readability.