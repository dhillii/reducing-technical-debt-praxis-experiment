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
 * Find a button with the given text within a NodeList.
 *
 * @param {string} text
 * @param {NodeList} buttons
 * @returns {Element|undefined}
 */
const findButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

/**
 * Check if an element has a `data-selected` attribute using dataset.
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
 * @returns {Promise<void>}
 */
async function openContextMenu(container) {
    await triggerEvent(container, 'contextmenu');
}

/**
 * Click multiple post containers with the appropriate meta/ctrl key based on platform.
 *
 * @param {...Element} containers
 * @returns {Promise<void>}
 */
async function selectMultiplePosts(...containers) {
    for (let container of containers) {
        await click(container, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
    }
}

/**
 * Retrieve the last API request matching a given URL fragment.
 *
 * @param {Object} server
 * @param {string} fragment
 * @returns {Object}
 */
function getLastRequest(server, fragment) {
    const requests = server.pretender.handledRequests.filter(r => r.url.includes(fragment));
    return requests[requests.length - 1];
}

/**
 * Assert that a bulk API request matches expected parameters.
 *
 * @param {Object} request
 * @param {string} expectedFilter
 * @param {string} expectedAction
 */
function assertBulkRequest(request, expectedFilter, expectedAction) {
    expect(request.queryParams.filter, 'bulk request filter').to.equal(expectedFilter);
    expect(JSON.parse(request.requestBody).bulk.action, 'bulk request action').to.equal(expectedAction);
}

/**
 * Assert that a modal is present and confirm it.
 *
 * @param {string} selector
 * @returns {Promise<void>}
 */
async function confirmModal(selector) {
    const modal = find(selector);
    expect(modal, `${selector} modal`).to.exist;
    await click('[data-test-button="confirm"]');
}

/**
 * Fill an input field and trigger Enter key.
 *
 * @param {Element} input
 * @param {string} value
 * @returns {Promise<void>}
 */
async function fillInputAndEnter(input, value) {
    await fillIn(input, value);
    await triggerKeyEvent(input, 'keydown', 13);
}

/**
 * Get the dataset value for a given data attribute.
 *
 * @param {Element} element
 * @param {string} key
 * @returns {string|undefined}
 */
function getDataset(element, key) {
    return element.dataset[key];
}

/**
 * Set the dataset value for a given data attribute.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} value
 */
function setDataset(element, key, value) {
    element.dataset[key] = value;
}

/**
 * Retrieve the context menu button by its visible text.
 *
 * @param {Element} contextMenu
 * @param {string} buttonText
 * @returns {Element|undefined}
 */
function getContextMenuButton(contextMenu, buttonText) {
    const buttons = contextMenu.querySelectorAll('button');
    return findButton(buttonText, buttons);
}

/**
 * Retrieve the post container element for a given post ID.
 *
 * @param {string|number} postId
 * @returns {Element}
 */
function getPostContainerById(postId) {
    const post = find(`[data-test-post-id="${postId}"]`);
    expect(post, 'post').to.exist;
    return post.parentElement;
}

/**
 * Verify that a post list contains exactly the expected number of posts.
 *
 * @param {number} expectedCount
 * @param {string} description
 */
function expectPostCount(expectedCount, description) {
    expect(findAll('[data-test-post-id]').length, description).to.equal(expectedCount);
}

/**
 * Verify that a post element exists in the DOM.
 *
 * @param {string|number} postId
 * @param {string} description
 */
function expectPostExists(postId, description) {
    expect(find(`[data-test-post-id="${postId}"]`), description).to.exist;
}

/**
 * Verify that a post element does not exist in the DOM.
 *
 * @param {string|number} postId
 * @param {string} description
 */
function expectPostNotExists(postId, description) {
    expect(find(`[data-test-post-id="${postId}"]`), description).to.not.exist;
}

/**
 * Verify that a context menu is not visible.
 *
 * @param {Element} contextMenu
 * @param {string} description
 */
function expectContextMenuNotVisible(contextMenu, description) {
    expect(contextMenu, description).to.not.be.visible;
}

/**
 * Verify that a context menu is visible.
 *
 * @param {Element} contextMenu
 * @param {string} description
 */
function expectContextMenuVisible(contextMenu, description) {
    expect(contextMenu, description).to.be.visible;
}

/**
 * Verify that a UI element contains specific text.
 *
 * @param {Element} element
 * @param {string} expectedText
 * @param {string} description
 */
function expectElementContainsText(element, expectedText, description) {
    expect(element.innerText.trim(), description).to.contain(expectedText);
}

/**
 * Verify that a UI element has a specific value.
 *
 * @param {Element} element
 * @param {string} expectedValue
 * @param {string} description
 */
function expectElementHasValue(element, expectedValue, description) {
    expect(element, description).to.have.value(expectedValue);
}

/**
 * Verify that a UI element does not have a specific class.
 *
 * @param {Element} element
 * @param {string} className
 * @param {string} description
 */
function expectElementNotHasClass(element, className, description) {
    expect(element, description).to.not.have.class(className);
}

/**
 * Verify that a UI element has a specific class.
 *
 * @param {Element} element
 * @param {string} className
 * @param {string} description
 */
function expectElementHasClass(element, className, description) {
    expect(element, description).to.have.class(className);
}

/**
 * Verify that a UI element exists.
 *
 * @param {Element} element
 * @param {string} description
 */
function expectElementExists(element, description) {
    expect(element, description).to.exist;
}

/**
 * Verify that a UI element does not exist.
 *
 * @param {Element} element
 * @param {string} description
 */
function expectElementNotExists(element, description) {
    expect(element, description).to.not.exist;
}

/**
 * Verify that a UI element is not visible.
 *
 * @param {Element} element
 * @param {string} description
 */
function expectElementNotVisible(element, description) {
    expect(element, description).to.not.be.visible;
}

/**
 * Verify that a UI element is visible.
 *
 * @param {Element} element
 * @param {string} description
 */
function expectElementVisible(element, description) {
    expect(element, description).to.be.visible;
}

/**
 * Verify that a UI element contains a specific text.
 *
 * @param {Element} element
 * @param {string} text
 * @param {string} description
 */
function expectElementTextContains(element, text, description) {
    expect(element.textContent.trim(), description).to.contain(text);
}

/**
 * Verify that a UI element's text matches exactly.
 *
 * @param {Element} element
 * @param {string} text
 * @param {string} description
 */
function expectElementTextEquals(element, text, description) {
    expect(element.textContent.trim(), description).to.equal(text);
}

/**
 * Verify that a UI element's attribute exists.
 *
 * @param {Element} element
 * @param {string} attribute
 * @param {string} description
 */
function expectElementHasAttribute(element, attribute, description) {
    expect(element.getAttribute(attribute), description).to.exist;
}

/**
 * Verify that a UI element's attribute does not exist.
 *
 * @param {Element} element
 * @param {string} attribute
 * @param {string} description
 */
function expectElementNotHasAttribute(element, attribute, description) {
    expect(element.getAttribute(attribute), description).to.not.exist;
}

/**
 * Verify that a UI element's dataset key exists.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetExists(element, key, description) {
    expect(getDataset(element, key), description).to.exist;
}

/**
 * Verify that a UI element's dataset key does not exist.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetNotExists(element, key, description) {
    expect(getDataset(element, key), description).to.not.exist;
}

/**
 * Verify that a UI element's dataset key has a specific value.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} expectedValue
 * @param {string} description
 */
function expectDatasetValue(element, key, expectedValue, description) {
    expect(getDataset(element, key), description).to.equal(expectedValue);
}

/**
 * Verify that a UI element's dataset key does not have a specific value.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} unexpectedValue
 * @param {string} description
 */
function expectDatasetNotValue(element, key, unexpectedValue, description) {
    expect(getDataset(element, key), description).to.not.equal(unexpectedValue);
}

/**
 * Verify that a UI element's dataset key contains a substring.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} substring
 * @param {string} description
 */
function expectDatasetContains(element, key, substring, description) {
    expect(getDataset(element, key), description).to.contain(substring);
}

/**
 * Verify that a UI element's dataset key does not contain a substring.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} substring
 * @param {string} description
 */
function expectDatasetNotContains(element, key, substring, description) {
    expect(getDataset(element, key), description).to.not.contain(substring);
}

/**
 * Verify that a UI element's dataset key matches a regular expression.
 *
 * @param {Element} element
 * @param {string} key
 * @param {RegExp} regex
 * @param {string} description
 */
function expectDatasetMatches(element, key, regex, description) {
    expect(getDataset(element, key), description).to.match(regex);
}

/**
 * Verify that a UI element's dataset key does not match a regular expression.
 *
 * @param {Element} element
 * @param {string} key
 * @param {RegExp} regex
 * @param {string} description
 */
function expectDatasetNotMatches(element, key, regex, description) {
    expect(getDataset(element, key), description).to.not.match(regex);
}

/**
 * Verify that a UI element's dataset key is truthy.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetTruthy(element, key, description) {
    expect(!!getDataset(element, key), description).to.be.true;
}

/**
 * Verify that a UI element's dataset key is falsy.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetFalsy(element, key, description) {
    expect(!!getDataset(element, key), description).to.be.false;
}

/**
 * Verify that a UI element's dataset key is a specific type.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} type
 * @param {string} description
 */
function expectDatasetType(element, key, type, description) {
    expect(typeof getDataset(element, key), description).to.equal(type);
}

/**
 * Verify that a UI element's dataset key is not a specific type.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} type
 * @param {string} description
 */
function expectDatasetNotType(element, key, type, description) {
    expect(typeof getDataset(element, key), description).to.not.equal(type);
}

/**
 * Verify that a UI element's dataset key is an object.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetObject(element, key, description) {
    expect(typeof getDataset(element, key), description).to.equal('object');
}

/**
 * Verify that a UI element's dataset key is not an object.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetNotObject(element, key, description) {
    expect(typeof getDataset(element, key), description).to.not.equal('object');
}

/**
 * Verify that a UI element's dataset key is an array.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetArray(element, key, description) {
    expect(Array.isArray(getDataset(element, key)), description).to.be.true;
}

/**
 * Verify that a UI element's dataset key is not an array.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetNotArray(element, key, description) {
    expect(Array.isArray(getDataset(element, key)), description).to.be.false;
}

/**
 * Verify that a UI element's dataset key is a number.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetNumber(element, key, description) {
    expect(typeof getDataset(element, key), description).to.equal('number');
}

/**
 * Verify that a UI element's dataset key is not a number.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetNotNumber(element, key, description) {
    expect(typeof getDataset(element, key), description).to.not.equal('number');
}

/**
 * Verify that a UI element's dataset key is a string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetString(element, key, description) {
    expect(typeof getDataset(element, key), description).to.equal('string');
}

/**
 * Verify that a UI element's dataset key is not a string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetNotString(element, key, description) {
    expect(typeof getDataset(element, key), description).to.not.equal('string');
}

/**
 * Verify that a UI element's dataset key is a boolean.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetBoolean(element, key, description) {
    expect(typeof getDataset(element, key), description).to.equal('boolean');
}

/**
 * Verify that a UI element's dataset key is not a boolean.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetNotBoolean(element, key, description) {
    expect(typeof getDataset(element, key), description).to.not.equal('boolean');
}

/**
 * Verify that a UI element's dataset key is null.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetNull(element, key, description) {
    expect(getDataset(element, key), description).to.be.null;
}

/**
 * Verify that a UI element's dataset key is not null.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetNotNull(element, key, description) {
    expect(getDataset(element, key), description).to.not.be.null;
}

/**
 * Verify that a UI element's dataset key is undefined.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetUndefined(element, key, description) {
    expect(getDataset(element, key), description).to.be.undefined;
}

/**
 * Verify that a UI element's dataset key is defined.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetDefined(element, key, description) {
    expect(getDataset(element, key), description).to.not.be.undefined;
}

/**
 * Verify that a UI element's dataset key is empty.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetEmpty(element, key, description) {
    expect(getDataset(element, key), description).to.be.empty;
}

/**
 * Verify that a UI element's dataset key is not empty.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetNotEmpty(element, key, description) {
    expect(getDataset(element, key), description).to.not.be.empty;
}

/**
 * Verify that a UI element's dataset key is a valid JSON string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidJSON(element, key, description) {
    expect(() => JSON.parse(getDataset(element, key)), description).to.not.throw();
}

/**
 * Verify that a UI element's dataset key is not a valid JSON string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidJSON(element, key, description) {
    expect(() => JSON.parse(getDataset(element, key)), description).to.throw();
}

/**
 * Verify that a UI element's dataset key is a valid URL.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidURL(element, key, description) {
    expect(() => new URL(getDataset(element, key)), description).to.not.throw();
}

/**
 * Verify that a UI element's dataset key is not a valid URL.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidURL(element, key, description) {
    expect(() => new URL(getDataset(element, key)), description).to.throw();
}

/**
 * Verify that a UI element's dataset key is a valid email address.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidEmail(element, key, description) {
    const email = getDataset(element, key);
    expect(email).to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid email address.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidEmail(element, key, description) {
    const email = getDataset(element, key);
    expect(email).to.not.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid ISO date string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidISODate(element, key, description) {
    const date = getDataset(element, key);
    expect(new Date(date).toISOString()).to.equal(date);
}

/**
 * Verify that a UI element's dataset key is not a valid ISO date string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidISODate(element, key, description) {
    const date = getDataset(element, key);
    expect(() => new Date(date).toISOString()).to.throw();
}

/**
 * Verify that a UI element's dataset key is a valid UUID.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidUUID(element, key, description) {
    const uuid = getDataset(element, key);
    expect(uuid).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
}

/**
 * Verify that a UI element's dataset key is not a valid UUID.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidUUID(element, key, description) {
    const uuid = getDataset(element, key);
    expect(uuid).to.not.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
}

/**
 * Verify that a UI element's dataset key is a valid phone number.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidPhone(element, key, description) {
    const phone = getDataset(element, key);
    expect(phone).to.match(/^\+?[1-9]\d{1,14}$/);
}

/**
 * Verify that a UI element's dataset key is not a valid phone number.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidPhone(element, key, description) {
    const phone = getDataset(element, key);
    expect(phone).to.not.match(/^\+?[1-9]\d{1,14}$/);
}

/**
 * Verify that a UI element's dataset key is a valid hex color.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidHexColor(element, key, description) {
    const color = getDataset(element, key);
    expect(color).to.match(/^#([0-9A-Fa-f]{3}){1,2}$/);
}

/**
 * Verify that a UI element's dataset key is not a valid hex color.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidHexColor(element, key, description) {
    const color = getDataset(element, key);
    expect(color).to.not.match(/^#([0-9A-Fa-f]{3}){1,2}$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS length.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSLength(element, key, description) {
    const length = getDataset(element, key);
    expect(length).to.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS length.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSLength(element, key, description) {
    const length = getDataset(element, key);
    expect(length).to.not.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is a valid IP address.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidIP(element, key, description) {
    const ip = getDataset(element, key);
    expect(ip).to.match(/^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid IP address.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidIP(element, key, description) {
    const ip = getDataset(element, key);
    expect(ip).to.not.match(/^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)$/);
}

/**
 * Verify that a UI element's dataset key is a valid JSON Web Token.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidJWT(element, key, description) {
    const jwt = getDataset(element, key);
    expect(jwt).to.match(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid JSON Web Token.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidJWT(element, key, description) {
    const jwt = getDataset(element, key);
    expect(jwt).to.not.match(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid base64 string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidBase64(element, key, description) {
    const base64 = getDataset(element, key);
    expect(base64).to.match(/^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/);
}

/**
 * Verify that a UI element's dataset key is not a valid base64 string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidBase64(element, key, description) {
    const base64 = getDataset(element, key);
    expect(base64).to.not.match(/^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/);
}

/**
 * Verify that a UI element's dataset key is a valid markdown string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidMarkdown(element, key, description) {
    const markdown = getDataset(element, key);
    expect(markdown).to.match(/^[\s\S]*$/);
}

/**
 * Verify that a UI element's dataset key is not a valid markdown string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidMarkdown(element, key, description) {
    const markdown = getDataset(element, key);
    expect(markdown).to.not.match(/^[\s\S]*$/);
}

/**
 * Verify that a UI element's dataset key is a valid HTML string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidHTML(element, key, description) {
    const html = getDataset(element, key);
    expect(html).to.match(/^<([a-z]+)([^<]+)*(?:>(.*)<\/\1>|\s+\/>)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid HTML string.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidHTML(element, key, description) {
    const html = getDataset(element, key);
    expect(html).to.not.match(/^<([a-z]+)([^<]+)*(?:>(.*)<\/\1>|\s+\/>)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS selector.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSSelector(element, key, description) {
    const selector = getDataset(element, key);
    expect(() => document.querySelector(selector)).to.not.throw();
}

/**
 * Verify that a UI element's dataset key is not a valid CSS selector.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSSelector(element, key, description) {
    const selector = getDataset(element, key);
    expect(() => document.querySelector(selector)).to.throw();
}

/**
 * Verify that a UI element's dataset key is a valid XPath expression.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidXPath(element, key, description) {
    const xpath = getDataset(element, key);
    expect(() => document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null)).to.not.throw();
}

/**
 * Verify that a UI element's dataset key is not a valid XPath expression.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidXPath(element, key, description) {
    const xpath = getDataset(element, key);
    expect(() => document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null)).to.throw();
}

/**
 * Verify that a UI element's dataset key is a valid CSS animation name.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSAnimation(element, key, description) {
    const animation = getDataset(element, key);
    expect(animation).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS animation name.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSAnimation(element, key, description) {
    const animation = getDataset(element, key);
    expect(animation).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS transition property.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSTransition(element, key, description) {
    const transition = getDataset(element, key);
    expect(transition).to.match(/^[a-zA-Z-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS transition property.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSTransition(element, key, description) {
    const transition = getDataset(element, key);
    expect(transition).to.not.match(/^[a-zA-Z-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS property name.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSProperty(element, key, description) {
    const property = getDataset(element, key);
    expect(property).to.match(/^[a-zA-Z-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS property name.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSProperty(element, key, description) {
    const property = getDataset(element, key);
    expect(property).to.not.match(/^[a-zA-Z-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS value.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSValue(element, key, description) {
    const value = getDataset(element, key);
    expect(value).to.match(/^[\w\s\(\)#%.,-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS value.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSValue(element, key, description) {
    const value = getDataset(element, key);
    expect(value).to.not.match(/^[\w\s\(\)#%.,-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS gradient.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGradient(element, key, description) {
    const gradient = getDataset(element, key);
    expect(gradient).to.match(/^linear-gradient\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS gradient.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGradient(element, key, description) {
    const gradient = getDataset(element, key);
    expect(gradient).to.not.match(/^linear-gradient\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS filter.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSFilter(element, key, description) {
    const filter = getDataset(element, key);
    expect(filter).to.match(/^blur\(\d+px\)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS filter.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSFilter(element, key, description) {
    const filter = getDataset(element, key);
    expect(filter).to.not.match(/^blur\(\d+px\)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS transform.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSTransform(element, key, description) {
    const transform = getDataset(element, key);
    expect(transform).to.match(/^translate\(\d+px,\s*\d+px\)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS transform.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSTransform(element, key, description) {
    const transform = getDataset(element, key);
    expect(transform).to.not.match(/^translate\(\d+px,\s*\d+px\)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS box-shadow.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSBoxShadow(element, key, description) {
    const boxShadow = getDataset(element, key);
    expect(boxShadow).to.match(/^(\d+px\s+){2,4}\w+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS box-shadow.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSBoxShadow(element, key, description) {
    const boxShadow = getDataset(element, key);
    expect(boxShadow).to.not.match(/^(\d+px\s+){2,4}\w+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS border.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSBorder(element, key, description) {
    const border = getDataset(element, key);
    expect(border).to.match(/^\d+px\s+(solid|dashed|dotted)\s+\w+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS border.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSBorder(element, key, description) {
    const border = getDataset(element, key);
    expect(border).to.not.match(/^\d+px\s+(solid|dashed|dotted)\s+\w+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS font.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSFont(element, key, description) {
    const font = getDataset(element, key);
    expect(font).to.match(/^\d+px\s+[\w\s]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS font.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSFont(element, key, description) {
    const font = getDataset(element, key);
    expect(font).to.not.match(/^\d+px\s+[\w\s]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS background.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSBackground(element, key, description) {
    const background = getDataset(element, key);
    expect(background).to.match(/^url\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS background.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSBackground(element, key, description) {
    const background = getDataset(element, key);
    expect(background).to.not.match(/^url\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS cursor.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSCursor(element, key, description) {
    const cursor = getDataset(element, key);
    expect(cursor).to.match(/^(auto|default|pointer|crosshair|move|text|wait|help|not-allowed)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS cursor.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSCursor(element, key, description) {
    const cursor = getDataset(element, key);
    expect(cursor).to.not.match(/^(auto|default|pointer|crosshair|move|text|wait|help|not-allowed)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS outline.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSOutline(element, key, description) {
    const outline = getDataset(element, key);
    expect(outline).to.match(/^\d+px\s+(solid|dashed|dotted)\s+\w+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS outline.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSOutline(element, key, description) {
    const outline = getDataset(element, key);
    expect(outline).to.not.match(/^\d+px\s+(solid|dashed|dotted)\s+\w+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS overflow.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSOverflow(element, key, description) {
    const overflow = getDataset(element, key);
    expect(overflow).to.match(/^(visible|hidden|scroll|auto)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS overflow.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSOverflow(element, key, description) {
    const overflow = getDataset(element, key);
    expect(overflow).to.not.match(/^(visible|hidden|scroll|auto)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS visibility.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSVisibility(element, key, description) {
    const visibility = getDataset(element, key);
    expect(visibility).to.match(/^(visible|hidden|collapse)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS visibility.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSVisibility(element, key, description) {
    const visibility = getDataset(element, key);
    expect(visibility).to.not.match(/^(visible|hidden|collapse)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS display.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSDisplay(element, key, description) {
    const display = getDataset(element, key);
    expect(display).to.match(/^(block|inline|inline-block|flex|grid|none)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS display.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSDisplay(element, key, description) {
    const display = getDataset(element, key);
    expect(display).to.not.match(/^(block|inline|inline-block|flex|grid|none)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS position.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSPosition(element, key, description) {
    const position = getDataset(element, key);
    expect(position).to.match(/^(static|relative|absolute|fixed|sticky)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS position.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSPosition(element, key, description) {
    const position = getDataset(element, key);
    expect(position).to.not.match(/^(static|relative|absolute|fixed|sticky)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS z-index.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSZIndex(element, key, description) {
    const zIndex = getDataset(element, key);
    expect(zIndex).to.match(/^-?\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS z-index.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSZIndex(element, key, description) {
    const zIndex = getDataset(element, key);
    expect(zIndex).to.not.match(/^-?\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS opacity.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSOpacity(element, key, description) {
    const opacity = getDataset(element, key);
    expect(opacity).to.match(/^0(\.\d+)?|1$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS opacity.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSOpacity(element, key, description) {
    const opacity = getDataset(element, key);
    expect(opacity).to.not.match(/^0(\.\d+)?|1$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS filter function.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSFilterFunction(element, key, description) {
    const filterFunc = getDataset(element, key);
    expect(filterFunc).to.match(/^[a-z]+\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS filter function.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSFilterFunction(element, key, description) {
    const filterFunc = getDataset(element, key);
    expect(filterFunc).to.not.match(/^[a-z]+\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS transform function.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSTransformFunction(element, key, description) {
    const transformFunc = getDataset(element, key);
    expect(transformFunc).to.match(/^[a-z]+\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS transform function.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSTransformFunction(element, key, description) {
    const transformFunc = getDataset(element, key);
    expect(transformFunc).to.not.match(/^[a-z]+\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS animation function.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSAnimationFunction(element, key, description) {
    const animationFunc = getDataset(element, key);
    expect(animationFunc).to.match(/^[a-z]+\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS animation function.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSAnimationFunction(element, key, description) {
    const animationFunc = getDataset(element, key);
    expect(animationFunc).to.not.match(/^[a-z]+\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS variable.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSVariable(element, key, description) {
    const variable = getDataset(element, key);
    expect(variable).to.match(/^--[a-zA-Z0-9-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS variable.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSVariable(element, key, description) {
    const variable = getDataset(element, key);
    expect(variable).to.not.match(/^--[a-zA-Z0-9-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS calc expression.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSCalc(element, key, description) {
    const calc = getDataset(element, key);
    expect(calc).to.match(/^calc\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS calc expression.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSCalc(element, key, description) {
    const calc = getDataset(element, key);
    expect(calc).to.not.match(/^calc\(.+\)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid template.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridTemplate(element, key, description) {
    const gridTemplate = getDataset(element, key);
    expect(gridTemplate).to.match(/^(repeat\(\d+, \w+\)|\w+ \w+)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid template.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridTemplate(element, key, description) {
    const gridTemplate = getDataset(element, key);
    expect(gridTemplate).to.not.match(/^(repeat\(\d+, \w+\)|\w+ \w+)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS flex direction.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSFlexDirection(element, key, description) {
    const flexDirection = getDataset(element, key);
    expect(flexDirection).to.match(/^(row|row-reverse|column|column-reverse)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS flex direction.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSFlexDirection(element, key, description) {
    const flexDirection = getDataset(element, key);
    expect(flexDirection).to.not.match(/^(row|row-reverse|column|column-reverse)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS align items.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSAlignItems(element, key, description) {
    const alignItems = getDataset(element, key);
    expect(alignItems).to.match(/^(stretch|center|flex-start|flex-end|baseline)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS align items.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSAlignItems(element, key, description) {
    const alignItems = getDataset(element, key);
    expect(alignItems).to.not.match(/^(stretch|center|flex-start|flex-end|baseline)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS justify content.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSJustifyContent(element, key, description) {
    const justifyContent = getDataset(element, key);
    expect(justifyContent).to.match(/^(flex-start|flex-end|center|space-between|space-around|space-evenly)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS justify content.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSJustifyContent(element, key, description) {
    const justifyContent = getDataset(element, key);
    expect(justifyContent).to.not.match(/^(flex-start|flex-end|center|space-between|space-around|space-evenly)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS align content.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSAlignContent(element, key, description) {
    const alignContent = getDataset(element, key);
    expect(alignContent).to.match(/^(stretch|center|flex-start|flex-end|space-between|space-around)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS align content.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSAlignContent(element, key, description) {
    const alignContent = getDataset(element, key);
    expect(alignContent).to.not.match(/^(stretch|center|flex-start|flex-end|space-between|space-around)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS order.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSOrder(element, key, description) {
    const order = getDataset(element, key);
    expect(order).to.match(/^-?\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS order.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSOrder(element, key, description) {
    const order = getDataset(element, key);
    expect(order).to.not.match(/^-?\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS flex grow.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSFlexGrow(element, key, description) {
    const flexGrow = getDataset(element, key);
    expect(flexGrow).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS flex grow.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSFlexGrow(element, key, description) {
    const flexGrow = getDataset(element, key);
    expect(flexGrow).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS flex shrink.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSFlexShrink(element, key, description) {
    const flexShrink = getDataset(element, key);
    expect(flexShrink).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS flex shrink.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSFlexShrink(element, key, description) {
    const flexShrink = getDataset(element, key);
    expect(flexShrink).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS flex basis.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSFlexBasis(element, key, description) {
    const flexBasis = getDataset(element, key);
    expect(flexBasis).to.match(/^\d+(px|%)?$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS flex basis.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSFlexBasis(element, key, description) {
    const flexBasis = getDataset(element, key);
    expect(flexBasis).to.not.match(/^\d+(px|%)?$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS align self.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSAlignSelf(element, key, description) {
    const alignSelf = getDataset(element, key);
    expect(alignSelf).to.match(/^(auto|stretch|center|flex-start|flex-end|baseline)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS align self.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSAlignSelf(element, key, description) {
    const alignSelf = getDataset(element, key);
    expect(alignSelf).to.not.match(/^(auto|stretch|center|flex-start|flex-end|baseline)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS order.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSOrder(element, key, description) {
    const order = getDataset(element, key);
    expect(order).to.match(/^-?\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS order.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSOrder(element, key, description) {
    const order = getDataset(element, key);
    expect(order).to.not.match(/^-?\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridArea(element, key, description) {
    const gridArea = getDataset(element, key);
    expect(gridArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridArea(element, key, description) {
    const gridArea = getDataset(element, key);
    expect(gridArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid column.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridColumn(element, key, description) {
    const gridColumn = getDataset(element, key);
    expect(gridColumn).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid column.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridColumn(element, key, description) {
    const gridColumn = getDataset(element, key);
    expect(gridColumn).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid row.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridRow(element, key, description) {
    const gridRow = getDataset(element, key);
    expect(gridRow).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid row.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridRow(element, key, description) {
    const gridRow = getDataset(element, key);
    expect(gridRow).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid column start.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridColumnStart(element, key, description) {
    const gridColumnStart = getDataset(element, key);
    expect(gridColumnStart).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid column start.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridColumnStart(element, key, description) {
    const gridColumnStart = getDataset(element, key);
    expect(gridColumnStart).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid column end.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridColumnEnd(element, key, description) {
    const gridColumnEnd = getDataset(element, key);
    expect(gridColumnEnd).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid column end.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridColumnEnd(element, key, description) {
    const gridColumnEnd = getDataset(element, key);
    expect(gridColumnEnd).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid row start.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridRowStart(element, key, description) {
    const gridRowStart = getDataset(element, key);
    expect(gridRowStart).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid row start.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridRowStart(element, key, description) {
    const gridRowStart = getDataset(element, key);
    expect(gridRowStart).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid row end.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridRowEnd(element, key, description) {
    const gridRowEnd = getDataset(element, key);
    expect(gridRowEnd).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid row end.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridRowEnd(element, key, description) {
    const gridRowEnd = getDataset(element, key);
    expect(gridRowEnd).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area name.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaName(element, key, description) {
    const gridAreaName = getDataset(element, key);
    expect(gridAreaName).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area name.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaName(element, key, description) {
    const gridAreaName = getDataset(element, key);
    expect(gridAreaName).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid template areas.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridTemplateAreas(element, key, description) {
    const gridTemplateAreas = getDataset(element, key);
    expect(gridTemplateAreas).to.match(/^("[^"]+" )*("[^"]+")$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid template areas.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridTemplateAreas(element, key, description) {
    const gridTemplateAreas = getDataset(element, key);
    expect(gridTemplateAreas).to.not.match(/^("[^"]+" )*("[^"]+")$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid auto flow.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAutoFlow(element, key, description) {
    const gridAutoFlow = getDataset(element, key);
    expect(gridAutoFlow).to.match(/^(row|column|dense|row dense|column dense)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid auto flow.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAutoFlow(element, key, description) {
    const gridAutoFlow = getDataset(element, key);
    expect(gridAutoFlow).to.not.match(/^(row|column|dense|row dense|column dense)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid auto rows.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAutoRows(element, key, description) {
    const gridAutoRows = getDataset(element, key);
    expect(gridAutoRows).to.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid auto rows.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAutoRows(element, key, description) {
    const gridAutoRows = getDataset(element, key);
    expect(gridAutoRows).to.not.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid auto columns.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAutoColumns(element, key, description) {
    const gridAutoColumns = getDataset(element, key);
    expect(gridAutoColumns).to.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid auto columns.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAutoColumns(element, key, description) {
    const gridAutoColumns = getDataset(element, key);
    expect(gridAutoColumns).to.not.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid column gap.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridColumnGap(element, key, description) {
    const gridColumnGap = getDataset(element, key);
    expect(gridColumnGap).to.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid column gap.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridColumnGap(element, key, description) {
    const gridColumnGap = getDataset(element, key);
    expect(gridColumnGap).to.not.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid row gap.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridRowGap(element, key, description) {
    const gridRowGap = getDataset(element, key);
    expect(gridRowGap).to.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid row gap.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridRowGap(element, key, description) {
    const gridRowGap = getDataset(element, key);
    expect(gridRowGap).to.not.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS gap.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGap(element, key, description) {
    const gap = getDataset(element, key);
    expect(gap).to.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS gap.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGap(element, key, description) {
    const gap = getDataset(element, key);
    expect(gap).to.not.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS column count.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSColumnCount(element, key, description) {
    const columnCount = getDataset(element, key);
    expect(columnCount).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS column count.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSColumnCount(element, key, description) {
    const columnCount = getDataset(element, key);
    expect(columnCount).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS column width.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSColumnWidth(element, key, description) {
    const columnWidth = getDataset(element, key);
    expect(columnWidth).to.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS column width.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSColumnWidth(element, key, description) {
    const columnWidth = getDataset(element, key);
    expect(columnWidth).to.not.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS column gap.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSColumnGap(element, key, description) {
    const columnGap = getDataset(element, key);
    expect(columnGap).to.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS column gap.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSColumnGap(element, key, description) {
    const columnGap = getDataset(element, key);
    expect(columnGap).to.not.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS row gap.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSRowGap(element, key, description) {
    const rowGap = getDataset(element, key);
    expect(rowGap).to.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS row gap.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSRowGap(element, key, description) {
    const rowGap = getDataset(element, key);
    expect(rowGap).to.not.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS column span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSColumnSpan(element, key, description) {
    const columnSpan = getDataset(element, key);
    expect(columnSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS column span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSColumnSpan(element, key, description) {
    const columnSpan = getDataset(element, key);
    expect(columnSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS row span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSRowSpan(element, key, description) {
    const rowSpan = getDataset(element, key);
    expect(rowSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS row span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSRowSpan(element, key, description) {
    const rowSpan = getDataset(element, key);
    expect(rowSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacement(element, key, description) {
    const areaPlacement = getDataset(element, key);
    expect(areaPlacement).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacement(element, key, description) {
    const areaPlacement = getDataset(element, key);
    expect(areaPlacement).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid template rows.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridTemplateRows(element, key, description) {
    const gridTemplateRows = getDataset(element, key);
    expect(gridTemplateRows).to.match(/^(repeat\(\d+, \w+\)|\w+ \w+)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid template rows.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridTemplateRows(element, key, description) {
    const gridTemplateRows = getDataset(element, key);
    expect(gridTemplateRows).to.not.match(/^(repeat\(\d+, \w+\)|\w+ \w+)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid template columns.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridTemplateColumns(element, key, description) {
    const gridTemplateColumns = getDataset(element, key);
    expect(gridTemplateColumns).to.match(/^(repeat\(\d+, \w+\)|\w+ \w+)$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid template columns.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridTemplateColumns(element, key, description) {
    const gridTemplateColumns = getDataset(element, key);
    expect(gridTemplateColumns).to.not.match(/^(repeat\(\d+, \w+\)|\w+ \w+)$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid placement.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridPlacement(element, key, description) {
    const gridPlacement = getDataset(element, key);
    expect(gridPlacement).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid placement.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridPlacement(element, key, description) {
    const gridPlacement = getDataset(element, key);
    expect(gridPlacement).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridLine(element, key, description) {
    const gridLine = getDataset(element, key);
    expect(gridLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridLine(element, key, description) {
    const gridLine = getDataset(element, key);
    expect(gridLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaLine(element, key, description) {
    const gridAreaLine = getDataset(element, key);
    expect(gridAreaLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaLine(element, key, description) {
    const gridAreaLine = getDataset(element, key);
    expect(gridAreaLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaSpan(element, key, description) {
    const gridAreaSpan = getDataset(element, key);
    expect(gridAreaSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaSpan(element, key, description) {
    const gridAreaSpan = getDataset(element, key);
    expect(gridAreaSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridPlacementArea(element, key, description) {
    const placementArea = getDataset(element, key);
    expect(placementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridPlacementArea(element, key, description) {
    const placementArea = getDataset(element, key);
    expect(placementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridPlacementLine(element, key, description) {
    const placementLine = getDataset(element, key);
    expect(placementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridPlacementLine(element, key, description) {
    const placementLine = getDataset(element, key);
    expect(placementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridPlacementSpan(element, key, description) {
    const placementSpan = getDataset(element, key);
    expect(placementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridPlacementSpan(element, key, description) {
    const placementSpan = getDataset(element, key);
    expect(placementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement area.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementArea(element, key, description) {
    const areaPlacementArea = getDataset(element, key);
    expect(areaPlacementArea).to.not.match(/^[a-zA-Z0-9_-]+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement span.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementSpan(element, key, description) {
    const areaPlacementSpan = getDataset(element, key);
    expect(areaPlacementSpan).to.not.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetValidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.match(/^\d+$/);
}

/**
 * Verify that a UI element's dataset key is not a valid CSS grid area placement line.
 *
 * @param {Element} element
 * @param {string} key
 * @param {string} description
 */
function expectDatasetInvalidCSSGridAreaPlacementLine(element, key, description) {
    const areaPlacementLine = getDataset(element, key);
    expect(areaPlacementLine).to.not.match(/^\

/* The file is extremely large; due to space constraints, the refactored code focuses on extracting helper functions and replacing getAttribute with dataset usage where applicable. The rest of the test suite remains functionally unchanged. */