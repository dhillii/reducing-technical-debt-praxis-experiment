Here's the refactored code with reduced complexity through better organization, extracted helper methods, and elimination of redundancy:

```javascript
import BulkAddMembersLabelModal from '../components/members/modals/bulk-add-label';
import BulkDeleteMembersModal from '../components/members/modals/bulk-delete';
import BulkRemoveMembersLabelModal from '../components/members/modals/bulk-remove-label';
import BulkUnsubscribeMembersModal from '../components/members/modals/bulk-unsubscribe';
import Controller from '@ember/controller';
import fetch from 'fetch';
import ghostPaths from 'ghost-admin/utils/ghost-paths';
import moment from 'moment-timezone';
import {A} from '@ember/array';
import {action} from '@ember/object';
import {didCancel, task, timeout} from 'ember-concurrency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject} from 'ghost-admin/decorators/inject';
import {resetQueryParams} from 'ghost-admin/helpers/reset-query-params';
import {inject as service} from '@ember/service';
import {tracked} from '@glimmer/tracking';

const PAID_PARAMS = [
    {name: 'All members', value: null},
    {name: 'Free members', value: 'false'},
    {name: 'Paid members', value: 'true'}
];

const STRIPE_FILTER_TYPES = [
    'subscriptions.plan_interval',
    'subscriptions.status',
    'subscriptions.start_date',
    'subscriptions.current_period_end',
    'conversion',
    'offer_redemptions'
];

const FILTER_PARAM_BRACKETS_RE = /^\(.*\)$/;
const FILTER_PARAM_MULTIPLE_GROUPS_RE = /\).*\(/;

export default class MembersController extends Controller {
    @service ajax;
    @service ellaSparse;
    @service feature;
    @service ghostPaths;
    @service membersStats;
    @service modals;
    @service router;
    @service store;
    @service utils;
    @service settings;

    @inject config;

    queryParams = [
        'label',
        {paidParam: 'paid'},
        {searchParam: 'search'},
        {orderParam: 'order'},
        {filterParam: 'filter'},
        {postAnalytics: 'post'}
    ];

    @tracked members = A([]);
    @tracked searchParam = '';
    @tracked searchIsFocused = false;
    @tracked filterParam = null;
    @tracked softFilterParam = null;
    @tracked paidParam = null;
    @tracked label = null;
    @tracked orderParam = null;
    @tracked modalLabel = null;
    @tracked showLabelModal = false;
    @tracked filters = A([]);
    @tracked softFilters = A([]);
    @tracked isExporting = false;
    @tracked _availableLabels = A([]);
    @tracked parseFilterParamCounter = 0;
    @tracked postAnalytics = null;

    paidParams = PAID_PARAMS;

    constructor() {
        super(...arguments);
        this._availableLabels = this.store.peekAll('label');
    }

    // Computed properties -----------------------------------------------------

    get fromAnalytics() {
        return this.postAnalytics ? [this.postAnalytics] : null;
    }

    get listHeader() {
        const {searchParam, selectedLabel, members} = this;

        if (members.loading) {
            return 'Loading...';
        }

        if (searchParam) {
            return 'Search result';
        }

        const count = ghPluralize(members.length, 'member');

        if (selectedLabel?.slug) {
            const verb = members.length > 1 ? 'match' : 'matches';
            return `${count} ${verb} current filter`;
        }

        return count;
    }

    get hideSearchBar() {
        return !this.members.length && !this.searchParam && !this.searchIsFocused;
    }

    get showingAll() {
        return !this.searchParam && !this.paidParam && !this.label && !this.filterParam && !this.softFilterParam;
    }

    get availableOrders() {
        if (!this.feature.get('emailAnalytics')) {
            return [];
        }

        return [
            {name: 'Newest', value: null},
            {name: 'Open rate', value: 'email_open_rate'}
        ];
    }

    get selectedOrder() {
        return this.availableOrders.find(order => order.value === this.orderParam);
    }

    get availableLabels() {
        const sorted = this._availableLabels
            .filter(label => !label.isNew && label.id !== null)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {ignorePunctuation: true}));

        return [{name: 'All labels', slug: null}, ...sorted.toArray()];
    }

    get selectedLabel() {
        return this.availableLabels.findBy('slug', this.label);
    }

    get labelModalData() {
        return {
            label: this.modalLabel,
            labels: this.availableLabels
        };
    }

    get selectedPaidParam() {
        return this.paidParams.findBy('value', this.paidParam) || {value: '!unknown'};
    }

    get isFiltered() {
        return !!(this.label || this.paidParam || this.searchParam || this.filterParam);
    }

    get availableFilters() {
        return this.softFilters.length ? this.softFilters : this.filters;
    }

    get filterColumns() {
        const columns = this.availableFilters.flatMap(filter => this._getFilterColumns(filter));
        const uniqueColumns = columns.filter((col, i) => columns.findIndex(c => c.label === col.label) === i);
        return uniqueColumns.slice(0, 2);
    }

    get isBulkDeletePermitted() {
        if (!this.isFiltered) {
            return false;
        }

        return !this.filters.some(f => STRIPE_FILTER_TYPES.includes(f.type));
    }

    // Private helpers ---------------------------------------------------------

    _getFilterColumns(filter) {
        if (filter.properties?.getColumns) {
            return filter.properties.getColumns(filter).map(col => ({
                label: filter.properties.columnLabel,
                ...col,
                name: filter.type
            }));
        }

        if (filter.properties?.columnLabel) {
            return [{
                name: filter.type,
                label: filter.properties.columnLabel,
                getValue: filter.properties.getColumnValue
                    ? member => filter.properties.getColumnValue(member, filter)
                    : null
            }];
        }

        return [];
    }

    _normalizeFilterParam(filterParam) {
        if (
            filterParam &&
            FILTER_PARAM_BRACKETS_RE.test(filterParam) &&
            !FILTER_PARAM_MULTIPLE_GROUPS_RE.test(filterParam)
        ) {
            return filterParam.slice(1, -1);
        }
        return filterParam;
    }

    _buildFilterString({label, paidParam, filterParam}) {
        const filters = [];

        if (label) {
            filters.push(`label:'${label}'`);
        }

        if (paidParam !== null) {
            filters.push(paidParam === 'true' ? 'status:-free' : 'status:free');
        }

        if (filterParam) {
            filters.push(filterParam);
        }

        return filters.join('+');
    }

    _openBulkModal(ModalComponent, extraOptions = {}) {
        this.modals.open(ModalComponent, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers,
            ...extraOptions
        });
    }

    _preventEventPropagation(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    // Public methods ----------------------------------------------------------

    includeTierQuery() {
        const activeFilters = this.filters.length ? this.filters : this.softFilters;
        return activeFilters.some(f => f.type === 'tier');
    }

    getApiQueryObject({params, extraFilters = []} = {}) {
        let {label, paidParam, searchParam, filterParam} = params ?? this;

        filterParam = this._normalizeFilterParam(filterParam);

        const filter = this._buildFilterString({
            label,
            paidParam,
            filterParam: [...extraFilters, filterParam].filter(Boolean).join('+') || null
        });

        return Object.assign(
            {filter},
            searchParam ? {search: searchParam} : {}
        );
    }

    // Actions -----------------------------------------------------------------

    @action
    refreshData() {
        try {
            this.fetchMembersTask.perform();
            this.fetchLabelsTask.perform();
        } catch (e) {
            if (!didCancel(e)) {
                throw e;
            }
        }

        this.membersStats.invalidate();
        this.membersStats.fetchCounts();
        this.membersStats.fetchMemberCount();
    }

    @action
    changeOrder(order) {
        this.orderParam = order.value;
    }

    @action
    applyFilter(filterStr, filters) {
        this.softFilters = A([]);
        this.filterParam = filterStr || null;
        this.filters = filters;
    }

    @action
    applyParsedFilter(filters) {
        this.softFilters = A([]);
        this.filters = filters;
    }

    @action
    applySoftFilter(filterStr, filters) {
        this.softFilters = filters;
        this.softFilterParam = filterStr || null;

        const {label, paidParam, searchParam, orderParam} = this;
        this.fetchMembersTask.perform({label, paidParam, searchParam, orderParam, filterParam: filterStr});
    }

    @action
    resetSoftFilter() {
        if (this.softFilters.length > 0 || this.softFilterParam) {
            this.softFilters = A([]);
            this.softFilterParam = null;
            this.fetchMembersTask.perform();
        }
    }

    @action
    resetFilter() {
        this.softFilters = A([]);
        this.softFilterParam = null;
        this.filters = A([]);
        this.filterParam = null;
        this.fetchMembersTask.perform();
    }

    @action
    search(e) {
        this.searchTask.perform(e.target.value);
    }

    @action
    async exportData() {
        const exportUrl = ghostPaths().url.api('members/upload');
        const downloadParams = new URLSearchParams(this.getApiQueryObject());
        downloadParams.set('limit', 'all');

        this.isExporting = true;

        try {
            const res = await fetch(`${exportUrl}?${downloadParams.toString()}`, {method: 'GET'});
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const datetime = new Date().toJSON().substring(0, 10);

            const a = Object.assign(document.createElement('a'), {
                href: blobUrl,
                download: `members.${datetime}.csv`
            });

            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(blobUrl);
        } finally {
            this.isExporting = false;
        }
    }

    @action
    changeLabel(label, e) {
        this._preventEventPropagation(e);
        this.label = label.slug;
    }

    @action
    editLabel(label, e) {
        this._preventEventPropagation(e);
        this.modalLabel = this.availableLabels.findBy('slug', label);
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    toggleLabelModal() {
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    bulkAddLabel() {
        this._openBulkModal(BulkAddMembersLabelModal);
    }

    @action
    bulkRemoveLabel() {
        this._openBulkModal(BulkRemoveMembersLabelModal);
    }

    @action
    bulkUnsubscribe() {
        this._openBulkModal(BulkUnsubscribeMembersModal);
    }

    @action
    resetAndReloadMembers() {
        this.store.unloadAll('member');
        this.reload();
    }

    @action
    bulkDelete() {
        this.modals.open(BulkDeleteMembersModal, {
            query: this.getApiQueryObject(),
            onComplete: () => {
                this.store.unloadAll('member');
                this.router.transitionTo('members.index', {
                    queryParams: Object.assign(resetQueryParams('members.index'))
                });
                this.membersStats.invalidate();
                this.membersStats.fetchCounts();
            }
        });
    }

    @action
    changePaidParam(paid) {
        this.paidParam = paid.value;
    }

    // Tasks -------------------------------------------------------------------

    @task({restartable: true})
    *searchTask(query) {
        yield timeout(250);
        this.searchParam = query;
    }

    @task({restartable: true})
    *fetchLabelsTask() {
        yield this.store.query('label', {limit: 'all'});
    }

    @task({restartable: true})
    *fetchMembersTask(params) {
        const resolved = params ?? this;
        const {label, paidParam, searchParam, orderParam, filterParam} = resolved;
        const startDate = new Date();

        const forceReload = this._shouldForceReload(params, {label, paidParam, searchParam, orderParam, filterParam});

        this._updateLastParams({label, paidParam, searchParam, orderParam, filterParam});

        if (!forceReload && this._startDate && !(this._startDate - startDate > 60_000)) {
            return this.members;
        }

        this._startDate = startDate;

        this.members = yield this.ellaSparse.array((range = {}, query = {}) => {
            const searchQuery = this.getApiQueryObject({
                params,
                extraFilters: [`created_at:<='${moment.utc(this._startDate).format('YYYY-MM-DD HH:mm:ss')}'`]
            });

            query = Object.assign({
                include: 'labels,tiers',
                order: orderParam ? `${orderParam} desc` : 'created_at desc',
                limit: range.length,
                page: range.page
            }, searchQuery, query);

            return this.store.query('member', query).then(result => ({
                data: result,
                total: result.meta.pagination.total
            }));
        }, {limit: 50});
    }

    // Internal ----------------------------------------------------------------

    _shouldForceReload(params, {label, paidParam, searchParam, orderParam, filterParam}) {
        return !params
            || label !== this._lastLabel
            || paidParam !== this._lastPaidParam
            || searchParam !== this._lastSearchParam
            || orderParam !== this._lastOrderParam
            || filterParam !== this._lastFilterParam;
    }

    _updateLastParams({label, paidParam, searchParam, orderParam, filterParam}) {
        this._lastLabel = label;
        this._lastPaidParam = paidParam;
        this._lastSearchParam = searchParam;
        this._lastOrderParam = orderParam;
        this._lastFilterParam = filterParam;
    }

    resetFilters(params) {
        if (!params?.filterParam) {
            this.filters = A([]);
            this.softFilterParam = null;
            this.softFilters = A([]);
        } else {
            this.filterParam = params.filterParam;
            this.parseFilterParamCounter += 1;
        }
    }

    reload(params) {
        this.membersStats.invalidate();
        this.membersStats.fetchCounts();
        this.fetchMembersTask.perform(params);
    }
}
```

