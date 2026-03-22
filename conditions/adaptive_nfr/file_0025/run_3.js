# Refactored MembersController

## Key Refactoring Decisions

1. **Extracted constants** for filter types and query param config
2. **Extracted helper methods** to reduce method complexity (`_buildFilterString`, `_hasStripeFilters`, `_createDownloadLink`)
3. **Unified bulk modal action** via a generic `_openBulkModal` method
4. **Simplified `filterColumns`** by extracting column-building logic
5. **Simplified `fetchMembersTask`** by extracting stale-check and param-tracking logic
6. **Simplified `exportData`** by extracting blob download logic
7. **Removed redundant comments** that restated obvious code

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

const STRIPE_FILTER_TYPES = new Set([
    'subscriptions.plan_interval',
    'subscriptions.status',
    'subscriptions.start_date',
    'subscriptions.current_period_end',
    'conversion',
    'offer_redemptions'
]);

const QUERY_PARAMS = [
    'label',
    {paidParam: 'paid'},
    {searchParam: 'search'},
    {orderParam: 'order'},
    {filterParam: 'filter'},
    {postAnalytics: 'post'}
];

const FILTER_BRACKETS_RE = /^\(.*\)$/;
const FILTER_MULTIPLE_GROUPS_RE = /\).*\(/;
const MAX_FILTER_COLUMNS = 2;
const SEARCH_DEBOUNCE_MS = 250;
const MEMBERS_CACHE_TTL_MS = 60 * 1000;

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

    queryParams = QUERY_PARAMS;
    paidParams = PAID_PARAMS;

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
    @tracked postAnalytics = null;
    @tracked parseFilterParamCounter = 0;

    @tracked _availableLabels = A([]);

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
        return !this.searchParam && !this.paidParam && !this.label
            && !this.filterParam && !this.softFilterParam;
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

        const options = sorted.toArray();
        options.unshiftObject({name: 'All labels', slug: null});
        return options;
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
        const columns = this.availableFilters.flatMap(filter => this._buildFilterColumns(filter));
        const unique = columns.filter((col, i) => columns.findIndex(c => c.label === col.label) === i);
        return unique.slice(0, MAX_FILTER_COLUMNS);
    }

    get isBulkDeletePermitted() {
        return this.isFiltered && !this._hasStripeFilters();
    }

    // Internal helpers --------------------------------------------------------

    _buildFilterColumns(filter) {
        const {properties, type} = filter;

        if (properties?.getColumns) {
            return properties.getColumns(filter).map(col => ({
                label: properties.columnLabel,
                ...col,
                name: type
            }));
        }

        if (properties?.columnLabel) {
            return [{
                name: type,
                label: properties.columnLabel,
                getValue: properties.getColumnValue
                    ? member => properties.getColumnValue(member, filter)
                    : null
            }];
        }

        return [];
    }

    _hasStripeFilters() {
        return this.filters.some(f => STRIPE_FILTER_TYPES.has(f.type));
    }

    _normalizeFilterParam(filterParam) {
        if (filterParam
            && FILTER_BRACKETS_RE.test(filterParam)
            && !FILTER_MULTIPLE_GROUPS_RE.test(filterParam)
        ) {
            return filterParam.slice(1, -1);
        }
        return filterParam;
    }

    _isParamCacheStale(params) {
        const {label, paidParam, searchParam, orderParam, filterParam} = params;
        return !params
            || label !== this._lastLabel
            || paidParam !== this._lastPaidParam
            || searchParam !== this._lastSearchParam
            || orderParam !== this._lastOrderParam
            || filterParam !== this._lastFilterParam;
    }

    _trackLastParams({label, paidParam, searchParam, orderParam, filterParam}) {
        this._lastLabel = label;
        this._lastPaidParam = paidParam;
        this._lastSearchParam = searchParam;
        this._lastOrderParam = orderParam;
        this._lastFilterParam = filterParam;
    }

    _triggerDownload(blob, filename) {
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
    }

    _openBulkModal(ModalComponent, onComplete) {
        this.modals.open(ModalComponent, {
            query: this.getApiQueryObject(),
            onComplete
        });
    }

    // Public API --------------------------------------------------------------

    includeTierQuery() {
        const activeFilters = this.filters.length ? this.filters : this.softFilters;
        return activeFilters.some(f => f.type === 'tier');
    }

    getApiQueryObject({params, extraFilters = []} = {}) {
        let {label, paidParam, searchParam, filterParam} = params ?? this;

        filterParam = this._normalizeFilterParam(filterParam);

        const filters = [
            ...extraFilters,
            label && `label:'${label}'`,
            paidParam === 'true' && 'status:-free',
            paidParam === 'false' && 'status:free',
            filterParam
        ].filter(Boolean);

        return Object.assign(
            {filter: filters.join('+')},
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
            const res = await fetch(`${exportUrl}?${downloadParams}`, {method: 'GET'});
            const blob = await res.blob();
            const date = new Date().toJSON().substring(0, 10);
            this._triggerDownload(blob, `members.${date}.csv`);
        } finally {
            this.isExporting = false;
        }
    }

    @action
    changeLabel(label, e) {
        e?.preventDefault();
        e?.stopPropagation();
        this.label = label.slug;
    }

    @action
    editLabel(label, e) {
        e?.preventDefault();
        e?.stopPropagation();
        this.modalLabel = this.availableLabels.findBy('slug', label);
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    toggleLabelModal() {
        this.showLabelModal = !this.showLabelModal;
    }

    @action
    bulkAddLabel() {
        this._openBulkModal(BulkAddMembersLabelModal, this.resetAndReloadMembers);
    }

    @action
    bulkRemoveLabel() {
        this._openBulkModal(BulkRemoveMembersLabelModal, this.resetAndReloadMembers);
    }

    @action
    bulkUnsubscribe() {
        this._openBulkModal(BulkUnsubscribeMembersModal, this.resetAndReloadMembers);
    }

    @action
    resetAndReloadMembers() {
        this.store.unloadAll('member');
        this.reload();
    }

    @action
    bulkDelete() {
        this._openBulkModal(BulkDeleteMembersModal, () => {
            this.store.unloadAll('member');
            this.router.transitionTo('members.index', {
                queryParams: Object.assign(resetQueryParams('members.index'))
            });
            this.membersStats.invalidate();
            this.membersStats.fetchCounts();
        });
    }

    @action
    changePaidParam(paid) {
        this.paidParam = paid.value;
    }

    // Tasks -------------------------------------------------------------------

    @task({restartable: true})
    *searchTask(query) {
        yield timeout(SEARCH_DEBOUNCE_MS);
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

        const forceReload = this._isParamCacheStale(resolved);
        this._trackLastParams(resolved);

        const isCacheValid = !forceReload
            && this._startDate
            && !(this._startDate - startDate > MEMBERS_CACHE_TTL_MS);

        if (isCacheValid) {
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

## Summary of Changes

| Area | Change |
|------|--------|
| **Constants** | Extracted `STRIPE_FILTER_TYPES` (Set for O(1) lookup), `QUERY_PARAMS`, regex patterns, and magic numbers into named constants |
| **`filterColumns`** | Extracted `_buildFilterColumns()` helper; replaced `splice` with `slice` (non-mutating) |
| **`isBulkDeletePermitted`** | Simplified to one-liner using `_hasStripeFilters()` helper |
| **`getApiQueryObject`** | Replaced imperative `if/push` chain with declarative filter array using `.filter(Boolean)` |
| **`exportData`** | Converted to `async/await`, extracted `_triggerDownload()`, removed silent catch |
| **Bulk actions** | Unified 3 identical modal-open patterns into `_openBulkModal()` |
| **`fetchMembersTask`** | Extracted `_isParamCacheStale()` and `_trackLastParams()` helpers; named the cache check |
| **`changeLabel`/`editLabel`** | Used optional chaining (`e?.preventDefault()`) |
| **`fromAnalytics`** | Simplified to ternary |
| **`listHeader`** | Removed duplication with template literal and variable for verb |