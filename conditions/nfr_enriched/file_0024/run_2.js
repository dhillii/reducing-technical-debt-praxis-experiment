Here's the refactored code with reduced complexity:

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

const DISPLAY_OPTIONS = [
    {name: 'Free signups', value: 'signups'},
    {name: 'Paid conversions', value: 'paid'}
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

const POST_INCLUDE_FIELDS = 'email,count.clicks,count.conversions,count.positive_feedback,count.negative_feedback,sentiment';

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
    @tracked previousCounts = {};

    displayOptions = DISPLAY_OPTIONS;

    constructor() {
        super(...arguments);
        this.initializePreviousCounts();
        this.checkPublishFlowModal();
    }

    // region Getters/Setters

    get post() {
        return this._post ?? this.args.post;
    }

    set post(value) {
        this._post = value;
    }

    get totalFeedback() {
        return this.post.count.positive_feedback + this.post.count.negative_feedback;
    }

    get currentCounts() {
        return {
            sent: this.post.email?.emailCount,
            opened: this.post.email?.openedCount,
            clicked: this.post.count.clicks,
            feedback: this.totalFeedback,
            conversions: this.post.count.conversions
        };
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

    get hasPaidConversionData() {
        return this.sources?.some(source => source.paidConversions > 0) ?? false;
    }

    get hasFreeSignups() {
        return this.sources?.some(source => source.signups > 0) ?? false;
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

    get isDropdownDisabled() {
        return !this.hasPaidConversionData || !this.hasFreeSignups;
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
        const postId = this.post.id;
        return {
            values: [this.post.count.positive_feedback, this.post.count.negative_feedback],
            labels: ['More like this', 'Less like this'],
            links: [
                {filterParam: `(feedback.post_id:'${postId}'+feedback.score:1)`},
                {filterParam: `(feedback.post_id:'${postId}'+feedback.score:0)`}
            ],
            colors: ['#F080B2', '#8452f633']
        };
    }

    // endregion

    // region Initialization

    initializePreviousCounts() {
        this.previousCounts = {...this.currentCounts};
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

    // endregion

    // region Actions

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
        this.modals.open(DeletePostModal, {post: this.post});
    }

    @action
    applyClasses(element) {
        if (!this.shouldAnimate || !this.hasCountChanged(element)) {
            return;
        }
        this.animateElement(element);
    }

    // endregion

    // region Private Methods

    openPublishFlowModal() {
        this.modals.open(PostSuccessModal, {
            post: this.post,
            postCount: this.postCount,
            showPostCount: this.showPostCount
        });
    }

    hasCountChanged(element) {
        const countChecks = {
            sent: () => this.post.email.emailCount !== this.previousCounts.sent,
            opened: () => this.post.email.openedCount !== this.previousCounts.opened,
            clicked: () => this.post.count.clicks !== this.previousCounts.clicked,
            feedback: () => this.totalFeedback !== this.previousCounts.feedback,
            conversions: () => this.post.count.conversions !== this.previousCounts.conversions
        };

        return Object.entries(countChecks).some(
            ([className, hasChanged]) => element.classList.contains(className) && hasChanged()
        );
    }

    animateElement(element) {
        const selector = Array.from(element.classList)
            .map(className => `.${className}`)
            .join('');

        anime({
            targets: `${selector} .new-number span`,
            ...ANIMATION_CONFIG.newNumber
        });

        anime({
            targets: `${selector} .old-number span`,
            ...ANIMATION_CONFIG.oldNumber
        });
    }

    updateLinkData(linksData) {
        const cleanedLinks = linksData.map(link => this.cleanLink(link));
        const linksByTitle = this.groupLinksByTitle(cleanedLinks);

        this.links = Object.values(linksByTitle)
            .sort((a, b) => (b.count?.clicks || 0) - (a.count?.clicks || 0));
    }

    cleanLink(link) {
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

    groupLinksByTitle(links) {
        return links.reduce((acc, link) => {
            const {title} = link.link;
            if (!acc[title]) {
                acc[title] = link;
            } else {
                acc[title].count = acc[title].count ?? {clicks: 0};
                acc[title].count.clicks = (acc[title].count.clicks ?? 0) + (link.count?.clicks ?? 0);
            }
            return acc;
        }, {});
    }

    async runTask(task) {
        try {
            if (task.isRunning) {
                return task.last;
            }
            return task.perform();
        } catch (e) {
            if (!didCancel(e)) {
                throw e;
            }
        }
    }

    async fetchReferrersStats() {
        return this.runTask(this._fetchReferrersStats);
    }

    async fetchLinks() {
        return this.runTask(this._fetchLinks);
    }

    async fetchMentions() {
        return this.runTask(this._fetchMentions);
    }

    // endregion

    // region Tasks

    @task
    *_updateLinks(linkId, newLink) {
        this.updateLinkId = linkId;

        const currentLink = this.updateLinksOptimistically(linkId, newLink);
        yield this.bulkUpdateLinks(currentLink, newLink);
        yield this.refreshLinksData();

        this.showSuccess = this.updateLinkId;
        setTimeout(() => {
            this.showSuccess = null;
        }, 2000);
    }

    updateLinksOptimistically(linkId, newLink) {
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

    async bulkUpdateLinks(currentLink, newLink) {
        const filter = `post_id:'${this.post.id}'+to:'${currentLink}'`;
        const bulkUpdateUrl = `${this.ghostPaths.url.api('links/bulk')}?filter=${encodeURIComponent(filter)}`;

        return this.ajax.put(bulkUpdateUrl, {
            data: {
                bulk: {
                    action: 'updateLink',
                    meta: {link: {to: newLink}}
                }
            }
        });
    }

    async refreshLinksData() {
        const filter = `post_id:'${this.post.id}'`;
        const statsUrl = `${this.ghostPaths.url.api('links/')}?filter=${encodeURIComponent(filter)}`;
        const result = await this.ajax.request(statsUrl);
        this.updateLinkData(result.links);
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
        const statsUrl = `${this.ghostPaths.url.api('links/')}?filter=${encodeURIComponent(filter)}`;
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
        const result = yield this.store.query('post', {filter: 'status:published', limit: 1});
        this.postCount = result.meta.pagination.total;
    }

    @task
    *fetchPostTask() {
        this.shouldAnimate = true;
        const previousCounts = {...this.currentCounts};

        const result = yield this.store.query('post', {
            filter: `id:${this.post.id}`,
            include: POST_INCLUDE_FIELDS,
            limit: 1
        });

        this.post = result.toArray()[0];
        this.previousCounts = previousCounts;

        yield this.fetchLinks();
        return true;
    }

    // endregion
}
```

Key refactoring improvements:

1. **Extracted constants**: `ANIMATION_CONFIG` and `POST_INCLUDE_FIELDS` reduce magic values inline.

2. **Consolidated `previousCounts`**: Replaced five separate `@tracked` properties with a single `previousCounts` object and added a `currentCounts` getter for clean access.

3. **Extracted helper methods**: `cleanLink()`, `groupLinksByTitle()`, `hasCountChanged()`, `animateElement()`, `updateLinksOptimistically()`, `bulkUpdateLinks()`, and `refreshLinksData()` break up complex methods into single-responsibility units.

4. **Unified `runTask()`**: Eliminated duplicated try/catch cancellation logic across `fetchReferrersStats`, `fetchLinks`, and `fetchMentions`.

5. **Simplified conditionals**: `isDropdownDisabled` now uses a direct boolean expression instead of an if/else.

6. **Early returns**: `checkPublishFlowModal` and `fetchPostCountTask` use early returns to reduce nesting.

7. **Organized with regions**: Code is grouped into logical sections (Getters, Initialization, Actions, Private Methods, Tasks) for readability.

8. **Fixed bug**: Corrected `this.souces` typo to `this.sources` in `isLoaded`.