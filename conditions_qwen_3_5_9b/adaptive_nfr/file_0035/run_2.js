```javascript
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
 * Finds a button element by its text content within a given NodeList.
 * @param {string} text - The text to search for in button elements.
 * @param {NodeList} buttons - The NodeList of button elements to search within.
 * @returns {Node|null} The found button element or null if not found.
 */
const findButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

/**
 * Selects multiple posts by clicking on their containers with the specified modifier key.
 * @param {HTMLElement[]} postContainers - Array of post container elements to select.
 * @param {boolean} isMac - Whether the current platform is Mac.
 * @returns {void}
 */
const selectMultiplePosts = (postContainers, isMac) => {
    postContainers.forEach(container => {
        click(container, {metaKey: isMac, ctrlKey: !isMac});
    });
};

/**
 * Triggers a context menu on a post container element.
 * @param {HTMLElement} postContainer - The post container element to trigger context menu on.
 * @returns {void}
 */
const triggerPostContextMenu = (postContainer) => {
    triggerEvent(postContainer, 'contextmenu');
};

/**
 * Finds the context menu element after triggering a context menu.
 * @returns {HTMLElement|null} The context menu element or null if not found.
 */
const findContextMenu = () => {
    return find('.gh-posts-context-menu');
};

/**
 * Verifies that the context menu exists and has the expected number of buttons.
 * @param {number} expectedButtonCount - The expected number of buttons in the context menu.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyContextMenuButtons = (expectedButtonCount, description) => {
    const contextMenu = findContextMenu();
    expect(contextMenu, description).to.exist;
    const buttons = contextMenu.querySelectorAll('button');
    expect(buttons.length, `${description} buttons`).to.equal(expectedButtonCount);
};

/**
 * Verifies that a specific button exists in the context menu by its text.
 * @param {string} buttonText - The text of the button to find.
 * @param {string} description - Description for the test assertion.
 * @returns {HTMLElement|null} The found button element or null.
 */
const findContextMenuButton = (buttonText, description) => {
    const contextMenu = findContextMenu();
    const buttons = contextMenu.querySelectorAll('button');
    const button = findButton(buttonText, buttons);
    expect(button, description).to.exist;
    return button;
};

/**
 * Verifies that a post container has the 'data-selected' attribute set.
 * @param {HTMLElement} postContainer - The post container element to check.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyPostSelected = (postContainer, description) => {
    expect(postContainer.dataset.selected, description).to.exist;
};

/**
 * Verifies that a post container does not have the 'data-selected' attribute set.
 * @param {HTMLElement} postContainer - The post container element to check.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyPostNotSelected = (postContainer, description) => {
    expect(postContainer.dataset.selected, description).to.not.exist;
};

/**
 * Retrieves the last API request from the server pretender.
 * @param {string} urlPattern - Pattern to match against the request URL.
 * @returns {Object|null} The last matching API request or null.
 */
const getLastApiRequest = (urlPattern) => {
    const requests = this.server.pretender.handledRequests.filter(r => r.url.includes(urlPattern) && r.method === 'GET');
    return requests[requests.length - 1];
};

/**
 * Retrieves the last request from the server pretender.
 * @returns {Object|null} The last API request or null.
 */
const getLastRequest = () => {
    return this.server.pretender.handledRequests.slice(-1)[0];
};

/**
 * Verifies that an API request has the expected query parameter filter.
 * @param {string} filterParam - The expected filter parameter value.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyApiFilter = (filterParam, description) => {
    const request = getLastApiRequest('/posts/');
    expect(request.queryParams.filter, description).to.have.string(filterParam);
};

/**
 * Verifies that an API request has the expected query parameter allFilter.
 * @param {string} filterParam - The expected allFilter parameter value.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyApiAllFilter = (filterParam, description) => {
    const request = getLastApiRequest('/posts/');
    expect(request.queryParams.allFilter, description).to.have.string(filterParam);
};

/**
 * Verifies that an API request has the expected query parameter filter for pages.
 * @param {string} filterParam - The expected filter parameter value.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyPagesApiFilter = (filterParam, description) => {
    const request = getLastApiRequest('/pages/');
    expect(request.queryParams.filter, description).to.have.string(filterParam);
};

/**
 * Verifies that an API request has the expected query parameter allFilter for pages.
 * @param {string} filterParam - The expected allFilter parameter value.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyPagesApiAllFilter = (filterParam, description) => {
    const request = getLastApiRequest('/pages/');
    expect(request.queryParams.allFilter, description).to.have.string(filterParam);
};

/**
 * Verifies that an API request has the expected bulk action in the request body.
 * @param {string} action - The expected bulk action value.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyBulkAction = (action, description) => {
    const request = getLastRequest();
    expect(JSON.parse(request.requestBody).bulk.action, description).to.equal(action);
};

/**
 * Verifies that an API request has the expected filter IDs in the query parameter.
 * @param {string} filterParam - The expected filter parameter value.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyApiFilterIds = (filterParam, description) => {
    const request = getLastRequest();
    expect(request.queryParams.filter, description).to.equal(filterParam);
};

/**
 * Verifies that an API request has the expected method.
 * @param {string} method - The expected HTTP method.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyRequestMethod = (method, description) => {
    const request = getLastRequest();
    expect(request.method, description).to.equal(method);
};

/**
 * Verifies that a post element exists in the DOM.
 * @param {HTMLElement} post - The post element to verify.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyPostExists = (post, description) => {
    expect(post, description).to.exist;
};

/**
 * Verifies that a post element does not exist in the DOM.
 * @param {HTMLElement} post - The post element to verify.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyPostNotExists = (post, description) => {
    expect(post, description).to.not.exist;
};

/**
 * Verifies that a post element has the expected text content.
 * @param {HTMLElement} post - The post element to verify.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyPostText = (post, expectedText, description) => {
    expect(post.querySelector('.gh-content-entry-title').textContent, description).to.contain(expectedText);
};

/**
 * Verifies that a post element has the expected status text.
 * @param {HTMLElement} post - The post element to verify.
 * @param {string} expectedStatus - The expected status text.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyPostStatus = (post, expectedStatus, description) => {
    expect(post.querySelector('.gh-content-entry-status').textContent, description).to.contain(expectedStatus);
};

/**
 * Verifies that a post element has the expected featured class.
 * @param {HTMLElement} post - The post element to verify.
 * @param {boolean} shouldExist - Whether the featured class should exist.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyPostFeatured = (post, shouldExist, description) => {
    expect(post.querySelector('.gh-featured-post'), description).to.exist;
};

/**
 * Verifies that a post element does not have the expected featured class.
 * @param {HTMLElement} post - The post element to verify.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyPostNotFeatured = (post, description) => {
    expect(post.querySelector('.gh-featured-post'), description).to.not.exist;
};

/**
 * Verifies that a modal element exists in the DOM.
 * @param {string} selector - The CSS selector for the modal.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyModalExists = (selector, description) => {
    const modal = find(selector);
    expect(modal, description).to.exist;
};

/**
 * Verifies that a modal element does not exist in the DOM.
 * @param {string} selector - The CSS selector for the modal.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyModalNotExists = (selector, description) => {
    const modal = find(selector);
    expect(modal, description).to.not.exist;
};

/**
 * Verifies that a navigation element exists in the DOM.
 * @param {string} selector - The CSS selector for the navigation element.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyNavExists = (selector, description) => {
    const nav = find(selector);
    expect(nav, description).to.exist;
};

/**
 * Verifies that a navigation element does not exist in the DOM.
 * @param {string} selector - The CSS selector for the navigation element.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyNavNotExists = (selector, description) => {
    const nav = find(selector);
    expect(nav, description).to.not.exist;
};

/**
 * Verifies that a navigation element has the expected text content.
 * @param {string} selector - The CSS selector for the navigation element.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyNavText = (selector, expectedText, description) => {
    const nav = find(selector);
    expect(nav.textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a navigation element has the expected class.
 * @param {string} selector - The CSS selector for the navigation element.
 * @param {string} className - The expected class name.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyNavClass = (selector, className, description) => {
    const nav = find(selector);
    expect(nav, description).to.have.class(className);
};

/**
 * Verifies that a navigation element does not have the expected class.
 * @param {string} selector - The CSS selector for the navigation element.
 * @param {string} className - The class name that should not exist.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyNavNotClass = (selector, className, description) => {
    const nav = find(selector);
    expect(nav, description).to.not.have.class(className);
};

/**
 * Verifies that a button element exists in the DOM.
 * @param {string} selector - The CSS selector for the button.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyButtonExists = (selector, description) => {
    const button = find(selector);
    expect(button, description).to.exist;
};

/**
 * Verifies that a button element does not exist in the DOM.
 * @param {string} selector - The CSS selector for the button.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifyButtonNotExists = (selector, description) => {
    const button = find(selector);
    expect(button, description).to.not.exist;
};

/**
 * Verifies that a select element has the expected value.
 * @param {string} selector - The CSS selector for the select element.
 * @param {string} expectedValue - The expected value.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectValue = (selector, expectedValue, description) => {
    const select = find(selector);
    expect(select.value, description).to.equal(expectedValue);
};

/**
 * Verifies that a select element has the expected rendered text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectText = (selector, expectedText, description) => {
    const select = find(selector);
    expect(select.textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected number of options.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText - The expected text content.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionText = (selector, index, expectedText, description) => {
    const options = findAll(selector);
    expect(options[index].textContent.trim(), description).to.equal(expectedText);
};

/**
 * Verifies that a select element has the expected option count.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} expectedCount - The expected number of options.
 * @param {string} description - Description for the test assertion.
 * @returns {void}
 */
const verifySelectOptionsCount = (selector, expectedCount, description) => {
    const options = findAll(selector);
    expect(options.length, description).to.equal(expectedCount);
};

/**
 * Verifies that a select element has the expected option text.
 * @param {string} selector - The CSS selector for the select element.
 * @param {number} index - The index of the option to check.
 * @param {string} expectedText -