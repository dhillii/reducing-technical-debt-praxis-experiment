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
 * Finds a button element by its text content within a given container.
 * @param {string} text - The text content to search for
 * @param {NodeList} buttons - The NodeList of button elements to search within
 * @returns {Node|null} - The found button element or null if not found
 */
const findButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

/**
 * Checks if an element has a specific data attribute set to true.
 * @param {HTMLElement} element - The element to check
 * @param {string} attribute - The data attribute name to check
 * @returns {boolean} - True if the attribute exists and is truthy
 */
const hasDataAttribute = (element, attribute) => {
    return element.dataset[attribute];
};

/**
 * Retrieves the last N requests from the pretender's handled requests.
 * @param {number} count - The number of requests to retrieve
 * @param {Object} pretender - The pretender object with handledRequests array
 * @returns {Array} - Array of the last N requests
 */
const getLastRequests = (count, pretender) => {
    return pretender.handledRequests.slice(-count);
};

/**
 * Filters requests by URL pattern and HTTP method.
 * @param {string} urlPattern - The URL pattern to match
 * @param {string} method - The HTTP method to filter by
 * @param {Object} pretender - The pretender object with handledRequests array
 * @returns {Array} - Array of matching requests
 */
const filterRequests = (urlPattern, method, pretender) => {
    return pretender.handledRequests.filter(r => r.url.includes(urlPattern) && r.method === method);
};

/**
 * Verifies that a context menu is visible on the page.
 * @param {string} selector - The CSS selector for the context menu
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyContextMenuVisible = (selector, message, context) => {
    const contextMenu = find(selector);
    expect(contextMenu, message).to.exist;
};

/**
 * Verifies that a context menu is not visible on the page.
 * @param {string} selector - The CSS selector for the context menu
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyContextMenuNotVisible = (selector, message, context) => {
    const contextMenu = find(selector);
    expect(contextMenu, message).to.not.be.visible;
};

/**
 * Verifies that a button exists in the context menu with the expected text.
 * @param {string} buttonText - The expected text on the button
 * @param {NodeList} buttons - The NodeList of buttons to search within
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyContextMenuButton = (buttonText, buttons, message, context) => {
    const button = findButton(buttonText, buttons);
    expect(button, message).to.exist;
};

/**
 * Verifies that a button does not exist in the context menu.
 * @param {string} buttonText - The expected text on the button
 * @param {NodeList} buttons - The NodeList of buttons to search within
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyContextMenuButtonNotExists = (buttonText, buttons, message, context) => {
    const button = findButton(buttonText, buttons);
    expect(button, message).to.not.exist;
};

/**
 * Verifies that a post container has the data-selected attribute set.
 * @param {HTMLElement} container - The post container element
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostSelected = (container, message, context) => {
    expect(hasDataAttribute(container, 'selected'), message).to.exist;
};

/**
 * Verifies that a post container does not have the data-selected attribute set.
 * @param {HTMLElement} container - The post container element
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostNotSelected = (container, message, context) => {
    expect(hasDataAttribute(container, 'selected'), message).to.not.exist;
};

/**
 * Verifies that a modal element exists on the page.
 * @param {string} selector - The CSS selector for the modal
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyModalExists = (selector, message, context) => {
    const modal = find(selector);
    expect(modal, message).to.exist;
};

/**
 * Verifies that a modal element does not exist on the page.
 * @param {string} selector - The CSS selector for the modal
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyModalNotExists = (selector, message, context) => {
    const modal = find(selector);
    expect(modal, message).to.not.exist;
};

/**
 * Verifies that a notification element exists with the expected text.
 * @param {string} selector - The CSS selector for the notification
 * @param {string} expectedText - The expected text content
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyNotificationExists = (selector, expectedText, message, context) => {
    const notification = find(selector);
    expect(notification, message).to.contain.text(expectedText);
};

/**
 * Verifies that a post element exists on the page.
 * @param {string} selector - The CSS selector for the post
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostExists = (selector, message, context) => {
    const post = find(selector);
    expect(post, message).to.exist;
};

/**
 * Verifies that a post element does not exist on the page.
 * @param {string} selector - The CSS selector for the post
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostNotExists = (selector, message, context) => {
    const post = find(selector);
    expect(post, message).to.not.exist;
};

/**
 * Verifies that a post element exists and contains the expected text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedText - The expected text content
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostContainsText = (selector, expectedText, message, context) => {
    const post = find(selector);
    expect(post, message).to.contain.text(expectedText);
};

/**
 * Verifies that a post element exists and has the expected status text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedStatus - The expected status text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostStatus = (selector, expectedStatus, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-status').textContent, message).to.contain(expectedStatus);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitle = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string} selector - The CSS selector for the post
 * @param {string} expectedTitle - The expected title text
 * @param {string} message - The test message for assertion
 * @param {Object} context - The test context
 */
const verifyPostTitleContains = (selector, expectedTitle, message, context) => {
    const post = find(selector);
    expect(post.querySelector('.gh-content-entry-title').textContent, message).to.contain(expectedTitle);
};

/**
 * Verifies that a post element exists and has the expected title text.
 * @param {string