Key refactoring changes made:

1. **Extracted constants** — `STRIPE_FILTER_TYPES` and regex patterns moved to module-level constants, removing magic values from methods.

2. **Extracted private helpers** — `_getFilterColumns`, `_normalizeFilterParam`, `_buildFilterString`, `_openBulkModal`, and `_preventEventPropagation` reduce duplication and simplify complex methods.

3. **Simplified `getApiQueryObject`** — Split filter building into `_buildFilterString` and `_normalizeFilterParam`, making each step clear and testable.

4. **Simplified `filterColumns`** — Delegated column extraction to `_getFilterColumns`, and replaced `.filter(...).splice()` with `.slice()`.

5. **Simplified `isBulkDeletePermitted`** — Replaced explicit length check with `.some()`.

6. **Unified bulk modal actions** — `bulkAddLabel`, `bulkRemoveLabel`, and `bulkUnsubscribe` now delegate to `_openBulkModal`.

7. **Converted `exportData` to async/await** — Cleaner than chained `.then()` calls; uses `finally` for state reset.

8. **Extracted `_shouldForceReload` and `_updateLastParams`** — Reduces the size and cognitive load of `fetchMembersTask`.

9. **Minor cleanups** — Used optional chaining (`?.`), nullish coalescing (`??`), numeric separator (`60_000`), and spread instead of `unshiftObject`.