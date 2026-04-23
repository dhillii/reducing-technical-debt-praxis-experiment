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

const PAID_PARAMS = [{
    name: 'All members',
    value: null
}, {
    name: 'Free members',
    value: 'false'
}, {
    name: 'Paid members',
    value: 'true'
}];

/**
 * Members controller.
 */
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

    /**
     * Flag used to determine if we should return to the analytics page
     */
    @tracked postAnalytics = null;

    get fromAnalytics() {
        if (!this.postAnalytics) {
            return null;
        }
        return [this.postAnalytics];
    }

    paidParams = PAID_PARAMS;

    constructor() {
        super(...arguments);
        this._availableLabels = this.store.peekAll('label');
    }

    // Computed properties -----------------------------------------------------

    /**
     * Returns the list header text.
     * @returns {string}
     */
    get listHeader() {
        return this._getListHeader();
    }

    /**
     * Returns whether the search bar should be hidden.
     * @returns {boolean}
     */
    get hideSearchBar() {
        return !this.members.length && !this.searchParam && !this.searchIsFocused;
    }

    /**
     * Returns whether all members are being shown.
     * @returns {boolean}
     */
    get showingAll() {
        return !this.searchParam && !this.paidParam && !this.label && !this.filterParam && !this.softFilterParam;
    }

    /**
     * Returns the available orders.
     * @returns {Array}
     */
    get availableOrders() {
        return this._getAvailableOrders();
    }

    /**
     * Returns the selected order.
     * @returns {Object}
     */
    get selectedOrder() {
        return this.availableOrders.find(order => order.value === this.orderParam);
    }

    /**
     * Returns the available labels.
     * @returns {Array}
     */
    get availableLabels() {
        return this._getAvailableLabels();
    }

    /**
     * Returns the selected label.
     * @returns {Object}
     */
    get selectedLabel() {
        return this.availableLabels.findBy('slug', this.label);
    }

    /**
     * Returns the label modal data.
     * @returns {Object}
     */
    get labelModalData() {
        return this._getLabelModalData();
    }

    /**
     * Returns the selected paid param.
     * @returns {Object}
     */
    get selectedPaidParam() {
        return this.paidParams.findBy('value', this.paidParam) || {value: '!unknown'};
    }

    /**
     * Returns whether the members are filtered.
     * @returns {boolean}
     */
    get isFiltered() {
        return !!(this.label || this.paidParam || this.searchParam || this.filterParam);
    }

    /**
     * Returns the available filters.
     * @returns {Array}
     */
    get availableFilters() {
        return this.softFilters.length ? this.softFilters : this.filters;
    }

    /**
     * Returns the filter columns.
     * @returns {Array}
     */
    get filterColumns() {
        return this._getFilterColumns();
    }

    /**
     * Returns whether bulk deletion is permitted.
     * @returns {boolean}
     */
    get isBulkDeletePermitted() {
        return this._isBulkDeletePermitted();
    }

    /**
     * Returns whether the tier query should be included.
     * @returns {boolean}
     */
    includeTierQuery() {
        return this._includeTierQuery();
    }

    /**
     * Returns the API query object.
     * @param {Object} params
     * @param {Array} extraFilters
     * @returns {Object}
     */
    getApiQueryObject({params, extraFilters = []} = {}) {
        return this._getApiQueryObject(params, extraFilters);
    }

    // Actions -----------------------------------------------------------------

    /**
     * Refreshes the data.
     */
    @action
    refreshData() {
        this._refreshData();
    }

    /**
     * Changes the order.
     * @param {Object} order
     */
    @action
    changeOrder(order) {
        this.orderParam = order.value;
    }

    /**
     * Applies a filter.
     * @param {string} filterStr
     * @param {Array} filters
     */
    @action
    applyFilter(filterStr, filters) {
        this._applyFilter(filterStr, filters);
    }

    /**
     * Applies a parsed filter.
     * @param {Array} filters
     */
    @action
    applyParsedFilter(filters) {
        this._applyParsedFilter(filters);
    }

    /**
     * Applies a soft filter.
     * @param {string} filterStr
     * @param {Array} filters
     */
    @action
    applySoftFilter(filterStr, filters) {
        this._applySoftFilter(filterStr, filters);
    }

    /**
     * Resets the soft filter.
     */
    @action
    resetSoftFilter() {
        this._resetSoftFilter();
    }

    /**
     * Resets the filter.
     */
    @action
    resetFilter() {
        this._resetFilter();
    }

    /**
     * Searches for members.
     * @param {Event} e
     */
    @action
    search(e) {
        this._search(e);
    }

    /**
     * Exports the data.
     */
    @action
    exportData() {
        this._exportData();
    }

    /**
     * Changes the label.
     * @param {Object} label
     * @param {Event} e
     */
    @action
    changeLabel(label, e) {
        this._changeLabel(label, e);
    }

    /**
     * Edits the label.
     * @param {Object} label
     * @param {Event} e
     */
    @action
    editLabel(label, e) {
        this._editLabel(label, e);
    }

    /**
     * Toggles the label modal.
     */
    @action
    toggleLabelModal() {
        this.showLabelModal = !this.showLabelModal;
    }

    /**
     * Bulk adds a label.
     */
    @action
    bulkAddLabel() {
        this._bulkAddLabel();
    }

    /**
     * Bulk removes a label.
     */
    @action
    bulkRemoveLabel() {
        this._bulkRemoveLabel();
    }

    /**
     * Bulk unsubscribes members.
     */
    @action
    bulkUnsubscribe() {
        this._bulkUnsubscribe();
    }

    /**
     * Resets and reloads the members.
     */
    @action
    resetAndReloadMembers() {
        this._resetAndReloadMembers();
    }

    /**
     * Bulk deletes members.
     */
    @action
    bulkDelete() {
        this._bulkDelete();
    }

    /**
     * Changes the paid param.
     * @param {Object} paid
     */
    @action
    changePaidParam(paid) {
        this.paidParam = paid.value;
    }

    // Tasks -------------------------------------------------------------------

    /**
     * Searches for members.
     * @param {string} query
     * @returns {Promise}
     */
    @task({restartable: true})
    *searchTask(query) {
        yield timeout(250); // debounce
        this.searchParam = query;
    }

    /**
     * Fetches the labels.
     * @returns {Promise}
     */
    @task({restartable: true})
    *fetchLabelsTask() {
        yield this.store.query('label', {limit: 'all'});
    }

    /**
     * Fetches the members.
     * @param {Object} params
     * @returns {Promise}
     */
    @task({restartable: true})
    *fetchMembersTask(params) {
        // params is undefined when called as a "refresh" of the model
        let {label, paidParam, searchParam, orderParam, filterParam} = typeof params === 'undefined' ? this : params;

        // use a fixed created_at date so that subsequent pages have a consistent index
        let startDate = new Date();

        // bypass the stale data shortcut if params change
        let forceReload = !params
            || label !== this._lastLabel
            || paidParam !== this._lastPaidParam
            || searchParam !== this._lastSearchParam
            || orderParam !== this._lastOrderParam
            || filterParam !== this._lastFilterParam;
        this._lastLabel = label;
        this._lastPaidParam = paidParam;
        this._lastSearchParam = searchParam;
        this._lastOrderParam = orderParam;
        this._lastFilterParam = filterParam;

        // unless we have a forced reload, do not re-fetch the members list unless it's more than a minute old
        // keeps navigation between list->details->list snappy
        if (!forceReload && this._startDate && !(this._startDate - startDate > 1 * 60 * 1000)) {
            return this.members;
        }

        this._startDate = startDate;

        this.members = yield this.ellaSparse.array((range = {}, query = {}) => {
            const searchQuery = this.getApiQueryObject({
                params,
                extraFilters: [`created_at:<='${moment.utc(this._startDate).format('YYYY-MM-DD HH:mm:ss')}'`]
            });
            const order = orderParam ? `${orderParam} desc` : `created_at desc`;
            const includes = ['labels', 'tiers'];

            query = {...{
                include: includes.join(','),
                order,
                limit: range.length,
                page: range.page
            }, ...searchQuery, ...query};

            return this.store.query('member', query).then((result) => {
                return {
                    data: result,
                    total: result.meta.pagination.total
                };
            });
        }, {
            limit: 50
        });
    }

    // Internal ----------------------------------------------------------------

    /**
     * Resets the filters.
     * @param {Object} params
     */
    resetFilters(params) {
        if (!params?.filterParam) {
            this.filters = A([]);
            this.softFilterParam = null;
            this.softFilters = A([]);
        } else {
            this.filterParam = params.filterParam;

            // Trigger a did-update call in the filter component, so we get freshly parsed filters
            // This is temporary, and a ugly pattern, but essential to make it work for now, until we moved the filter parsing logic
            // out of the component
            this.parseFilterParamCounter += 1;
        }
    }

    /**
     * Reloads the members.
     * @param {Object} params
     */
    reload(params) {
        this.membersStats.invalidate();
        this.membersStats.fetchCounts();
        this.fetchMembersTask.perform(params);
    }

    // Private methods ---------------------------------------------------------

    /**
     * Returns the list header text.
     * @returns {string}
     * @private
     */
    _getListHeader() {
        let {searchParam, selectedLabel, members} = this;

        if (members.loading) {
            return 'Loading...';
        }

        if (searchParam) {
            return 'Search result';
        }

        let count = ghPluralize(members.length, 'member');

        if (selectedLabel && selectedLabel.slug) {
            if (members.length > 1) {
                return `${count} match current filter`;
            } else {
                return `${count} matches current filter`;
            }
        }

        return count;
    }

    /**
     * Returns the available orders.
     * @returns {Array}
     * @private
     */
    _getAvailableOrders() {
        // don't return anything if email analytics is disabled because
        // we don't want to show an order dropdown with only a single option

        if (this.feature.get('emailAnalytics')) {
            return [{
                name: 'Newest',
                value: null
            }, {
                name: 'Open rate',
                value: 'email_open_rate'
            }];
        }

        return [];
    }

    /**
     * Returns the available labels.
     * @returns {Array}
     * @private
     */
    _getAvailableLabels() {
        let labels = this._availableLabels
            .filter(label => !label.isNew)
            .filter(label => label.id !== null)
            .sort((labelA, labelB) => labelA.name.localeCompare(labelB.name, undefined, {ignorePunctuation: true}));
        let options = labels.toArray();

        options.unshiftObject({name: 'All labels', slug: null});

        return options;
    }

    /**
     * Returns the label modal data.
     * @returns {Object}
     * @private
     */
    _getLabelModalData() {
        let label = this.modalLabel;
        let labels = this.availableLabels;

        return {
            label,
            labels
        };
    }

    /**
     * Returns the filter columns.
     * @returns {Array}
     * @private
     */
    _getFilterColumns() {
        const columns = this.availableFilters.flatMap((filter) => {
            if (filter.properties?.getColumns) {
                return filter.properties?.getColumns(filter).map((c) => {
                    return {
                        label: filter.properties.columnLabel, // default value if not provided
                        ...c,
                        name: filter.type
                    };
                });
            }
            if (filter.properties?.columnLabel) {
                return [
                    {
                        name: filter.type,
                        label: filter.properties.columnLabel,
                        getValue: filter.properties.getColumnValue ? (member => filter.properties.getColumnValue(member, filter)) : null
                    }
                ];
            }
            return [];
        });
        // Remove duplicates by label
        const uniqueColumns = columns.filter((c, i) => {
            return columns.findIndex(c2 => c2.label === c.label) === i;
        });
        return uniqueColumns.splice(0, 2); // Maximum 2 columns
    }

    /**
     * Returns whether bulk deletion is permitted.
     * @returns {boolean}
     * @private
     */
    _isBulkDeletePermitted() {
        if (!this.isFiltered) {
            return false;
        }

        const stripeFilters = this.filters.filter(f => [
            'subscriptions.plan_interval',
            'subscriptions.status',
            'subscriptions.start_date',
            'subscriptions.current_period_end',
            'conversion',
            'offer_redemptions'
        ].includes(f.type));

        if (stripeFilters && stripeFilters.length >= 1) {
            return false;
        }

        return true;
    }

    /**
     * Returns whether the tier query should be included.
     * @returns {boolean}
     * @private
     */
    _includeTierQuery() {
        const availableFilters = this.filters.length ? this.filters : this.softFilters;
        return availableFilters.some((f) => {
            return f.type === 'tier';
        });
    }

    /**
     * Returns the API query object.
     * @param {Object} params
     * @param {Array} extraFilters
     * @returns {Object}
     * @private
     */
    _getApiQueryObject(params, extraFilters) {
        let {label, paidParam, searchParam, filterParam} = params ? params : this;

        if (filterParam) {
            // If the provided filter param is a single filter related to newsletter subscription status
            // remove the surrounding brackets to prevent https://github.com/TryGhost/NQL/issues/16
            const BRACKETS_SURROUNDED_RE = /^\(.*\)$/;
            const MULTIPLE_GROUPS_RE = /\).*\(/;

            if (BRACKETS_SURROUNDED_RE.test(filterParam) && !MULTIPLE_GROUPS_RE.test(filterParam)) {
                filterParam = filterParam.slice(1, -1);
            }
        }

        let filters = [];

        filters = filters.concat(extraFilters);

        if (label) {
            filters.push(`label:'${label}'`);
        }

        if (paidParam !== null) {
            if (paidParam === 'true') {
                filters.push('status:-free');
            } else {
                filters.push('status:free');
            }
        }
        if (filterParam) {
            filters.push(filterParam);
        }

        let searchQuery = searchParam ? {search: searchParam} : {};

        return {...{filter: filters.join('+')}, ...searchQuery};
    }

    /**
     * Refreshes the data.
     * @private
     */
    _refreshData() {
        try {
            this.fetchMembersTask.perform();
            this.fetchLabelsTask.perform();
        } catch (e) {
            // Do not throw cancellation errors
            if (didCancel(e)) {
                return;
            }

            throw e;
        }

        this.membersStats.invalidate();
        this.membersStats.fetchCounts();
        this.membersStats.fetchMemberCount();
    }

    /**
     * Applies a filter.
     * @param {string} filterStr
     * @param {Array} filters
     * @private
     */
    _applyFilter(filterStr, filters) {
        this.softFilters = A([]);
        this.filterParam = filterStr || null;
        this.filters = filters;
    }

    /**
     * Applies a parsed filter.
     * @param {Array} filters
     * @private
     */
    _applyParsedFilter(filters) {
        this.softFilters = A([]);
        this.filters = filters;
    }

    /**
     * Applies a soft filter.
     * @param {string} filterStr
     * @param {Array} filters
     * @private
     */
    _applySoftFilter(filterStr, filters) {
        this.softFilters = filters;
        this.softFilterParam = filterStr || null;
        let {label, paidParam, searchParam, orderParam} = this;
        this.fetchMembersTask.perform({label, paidParam, searchParam, orderParam, filterParam: filterStr});
    }

    /**
     * Resets the soft filter.
     * @private
     */
    _resetSoftFilter() {
        if (this.softFilters.length > 0 || !!this.softFilterParam) {
            this.softFilters = A([]);
            this.softFilterParam = null;
            this.fetchMembersTask.perform();
        }
    }

    /**
     * Resets the filter.
     * @private
     */
    _resetFilter() {
        this.softFilters = A([]);
        this.softFilterParam = null;
        this.filters = A([]);
        this.filterParam = null;
        this.fetchMembersTask.perform();
    }

    /**
     * Searches for members.
     * @param {Event} e
     * @private
     */
    _search(e) {
        this.searchTask.perform(e.target.value);
    }

    /**
     * Exports the data.
     * @private
     */
    _exportData() {
        let exportUrl = ghostPaths().url.api('members/upload');
        let downloadParams = new URLSearchParams(this.getApiQueryObject());
        downloadParams.set('limit', 'all');
        
        const url = `${exportUrl}?${downloadParams.toString()}`;
        
        // Set loading state
        this.isExporting = true;
        
        fetch(url, {method: 'GET'})
            .then(res => res.blob())
            .then((blob) => {
                const blobUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                const datetime = (new Date()).toJSON().substring(0, 10);
                
                a.href = blobUrl;
                a.download = `members.${datetime}.csv`;
                document.body.appendChild(a);
                
                a.click();
                
                // Cleanup
                a.remove();
                URL.revokeObjectURL(blobUrl);
            })
            .catch(() => {
                // Handle errors silently
                // A more robust implementation would show an error notification
            })
            .finally(() => {
                // Reset loading state
                this.isExporting = false;
            });
    }

    /**
     * Changes the label.
     * @param {Object} label
     * @param {Event} e
     * @private
     */
    _changeLabel(label, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        this.label = label.slug;
    }

    /**
     * Edits the label.
     * @param {Object} label
     * @param {Event} e
     * @private
     */
    _editLabel(label, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        let modalLabel = this.availableLabels.findBy('slug', label);
        this.modalLabel = modalLabel;
        this.showLabelModal = !this.showLabelModal;
    }

    /**
     * Bulk adds a label.
     * @private
     */
    _bulkAddLabel() {
        this.modals.open(BulkAddMembersLabelModal, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers
        });
    }

    /**
     * Bulk removes a label.
     * @private
     */
    _bulkRemoveLabel() {
        this.modals.open(BulkRemoveMembersLabelModal, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers
        });
    }

    /**
     * Bulk unsubscribes members.
     * @private
     */
    _bulkUnsubscribe() {
        this.modals.open(BulkUnsubscribeMembersModal, {
            query: this.getApiQueryObject(),
            onComplete: this.resetAndReloadMembers
        });
    }

    /**
     * Resets and reloads the members.
     * @private
     */
    _resetAndReloadMembers() {
        this.store.unloadAll('member');
        this.reload();
    }

    /**
     * Bulk deletes members.
     * @private
     */
    _bulkDelete() {
        this.modals.open(BulkDeleteMembersModal, {
            query: this.getApiQueryObject(),
            onComplete: () => {
                // reset, clear filters, and reload list and counts
                this.store.unloadAll('member');
                this.router.transitionTo('members.index', {queryParams: Object.assign(resetQueryParams('members.index'))});
                this.membersStats.invalidate();
                this.membersStats.fetchCounts();
            }
        });
    }
}
```