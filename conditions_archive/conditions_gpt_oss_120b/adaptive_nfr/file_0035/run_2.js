import ctrlOrCmd from 'ghost-admin/utils/ctrl-or-cmd';
import sinon from 'sinon';
import windowProxy from 'ghost-admin/utils/window-proxy';
import {authenticateSession, invalidateSession} from 'ember-simple-auth/test-support';
import {beforeEach, describe, it} from 'mocha';
import {blur, click, currentURL, fillIn, find, findAll, triggerEvent, triggerKeyEvent, visit} from '@ember/test-helpers';
import {clickTrigger, selectChoose, selectSearch} from 'ember-power-select/test-support/helpers';
import {expect} from 'chai';
import {setupApplicationTest} from 'ember-mocha';
import {setupMirage} from 'ember-cli-mirage/test-support';

/**
 * Find a button with the given text.
 *
 * @param {string} text
 * @param {NodeList} buttons
 * @returns {Element|undefined}
 */
const findButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

/**
 * Check if an element has the `data-selected` attribute using dataset.
 *
 * @param {Element} element
 * @returns {boolean}
 */
function isSelected(element) {
    return !!element.dataset.selected;
}

/**
 * Open the context menu for a given container element.
 *
 * @param {Element} container
 * @returns {Element} The opened context menu element.
 */
function openContextMenu(container) {
    triggerEvent(container, 'contextmenu');
    return find('.gh-posts-context-menu');
}

/**
 * Retrieve all buttons from a context menu.
 *
 * @param {Element} contextMenu
 * @returns {NodeList}
 */
function getContextMenuButtons(contextMenu) {
    return contextMenu.querySelectorAll('button');
}

/**
 * Click a button inside a context menu by its visible text.
 *
 * @param {Element} container - The element that triggers the context menu.
 * @param {string} buttonText - The button text to click.
 */
async function clickContextMenuButton(container, buttonText) {
    const menu = openContextMenu(container);
    const buttons = getContextMenuButtons(menu);
    const button = findButton(buttonText, buttons);
    expect(button, `${buttonText} button`).to.exist;
    await click(button);
}

/**
 * Select multiple post containers using meta/ctrl click.
 *
 * @param {Element[]} containers
 */
async function selectMultiplePosts(containers) {
    for (let container of containers) {
        await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    }
}

/**
 * Assert that the given containers are selected.
 *
 * @param {Element[]} containers
 */
function assertContainersSelected(containers) {
    containers.forEach(container => {
        expect(isSelected(container), `${container} selected`).to.be.true;
    });
}

/**
 * Assert that the given containers are not selected.
 *
 * @param {Element[]} containers
 */
function assertContainersNotSelected(containers) {
    containers.forEach(container => {
        expect(isSelected(container), `${container} not selected`).to.be.false;
    });
}

/**
 * Retrieve the last API request matching a URL substring.
 *
 * @param {string} urlPart
 * @returns {Object}
 */
function getLastRequest(urlPart) {
    const requests = this.server.pretender.handledRequests.filter(r => r.url.includes(urlPart));
    return requests[requests.length - 1];
}

/**
 * Retrieve all API requests matching a URL substring.
 *
 * @param {string} urlPart
 * @returns {Object[]}
 */
function getAllRequests(urlPart) {
    return this.server.pretender.handledRequests.filter(r => r.url.includes(urlPart));
}

/**
 * Retrieve the last request from the server pretender.
 *
 * @returns {Object}
 */
function getLastHandledRequest() {
    return this.server.pretender.handledRequests.slice(-1)[0];
}

/**
 * Retrieve the last two requests from the server pretender.
 *
 * @returns {Object[]}
 */
function getLastTwoHandledRequests() {
    const handled = this.server.pretender.handledRequests;
    return handled.slice(-2);
}

/**
 * Retrieve the last request from the server pretender and parse its body.
 *
 * @returns {{queryParams: Object, requestBody: string}}
 */
function getLastRequestInfo() {
    const lastRequest = getLastHandledRequest.call(this);
    return {
        queryParams: lastRequest.queryParams,
        requestBody: lastRequest.requestBody
    };
}

/**
 * Retrieve the last request's filter query param.
 *
 * @param {string} filterKey
 * @returns {string}
 */
function getLastRequestFilter(filterKey) {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams[filterKey];
}

/**
 * Retrieve the last request's bulk action.
 *
 * @returns {string}
 */
function getLastBulkAction() {
    const {requestBody} = getLastRequestInfo.call(this);
    return JSON.parse(requestBody).bulk.action;
}

/**
 * Retrieve the last request's bulk meta.
 *
 * @returns {Object}
 */
function getLastBulkMeta() {
    const {requestBody} = getLastRequestInfo.call(this);
    return JSON.parse(requestBody).bulk.meta;
}

/**
 * Retrieve the last request's filter for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkFilter() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter for bulk actions.
 *
 * @returns {string}
 */
function getLastAllFilter() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's method.
 *
 * @returns {string}
 */
function getLastRequestMethod() {
    const lastRequest = getLastHandledRequest.call(this);
    return lastRequest.method;
}

/**
 * Retrieve the last request's URL.
 *
 * @returns {string}
 */
function getLastRequestUrl() {
    const lastRequest = getLastHandledRequest.call(this);
    return lastRequest.url;
}

/**
 * Retrieve the last request's request body.
 *
 * @returns {string}
 */
function getLastRequestBody() {
    const lastRequest = getLastHandledRequest.call(this);
    return lastRequest.requestBody;
}

/**
 * Retrieve the last request's query params.
 *
 * @returns {Object}
 */
function getLastRequestQueryParams() {
    const lastRequest = getLastHandledRequest.call(this);
    return lastRequest.queryParams;
}

/**
 * Retrieve the last request's filter param.
 *
 * @returns {string}
 */
function getLastRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param.
 *
 * @returns {string}
 */
function getLastRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilter() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilter() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.filter;
}

/**
 * Retrieve the last request's allFilter param for bulk actions.
 *
 * @returns {string}
 */
function getLastBulkRequestAllFilterParam() {
    const {queryParams} = getLastRequestInfo.call(this);
    return queryParams.allFilter;
}

/**
 * Retrieve the last request's filter param for bulk