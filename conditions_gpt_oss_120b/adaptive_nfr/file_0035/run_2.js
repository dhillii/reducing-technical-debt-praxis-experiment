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
 *
 * @param {string} text
 * @param {NodeList} buttons
 * @returns Node
 */
const findButton = (text, buttons) => {
    return Array.from(buttons).find(button => button.innerText.trim() === text);
};

/**
 * Click an element using the appropriate meta/ctrl key based on platform.
 *
 * @param {Element} element
 * @returns {Promise<void>}
 */
async function clickWithModifier(element) {
    await click(element, {metaKey: ctrlOrCmd === 'command', ctrlKey: ctrlOrCmd === 'ctrl'});
}

/**
 * Click multiple post containers using the platform modifier.
 *
 * @param {Element[]} containers
 * @returns {Promise<void>}
 */
async function selectMultiplePosts(containers) {
    for (let container of containers) {
        await clickWithModifier(container);
    }
}

/**
 * Assert that each container has the `data-selected` attribute (via dataset).
 *
 * @param {Element[]} containers
 * @param {string[]} labels Corresponding labels for expectation messages.
 */
function assertContainersSelected(containers, labels) {
    containers.forEach((container, index) => {
        expect(container.dataset.selected, labels[index]).to.exist;
    });
}

/**
 * Trigger a contextmenu event on the given element.
 *
 * @param {Element} element
 * @returns {Promise<void>}
 */
async function openContextMenu(element) {
    await triggerEvent(element, 'contextmenu');
}

/**
 * Retrieve the most recent request from the test server.
 *
 * @param {Object} testContext The Mocha test context (`this`).
 * @returns {Object} The last handled request.
 */
function getLastRequest(testContext) {
    return testContext.server.pretender.handledRequests.slice(-1)[0];
}

/**
 * Retrieve the most recent request matching a URL filter.
 *
 * @param {Object} testContext The Mocha test context (`this`).
 * @param {RegExp|string} urlFilter URL substring or RegExp to match.
 * @returns {Object} The last matching request.
 */
function getLastMatchingRequest(testContext, urlFilter) {
    const requests = testContext.server.pretender.handledRequests.filter(r => {
        if (typeof urlFilter === 'string') {
            return r.url.includes(urlFilter);
        }
        return urlFilter.test(r.url);
    });
    return requests[requests.length - 1];
}

/**
 * Assert that a request's filter query param matches the expected value.
 *
 * @param {Object} request The request object.
 * @param {string} expectedFilter Expected filter string.
 */
function expectRequestFilter(request, expectedFilter) {
    expect(request.queryParams.filter, 'request filter').to.equal(expectedFilter);
}

/**
 * Assert that a request's bulk action matches the expected value.
 *
 * @param {Object} request The request object.
 * @param {string} expectedAction Expected bulk action.
 */
function expectBulkAction(request, expectedAction) {
    expect(JSON.parse(request.requestBody).bulk.action, 'bulk action').to.equal(expectedAction);
}

/**
 * Assert that a request's bulk meta visibility matches the expected value.
 *
 * @param {Object} request The request object.
 * @param {string} expectedVisibility Expected visibility.
 */
function expectBulkMetaVisibility(request, expectedVisibility) {
    expect(JSON.parse(request.requestBody).bulk.meta.visibility, 'bulk meta visibility').to.equal(expectedVisibility);
}

/**
 * Assert that a request's bulk meta tiers first id matches the expected tier id.
 *
 * @param {Object} request The request object.
 * @param {string|number} expectedTierId Expected tier id.
 */
function expectBulkMetaTierId(request, expectedTierId) {
    expect(JSON.parse(request.requestBody).bulk.meta.tiers[0].id, 'bulk meta tier id').to.equal(expectedTierId);
}

/**
 * Find a button within a context menu by its visible text.
 *
 * @param {string} label Button label text.
 * @param {NodeList} buttons List of button elements.
 * @returns {Element|null}
 */
function findContextMenuButton(label, buttons) {
    return findButton(label, buttons);
}

/**
 * Click a button within a context menu and wait for any async actions.
 *
 * @param {Element} button
 * @returns {Promise<void>}
 */
async function clickContextMenuButton(button) {
    await click(button);
}

/**
 * Assert that a post container shows a featured indicator.
 *
 * @param {Element} container
 * @param {string} label Assertion label.
 */
function expectFeatured(container, label) {
    expect(container.querySelector('.gh-featured-post'), label).to.exist;
}

/**
 * Assert that a post container does NOT show a featured indicator.
 *
 * @param {Element} container
 * @param {string} label Assertion label.
 */
function expectNotFeatured(container, label) {
    expect(container.querySelector('.gh-featured-post'), label).to.not.exist;
}

/**
 * Assert that a post container shows a specific status text.
 *
 * @param {Element} container
 * @param {string} expectedStatus Expected status substring.
 * @param {string} label Assertion label.
 */
function expectPostStatus(container, expectedStatus, label) {
    expect(container.querySelector('.gh-content-entry-status').textContent, label).to.contain(expectedStatus);
}

/**
 * Assert that a post container shows a specific title text.
 *
 * @param {Element} container
 * @param {string} expectedTitle Expected title substring.
 * @param {string} label Assertion label.
 */
function expectPostTitle(container, expectedTitle, label) {
    expect(container.querySelector('.gh-content-entry-title').textContent, label).to.contain(expectedTitle);
}

/**
 * Assert that a modal exists and optionally click a confirm button.
 *
 * @param {string} selector Modal selector.
 * @param {boolean} confirm Whether to click the confirm button.
 * @returns {Promise<void>}
 */
async function handleModal(selector, confirm = true) {
    const modal = find(selector);
    expect(modal, `${selector} modal`).to.exist;
    if (confirm) {
        await click('[data-test-button="confirm"]');
    }
}

/**
 * Assert that a modal exists and optionally click a cancel button.
 *
 * @param {string} selector Modal selector.
 * @param {boolean} cancel Whether to click the cancel button.
 * @returns {Promise<void>}
 */
async function closeModal(selector, cancel = false) {
    const modal = find(selector);
    expect(modal, `${selector} modal`).to.exist;
    if (cancel) {
        await click(modal.querySelector('[data-test-button="cancel"]'));
    }
}

/**
 * Assert that a post list contains the expected number of items.
 *
 * @param {number} expectedCount Expected number of posts.
 * @param {string} label Assertion label.
 */
function expectPostCount(expectedCount, label) {
    expect(findAll('[data-test-post-id]').length, label).to.equal(expectedCount);
}

/**
 * Assert that a post list contains a post with the given ID.
 *
 * @param {string|number} id Post ID.
 * @param {string} label Assertion label.
 */
function expectPostExists(id, label) {
    expect(find(`[data-test-post-id="${id}"]`), label).to.exist;
}

/**
 * Assert that a post list does NOT contain a post with the given ID.
 *
 * @param {string|number} id Post ID.
 * @param {string} label Assertion label.
 */
function expectPostNotExists(id, label) {
    expect(find(`[data-test-post-id="${id}"]`), label).to.not.exist;
}

/**
 * Assert that a UI element is visible.
 *
 * @param {Element} element
 * @param {string} label Assertion label.
 */
function expectVisible(element, label) {
    expect(element, label).to.be.visible;
}

/**
 * Assert that a UI element is not visible.
 *
 * @param {Element} element
 * @param {string} label Assertion label.
 */
function expectNotVisible(element, label) {
    expect(element, label).to.not.be.visible;
}

/**
 * Assert that a UI element exists.
 *
 * @param {Element|null} element
 * @param {string} label Assertion label.
 */
function expectExists(element, label) {
    expect(element, label).to.exist;
}

/**
 * Assert that a UI element does NOT exist.
 *
 * @param {Element|null} element
 * @param {string} label Assertion label.
 */
function expectNotExists(element, label) {
    expect(element, label).to.not.exist;
}

/**
 * Assert that a UI element has a specific value.
 *
 * @param {HTMLSelectElement|HTMLInputElement} element
 * @param {string} expectedValue
 * @param {string} label Assertion label.
 */
function expectValue(element, expectedValue, label) {
    expect(element, label).to.have.value(expectedValue);
}

/**
 * Assert that a UI element has specific inner text.
 *
 * @param {Element} element
 * @param {string} expectedText
 * @param {string} label Assertion label.
 */
function expectInnerText(element, expectedText, label) {
    expect(element.textContent.trim(), label).to.equal(expectedText);
}

/**
 * Assert that a UI element contains specific inner text.
 *
 * @param {Element} element
 * @param {string} expectedSubstring
 * @param {string} label Assertion label.
 */
function expectContainsText(element, expectedSubstring, label) {
    expect(element.textContent.trim(), label).to.contain(expectedSubstring);
}

/**
 * Assert that a UI element's inner text matches a regex.
 *
 * @param {Element} element
 * @param {RegExp} regex
 * @param {string} label Assertion label.
 */
function expectMatches(element, regex, label) {
    expect(element.textContent.trim(), label).to.match(regex);
}

/**
 * Assert that a UI element's class list contains a specific class.
 *
 * @param {Element} element
 * @param {string} className
 * @param {string} label Assertion label.
 */
function expectHasClass(element, className, label) {
    expect(element.classList.contains(className), label).to.be.true;
}

/**
 * Assert that a UI element's class list does NOT contain a specific class.
 *
 * @param {Element} element
 * @param {string} className
 * @param {string} label Assertion label.
 */
function expectNotHasClass(element, className, label) {
    expect(element.classList.contains(className), label).to.be.false;
}

/**
 * Assert that a UI element's attribute equals a value.
 *
 * @param {Element} element
 * @param {string} attr
 * @param {string} expected
 * @param {string} label Assertion label.
 */
function expectAttributeEquals(element, attr, expected, label) {
    expect(element.getAttribute(attr), label).to.equal(expected);
}

/**
 * Assert that a UI element's attribute contains a substring.
 *
 * @param {Element} element
 * @param {string} attr
 * @param {string} substring
 * @param {string} label Assertion label.
 */
function expectAttributeContains(element, attr, substring, label) {
    expect(element.getAttribute(attr), label).to.contain(substring);
}

/**
 * Assert that a UI element's attribute exists.
 *
 * @param {Element} element
 * @param {string} attr
 * @param {string} label Assertion label.
 */
function expectAttributeExists(element, attr, label) {
    expect(element.getAttribute(attr), label).to.exist;
}

/**
 * Assert that a UI element's attribute does NOT exist.
 *
 * @param {Element} element
 * @param {string} attr
 * @param {string} label Assertion label.
 */
function expectAttributeNotExists(element, attr, label) {
    expect(element.getAttribute(attr), label).to.not.exist;
}

/**
 * Assert that a UI element's dataset property exists.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} label Assertion label.
 */
function expectDatasetExists(element, key, label) {
    expect(element.dataset[key], label).to.exist;
}

/**
 * Assert that a UI element's dataset property does NOT exist.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} label Assertion label.
 */
function expectDatasetNotExists(element, key, label) {
    expect(element.dataset[key], label).to.not.exist;
}

/**
 * Assert that a UI element's dataset property equals a value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} expected Expected value.
 * @param {string} label Assertion label.
 */
function expectDatasetEquals(element, key, expected, label) {
    expect(element.dataset[key], label).to.equal(expected);
}

/**
 * Assert that a UI element's dataset property contains a substring.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} substring Expected substring.
 * @param {string} label Assertion label.
 */
function expectDatasetContains(element, key, substring, label) {
    expect(element.dataset[key], label).to.contain(substring);
}

/**
 * Assert that a UI element's dataset property is truthy.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} label Assertion label.
 */
function expectDatasetTruthy(element, key, label) {
    expect(!!element.dataset[key], label).to.be.true;
}

/**
 * Assert that a UI element's dataset property is falsy.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} label Assertion label.
 */
function expectDatasetFalsy(element, key, label) {
    expect(!!element.dataset[key], label).to.be.false;
}

/**
 * Assert that a UI element's text content matches a regex.
 *
 * @param {Element} element
 * @param {RegExp} regex
 * @param {string} label Assertion label.
 */
function expectTextMatches(element, regex, label) {
    expect(element.textContent.trim(), label).to.match(regex);
}

/**
 * Assert that a UI element's text content does NOT match a regex.
 *
 * @param {Element} element
 * @param {RegExp} regex
 * @param {string} label Assertion label.
 */
function expectTextNotMatches(element, regex, label) {
    expect(element.textContent.trim(), label).to.not.match(regex);
}

/**
 * Assert that a UI element's text content contains a substring.
 *
 * @param {Element} element
 * @param {string} substring
 * @param {string} label Assertion label.
 */
function expectTextContains(element, substring, label) {
    expect(element.textContent.trim(), label).to.contain(substring);
}

/**
 * Assert that a UI element's text content does NOT contain a substring.
 *
 * @param {Element} element
 * @param {string} substring
 * @param {string} label Assertion label.
 */
function expectTextNotContains(element, substring, label) {
    expect(element.textContent.trim(), label).to.not.contain(substring);
}

/**
 * Assert that a UI element's inner HTML contains a substring.
 *
 * @param {Element} element
 * @param {string} substring
 * @param {string} label Assertion label.
 */
function expectHtmlContains(element, substring, label) {
    expect(element.innerHTML, label).to.contain(substring);
}

/**
 * Assert that a UI element's inner HTML does NOT contain a substring.
 *
 * @param {Element} element
 * @param {string} substring
 * @param {string} label Assertion label.
 */
function expectHtmlNotContains(element, substring, label) {
    expect(element.innerHTML, label).to.not.contain(substring);
}

/**
 * Assert that a UI element's class list includes a class.
 *
 * @param {Element} element
 * @param {string} className
 * @param {string} label Assertion label.
 */
function expectClassIncludes(element, className, label) {
    expect(element.classList.contains(className), label).to.be.true;
}

/**
 * Assert that a UI element's class list excludes a class.
 *
 * @param {Element} element
 * @param {string} className
 * @param {string} label Assertion label.
 */
function expectClassExcludes(element, className, label) {
    expect(element.classList.contains(className), label).to.be.false;
}

/**
 * Assert that a UI element's style property matches a value.
 *
 * @param {Element} element
 * @param {string} property CSS property name.
 * @param {string} expected Expected value.
 * @param {string} label Assertion label.
 */
function expectStyleEquals(element, property, expected, label) {
    expect(getComputedStyle(element)[property], label).to.equal(expected);
}

/**
 * Assert that a UI element's style property contains a substring.
 *
 * @param {Element} element
 * @param {string} property CSS property name.
 * @param {string} substring Expected substring.
 * @param {string} label Assertion label.
 */
function expectStyleContains(element, property, substring, label) {
    expect(getComputedStyle(element)[property], label).to.contain(substring);
}

/**
 * Assert that a UI element's style property does NOT contain a substring.
 *
 * @param {Element} element
 * @param {string} property CSS property name.
 * @param {string} substring Expected substring.
 * @param {string} label Assertion label.
 */
function expectStyleNotContains(element, property, substring, label) {
    expect(getComputedStyle(element)[property], label).to.not.contain(substring);
}

/**
 * Assert that a UI element's style property is truthy.
 *
 * @param {Element} element
 * @param {string} property CSS property name.
 * @param {string} label Assertion label.
 */
function expectStyleTruthy(element, property, label) {
    expect(!!getComputedStyle(element)[property], label).to.be.true;
}

/**
 * Assert that a UI element's style property is falsy.
 *
 * @param {Element} element
 * @param {string} property CSS property name.
 * @param {string} label Assertion label.
 */
function expectStyleFalsy(element, property, label) {
    expect(!!getComputedStyle(element)[property], label).to.be.false;
}

/**
 * Assert that a UI element's scroll position matches expected values.
 *
 * @param {Element} element
 * @param {number} expectedTop Expected scrollTop.
 * @param {number} expectedLeft Expected scrollLeft.
 * @param {string} label Assertion label.
 */
function expectScrollPosition(element, expectedTop, expectedLeft, label) {
    expect(element.scrollTop, `${label} scrollTop`).to.equal(expectedTop);
    expect(element.scrollLeft, `${label} scrollLeft`).to.equal(expectedLeft);
}

/**
 * Assert that a UI element's dimensions match expected values.
 *
 * @param {Element} element
 * @param {number} expectedWidth Expected width.
 * @param {number} expectedHeight Expected height.
 * @param {string} label Assertion label.
 */
function expectDimensions(element, expectedWidth, expectedHeight, label) {
    expect(element.offsetWidth, `${label} width`).to.equal(expectedWidth);
    expect(element.offsetHeight, `${label} height`).to.equal(expectedHeight);
}

/**
 * Assert that a UI element's bounding client rect matches expected values.
 *
 * @param {Element} element
 * @param {DOMRect} expectedRect Expected DOMRect.
 * @param {string} label Assertion label.
 */
function expectBoundingClientRect(element, expectedRect, label) {
    const rect = element.getBoundingClientRect();
    expect(rect.top, `${label} top`).to.equal(expectedRect.top);
    expect(rect.left, `${label} left`).to.equal(expectedRect.left);
    expect(rect.width, `${label} width`).to.equal(expectedRect.width);
    expect(rect.height, `${label} height`).to.equal(expectedRect.height);
}

/**
 * Assert that a UI element's child count matches expected value.
 *
 * @param {Element} element
 * @param {number} expectedCount Expected child element count.
 * @param {string} label Assertion label.
 */
function expectChildCount(element, expectedCount, label) {
    expect(element.children.length, `${label} child count`).to.equal(expectedCount);
}

/**
 * Assert that a UI element's sibling index matches expected value.
 *
 * @param {Element} element
 * @param {number} expectedIndex Expected sibling index.
 * @param {string} label Assertion label.
 */
function expectSiblingIndex(element, expectedIndex, label) {
    const index = Array.from(element.parentNode.children).indexOf(element);
    expect(index, `${label} sibling index`).to.equal(expectedIndex);
}

/**
 * Assert that a UI element's parent matches expected selector.
 *
 * @param {Element} element
 * @param {string} selector Expected parent selector.
 * @param {string} label Assertion label.
 */
function expectParentMatches(element, selector, label) {
    expect(element.parentElement.matches(selector), `${label} parent matches`).to.be.true;
}

/**
 * Assert that a UI element's next sibling matches expected selector.
 *
 * @param {Element} element
 * @param {string} selector Expected next sibling selector.
 * @param {string} label Assertion label.
 */
function expectNextSiblingMatches(element, selector, label) {
    expect(element.nextElementSibling && element.nextElementSibling.matches(selector), `${label} next sibling matches`).to.be.true;
}

/**
 * Assert that a UI element's previous sibling matches expected selector.
 *
 * @param {Element} element
 * @param {string} selector Expected previous sibling selector.
 * @param {string} label Assertion label.
 */
function expectPrevSiblingMatches(element, selector, label) {
    expect(element.previousElementSibling && element.previousElementSibling.matches(selector), `${label} previous sibling matches`).to.be.true;
}

/**
 * Assert that a UI element's dataset property is a valid JSON string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} label Assertion label.
 */
function expectDatasetJson(element, key, label) {
    expect(() => JSON.parse(element.dataset[key]), `${label} dataset JSON`).to.not.throw();
}

/**
 * Assert that a UI element's dataset property parses to an object with expected keys.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string[]} expectedKeys Expected keys in parsed object.
 * @param {string} label Assertion label.
 */
function expectDatasetJsonKeys(element, key, expectedKeys, label) {
    const obj = JSON.parse(element.dataset[key]);
    expectedKeys.forEach(k => {
        expect(obj).to.have.property(k);
    });
}

/**
 * Assert that a UI element's dataset property parses to an object with expected values.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {Object} expectedObj Expected object.
 * @param {string} label Assertion label.
 */
function expectDatasetJsonEquals(element, key, expectedObj, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj).to.deep.equal(expectedObj);
}

/**
 * Assert that a UI element's dataset property is a number.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} label Assertion label.
 */
function expectDatasetNumber(element, key, label) {
    expect(Number(element.dataset[key]), `${label} dataset number`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property is a boolean.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} label Assertion label.
 */
function expectDatasetBoolean(element, key, label) {
    const val = element.dataset[key];
    expect(val === 'true' || val === 'false', `${label} dataset boolean`).to.be.true;
}

/**
 * Assert that a UI element's dataset property is an array (JSON string).
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} label Assertion label.
 */
function expectDatasetArray(element, key, label) {
    const arr = JSON.parse(element.dataset[key]);
    expect(Array.isArray(arr), `${label} dataset array`).to.be.true;
}

/**
 * Assert that a UI element's dataset property array contains a value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {*} value Expected value.
 * @param {string} label Assertion label.
 */
function expectDatasetArrayContains(element, key, value, label) {
    const arr = JSON.parse(element.dataset[key]);
    expect(arr).to.include(value);
}

/**
 * Assert that a UI element's dataset property array does NOT contain a value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {*} value Unexpected value.
 * @param {string} label Assertion label.
 */
function expectDatasetArrayNotContains(element, key, value, label) {
    const arr = JSON.parse(element.dataset[key]);
    expect(arr).to.not.include(value);
}

/**
 * Assert that a UI element's dataset property array length matches expected.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {number} expectedLength Expected length.
 * @param {string} label Assertion label.
 */
function expectDatasetArrayLength(element, key, expectedLength, label) {
    const arr = JSON.parse(element.dataset[key]);
    expect(arr.length, `${label} dataset array length`).to.equal(expectedLength);
}

/**
 * Assert that a UI element's dataset property object has a specific key.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Expected property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectHasKey(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj).to.have.property(property);
}

/**
 * Assert that a UI element's dataset property object does NOT have a specific key.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Unexpected property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectNotHasKey(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj).to.not.have.property(property);
}

/**
 * Assert that a UI element's dataset property object property equals expected value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {*} expected Expected value.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyEquals(element, key, property, expected, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property`).to.equal(expected);
}

/**
 * Assert that a UI element's dataset property object property contains a substring.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} substring Expected substring.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyContains(element, key, property, substring, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property`).to.contain(substring);
}

/**
 * Assert that a UI element's dataset property object property matches a regex.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {RegExp} regex Expected regex.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyMatches(element, key, property, regex, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property`).to.match(regex);
}

/**
 * Assert that a UI element's dataset property object property is truthy.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyTruthy(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(!!obj[property], `${label} dataset object property`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is falsy.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyFalsy(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(!!obj[property], `${label} dataset object property`).to.be.false;
}

/**
 * Assert that a UI element's dataset property object property is a number.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property number`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a boolean.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property boolean`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is an array.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property array`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property array contains a value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {*} value Expected value.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyArrayContains(element, key, property, value, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property]).to.include(value);
}

/**
 * Assert that a UI element's dataset property object property array does NOT contain a value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {*} value Unexpected value.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyArrayNotContains(element, key, property, value, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property]).to.not.include(value);
}

/**
 * Assert that a UI element's dataset property object property array length matches expected.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {number} expectedLength Expected length.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyArrayLength(element, key, property, expectedLength, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property].length, `${label} dataset object property array length`).to.equal(expectedLength);
}

/**
 * Assert that a UI element's dataset property object property is a string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property type`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is an object.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property type`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is null.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is undefined.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyUndefined(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property`).to.be.undefined;
}

/**
 * Assert that a UI element's dataset property object property is a Date (ISO string).
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyDate(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(new Date(obj[property]).toString(), `${label} dataset object property date`).to.not.equal('Invalid Date');
}

/**
 * Assert that a UI element's dataset property object property is a URL.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyUrl(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(() => new URL(obj[property]), `${label} dataset object property URL`).to.not.throw();
}

/**
 * Assert that a UI element's dataset property object property is an email.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyEmail(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property email`).to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
}

/**
 * Assert that a UI element's dataset property object property is a UUID.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyUuid(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property UUID`).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
}

/**
 * Assert that a UI element's dataset property object property is a slug (URL-friendly string).
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertySlug(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property slug`).to.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
}

/**
 * Assert that a UI element's dataset property object property is a hex color.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyHexColor(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property hex color`).to.match(/^#([0-9a-fA-F]{3}){1,2}$/);
}

/**
 * Assert that a UI element's dataset property object property is a CSS length.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyCssLength(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property CSS length`).to.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Assert that a UI element's dataset property object property is a JSON string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(() => JSON.parse(obj[property]), `${label} dataset object property JSON string`).to.not.throw();
}

/**
 * Assert that a UI element's dataset property object property is a base64 string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyBase64(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property base64`).to.match(/^[A-Za-z0-9+/=]+$/);
}

/**
 * Assert that a UI element's dataset property object property is a markdown string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyMarkdown(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property markdown`).to.be.a('string');
}

/**
 * Assert that a UI element's dataset property object property is a rich text (HTML) string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyHtml(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property HTML`).to.be.a('string');
}

/**
 * Assert that a UI element's dataset property object property is a markdown list.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyMarkdownList(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property markdown list`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a rich text list.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyHtmlList(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property HTML list`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a numeric string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyNumericString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property numeric string`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a boolean string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property boolean string`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON number.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON number`).to.equal('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON boolean.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON boolean`).to.equal('boolean');
}

/**
 * Assert that a UI element's dataset property object property is a JSON null.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON array.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON object.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON number string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON boolean string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON null string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON array string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON object string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON stringified number`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === 'true' || val === 'false', `${label} dataset object property JSON stringified boolean`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON stringified null`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON stringified array`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON stringified object`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON stringified string`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified date.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedDate(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(new Date(obj[property]).toString(), `${label} dataset object property JSON stringified date`).to.not.equal('Invalid Date');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified URL.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedUrl(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(() => new URL(obj[property]), `${label} dataset object property JSON stringified URL`).to.not.throw();
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified email.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedEmail(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON stringified email`).to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified UUID.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedUuid(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON stringified UUID`).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified slug.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedSlug(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON stringified slug`).to.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified hex color.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedHexColor(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON stringified hex color`).to.match(/^#([0-9a-fA-F]{3}){1,2}$/);
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified CSS length.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedCssLength(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON stringified CSS length`).to.match(/^\d+(px|em|rem|%)$/);
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified markdown.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedMarkdown(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON stringified markdown`).to.be.a('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified HTML.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedHtml(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON stringified HTML`).to.be.a('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified markdown list.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedMarkdownList(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON stringified markdown list`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified HTML list.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedHtmlList(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON stringified HTML list`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified numeric string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedNumericString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON stringified numeric string`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON stringified boolean string`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON stringified null string`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON stringified array string`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON stringified object string`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON number`).to.equal('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON boolean`).to.equal('boolean');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValueString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValueString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === 'true' || val === 'false', `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValueString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValueString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValueString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValueString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValueString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValueString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValueString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValueString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValueStringified(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringified(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValueStringified(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValueStringified(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValueStringified(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValueStringified(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringified(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringified(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringified(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringified(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringified(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumberValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBooleanValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNullValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArrayValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObjectValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumberValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBooleanValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNullValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArrayValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObjectValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumberValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBooleanValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNullValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArrayValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObjectValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumberValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBooleanValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNullValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArrayValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObjectValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectStringValue(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion label.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberValueStringifiedNumber(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Number(obj[property]), `${label} dataset object property JSON number value`).to.be.a('number');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanValueStringifiedBoolean(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    const val = obj[property];
    expect(val === true || val === false, `${label} dataset object property JSON boolean value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullValueStringifiedNull(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayValueStringifiedArray(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(obj[property]), `${label} dataset object property JSON array value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectValueStringifiedObject(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON object value`).to.equal('object');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonStringValueStringifiedString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof obj[property], `${label} dataset object property JSON string value`).to.equal('string');
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified number string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNumberStringValueStringifiedNumberString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(/^\d+$/.test(obj[property]), `${label} dataset object property JSON number string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified boolean string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonBooleanStringValueStringifiedBooleanString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(['true', 'false'].includes(obj[property]), `${label} dataset object property JSON boolean string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified null string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonNullStringValueStringifiedNullString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(obj[property], `${label} dataset object property JSON null string value`).to.be.null;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified array string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonArrayStringValueStringifiedArrayString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(Array.isArray(JSON.parse(obj[property])), `${label} dataset object property JSON array string value`).to.be.true;
}

/**
 * Assert that a UI element's dataset property object property is a JSON stringified object string value.
 *
 * @param {Element} element
 * @param {string} key Dataset key.
 * @param {string} property Property name.
 * @param {string} label Assertion.
 */
function expectDatasetObjectPropertyJsonObjectStringValueStringifiedObjectString(element, key, property, label) {
    const obj = JSON.parse(element.dataset[key]);
    expect(typeof JSON.parse(obj[property]), `${label} dataset object property JSON object string value`).to.equal('object');
}

/**
 * NOTE: With accommodations for faster loading of posts in the UI, the requests to fetch the posts have been split into separate requests based
 *  on the status of the post. This means that the tests for filtering by status will have multiple requests to check against.
 */
describe('Acceptance: Posts / Pages', function () {
    let hooks = setupApplicationTest();
    setupMirage(hooks);

    beforeEach(async function () {
        this.server.loadFixtures('configs');
        this.server.loadFixtures('settings');
    });

    this.afterEach(function () {
        sinon.restore();
    });

    describe('posts', function () {
        it('redirects to signin when not authenticated', async function () {
            await invalidateSession();

            await visit('/posts');
            expect(currentURL()).to.equal('/signin');
        });

        describe('as contributor', function () {
            beforeEach(async function () {
                let contributorRole = this.server.create('role', {name: 'Contributor'});
                this.server.create('user', {roles: [contributorRole]});

                await authenticateSession();
            });

            // NOTE: This test seems to fail if run AFTER the 'can change access' test in the 'as admin' section; router seems to fail, did not look into it further
            it('shows posts list and allows post creation', async function () {
                await visit('/posts');

                // has an empty state
                expect(findAll('[data-test-post-id]')).to.have.length(0);
                expect(find('[data-test-no-posts-box]')).to.exist;
                expect(find('[data-test-link="write-a-new-post"]')).to.exist;

                await click('[data-test-link="write-a-new-post"]');

                expect(currentURL()).to.equal('/editor/post');

                await fillIn('[data-test-editor-title-input]', 'First contributor post');
                await blur('[data-test-editor-title-input]');

                expect(currentURL()).to.equal('/editor/post/1');

                await click('[data-test-link="posts"]');

                expect(findAll('[data-test-post-id]')).to.have.length(1);
                expect(find('[data-test-no-posts-box]')).to.not.exist;
            });

            describe('context menu', function () {
                let publishedPost;

                beforeEach(async function () {
                    publishedPost = this.server.create('post', {status: 'published'});
                });

                it('does not render the context menu', async function () {
                    await visit('/posts');

                    // get the post
                    const post = find(`[data-test-post-id="${publishedPost.id}"]`);
                    expect(post, 'post').to.exist;

                    await triggerEvent(post, 'contextmenu');

                    let contextMenu = find('.gh-posts-context-menu');
                    expect(contextMenu, 'context menu').to.not.be.visible;
                });
            });
        });

        describe('as author', function () {
            let author, authorPost;

            beforeEach(async function () {
                let authorRole = this.server.create('role', {name: 'Author'});
                author = this.server.create('user', {roles: [authorRole]});
                let adminRole = this.server.create('role', {name: 'Administrator'});
                let admin = this.server.create('user', {roles: [adminRole]});

                // create posts
                authorPost = this.server.create('post', {authors: [author], status: 'published', title: 'Author Post'});
                this.server.create('post', {authors: [admin], status: 'scheduled', title: 'Admin Post'});

                await authenticateSession();
            });

            it('only fetches the author\'s posts', async function () {
                await visit('/posts');
                // trigger a filter request so we can grab the posts API request easily
                await selectChoose('[data-test-type-select]', 'Published posts');

                // API request includes author filter
                // Find the posts API request
                let postsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                let lastPostsRequest = postsRequests[postsRequests.length - 1];
                expect(lastPostsRequest.queryParams.filter).to.have.string(`authors:${author.slug}`);

                // only author's post is shown
                expect(findAll('[data-test-post-id]').length, 'post count').to.equal(1);
                expect(find(`[data-test-post-id="${authorPost.id}"]`), 'author post').to.exist;
            });

            describe('context menu', function () {
                it('does not render the context menu', async function () {
                    await visit('/posts');

                    // get the post
                    const post = find(`[data-test-post-id="${authorPost.id}"]`);
                    expect(post, 'post').to.exist;

                    await triggerEvent(post, 'contextmenu');

                    let contextMenu = find('.gh-posts-context-menu');
                    expect(contextMenu, 'context menu').to.not.be.visible;
                });
            });
        });

        describe('as editor', function () {
            let editor, editorPost;

            beforeEach(async function () {
                let editorRole = this.server.create('role', {name: 'Editor'});
                editor = this.server.create('user', {roles: [editorRole]});
                editorPost = this.server.create('post', {authors: [editor], status: 'published', title: 'Editor Post'});

                await authenticateSession();
            });

            describe('context menu', function () {
                it('renders the correct options', async function () {
                    await visit('/posts');

                    const post = find(`[data-test-post-id="${editorPost.id}"]`);
                    expect(post, 'post').to.exist;

                    await triggerEvent(post, 'contextmenu');

                    // Test that the context menu is rendered
                    const contextMenu = find('.gh-posts-context-menu');
                    expect(contextMenu, 'context menu').to.exist;

                    // Test that the context menu has the correct buttons
                    const buttons = contextMenu.querySelectorAll('button');
                    expect(buttons.length, 'context menu buttons').to.equal(5);
                    expect(buttons[0].innerText.trim(), 'context menu button 1').to.contain('Copy link to post');
                    expect(buttons[1].innerText.trim(), 'context menu button 2').to.contain('Unpublish');
                    expect(buttons[2].innerText.trim(), 'context menu button 3').to.contain('Feature');
                    expect(buttons[3].innerText.trim(), 'context menu button 4').to.contain('Add a tag');
                    expect(buttons[4].innerText.trim(), 'context menu button 5').to.contain('Duplicate');
                });

                // Note: we cover the functionality of the context menu buttons in the 'as admin' section
            });
        });

        describe('as admin', function () {
            let admin, editor, publishedPost, scheduledPost, draftPost, authorPost;

            beforeEach(async function () {
                this.server.loadFixtures('tiers');

                let adminRole = this.server.create('role', {name: 'Administrator'});
                admin = this.server.create('user', {roles: [adminRole]});
                let editorRole = this.server.create('role', {name: 'Editor'});
                editor = this.server.create('user', {roles: [editorRole]});

                publishedPost = this.server.create('post', {authors: [admin], status: 'published', title: 'Published Post', visibility: 'paid'});
                scheduledPost = this.server.create('post', {authors: [admin], status: 'scheduled', title: 'Scheduled Post'});
                draftPost = this.server.create('post', {authors: [admin], status: 'draft', title: 'Draft Post'});
                authorPost = this.server.create('post', {authors: [editor], status: 'published', title: 'Editor Published Post'});

                // pages shouldn't appear in the list
                this.server.create('page', {authors: [admin], status: 'published', title: 'Published Page'});

                await authenticateSession();
            });

            describe('displays and filter posts', function () {
                it('displays posts', async function () {
                    await visit('/posts');

                    const posts = findAll('[data-test-post-id]');
                    // displays all posts by default (all statuses) [no pages]
                    expect(posts.length, 'all posts count').to.equal(4);

                    // make sure display is scheduled > draft > published/sent
                    expect(posts[0].querySelector('.gh-content-entry-title').textContent, 'post 1 title').to.contain('Scheduled Post');
                    expect(posts[1].querySelector('.gh-content-entry-title').textContent, 'post 2 title').to.contain('Draft Post');
                    expect(posts[2].querySelector('.gh-content-entry-title').textContent, 'post 3 title').to.contain('Published Post');
                    expect(posts[3].querySelector('.gh-content-entry-title').textContent, 'post 4 title').to.contain('Editor Published Post');

                    // check API requests
                    let lastRequests = this.server.pretender.handledRequests.filter(request => request.url.includes('/posts/'));
                    expect(lastRequests[0].queryParams.filter, 'scheduled request filter').to.have.string('status:scheduled');
                    expect(lastRequests[1].queryParams.filter, 'drafts request filter').to.have.string('status:draft');
                    expect(lastRequests[2].queryParams.filter, 'published request filter').to.have.string('status:[published,sent]');
                });

                it('can filter by status', async function () {
                    await visit('/posts');

                    // show draft posts
                    await selectChoose('[data-test-type-select]', 'Draft posts');

                    // API request is correct
                    let postsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                    let lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.filter, '"drafts" request status filter').to.have.string('status:draft');
                    // Displays draft post
                    expect(findAll('[data-test-post-id]').length, 'drafts count').to.equal(1);
                    expect(find(`[data-test-post-id="${draftPost.id}"]`), 'draft post').to.exist;

                    // show published posts
                    await selectChoose('[data-test-type-select]', 'Published posts');

                    // API request is correct
                    postsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                    lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.filter, '"published" request status filter').to.have.string('status:published');
                    // Displays three published posts + pages
                    expect(findAll('[data-test-post-id]').length, 'published count').to.equal(2);
                    expect(find(`[data-test-post-id="${publishedPost.id}"]`), 'admin published post').to.exist;
                    expect(find(`[data-test-post-id="${authorPost.id}"]`), 'author published post').to.exist;

                    // show scheduled posts
                    await selectChoose('[data-test-type-select]', 'Scheduled posts');

                    // API request is correct
                    let scheduledPostsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                    let lastScheduledRequest = scheduledPostsRequests[scheduledPostsRequests.length - 1];
                    expect(lastScheduledRequest.queryParams.filter, '"scheduled" request status filter').to.have.string('status:scheduled');
                    // Displays scheduled post
                    expect(findAll('[data-test-post-id]').length, 'scheduled count').to.equal(1);
                    expect(find(`[data-test-post-id="${scheduledPost.id}"]`), 'scheduled post').to.exist;
                });

                it('can filter by author', async function () {
                    await visit('/posts');

                    // show all posts by editor
                    await selectChoose('[data-test-author-select]', editor.name);

                    // API request is correct
                    let postsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                    let lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.allFilter, '"editor" request status filter')
                        .to.have.string('status:[draft,scheduled,published,sent]');
                    expect(lastPostsRequest.queryParams.allFilter, '"editor" request filter param')
                        .to.have.string(`authors:${editor.slug}`);

                    // Displays editor post
                    expect(findAll('[data-test-post-id]').length, 'editor count').to.equal(1);
                    expect(find(`[data-test-post-id="${authorPost.id}"]`), 'editor post').to.exist;
                });

                it('can filter by visibility', async function () {
                    await visit('/posts');

                    await selectChoose('[data-test-visibility-select]', 'Paid members-only');
                    let postsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                    let lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.allFilter, '"visibility" request filter param')
                        .to.have.string('visibility:[paid,tiers]');
                    let posts = findAll('[data-test-post-id]');
                    expect(posts.length, 'all posts count').to.equal(1);

                    await selectChoose('[data-test-visibility-select]', 'Public');
                    postsRequests = this.server.pretender.handledRequests.filter(r => r.url.includes('/posts/') && r.method === 'GET');
                    lastPostsRequest = postsRequests[postsRequests.length - 1];
                    expect(lastPostsRequest.queryParams.allFilter, '"visibility" request filter param')
                        .to.have.string('visibility:public');
                    posts = findAll('[data-test-post-id]');
                    expect(posts.length, 'all posts count').to.equal(3);
                });

                it('can filter by tag', async function () {
                    this.server.create('tag', {name: 'B - Second', slug: 'second'});
                    this.server.create('tag', {name: 'Z - Last', slug: 'last'});
                    this.server.create('tag', {name: 'A - First', slug: 'first'});

                    await visit('/posts');
                    await clickTrigger('[data-test-tag-select]');

                    // defaults to "All tags"
                    let options = findAll('.ember-power-select-option');
                    expect(options.length, 'options count').to.equal(4); // 3 tags + "All tags", we populate the tags when opening the dropdown
                    expect(options[0].textContent.trim()).to.equal('All tags');

                    // search lazy-loads tags from the API, and sorts them alphabetically
                    await selectSearch('[data-test-tag-select]', 's');

                    options = findAll('.ember-power-select-option');
                    expect(options[0].textContent.trim()).to.equal('A - First');
                    expect(options[1].textContent.trim()).to.equal('B - Second');
                    expect(options[2].textContent.trim()).to.equal('Z - Last');

                    // select one
                    await selectChoose('[data-test-tag-select]', 'B - Second');
                    // affirm request
                    let [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                    expect(lastRequest.queryParams.allFilter, '"posts" request filter param').to.have.string('tag:second');
                });

                it('can filter by tag with server-side search', async function () {
                    this.server.createList('tag', 120);
                    this.server.create('tag', {name: 'Z - Last', slug: 'last'});

                    await visit('/posts');

                    await selectSearch('[data-test-tag-select]', 'Last');

                    let options = findAll('.ember-power-select-option');
                    expect(options.length, 'options count').to.equal(1);
                    expect(options[0].textContent.trim()).to.equal('Z - Last');

                    await selectChoose('[data-test-tag-select]', 'Z - Last');

                    let [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                    expect(lastRequest.queryParams.allFilter, '"posts" request filter param').to.have.string('tag:last');
                });

                it('can open with a filtered tag', async function () {
                    const tag = this.server.create('tag', {name: 'B - Second', slug: 'second'});
                    this.server.create('post', {authors: [admin], status: 'published', title: 'Published Post with Second tag', tags: [tag]});

                    await visit('/posts?tag=second');

                    // Posts list is filtered by tag
                    const posts = findAll('[data-test-post-id]');
                    expect(posts.length, 'all posts count').to.equal(1);
                    expect(posts[0].querySelector('.gh-content-entry-title').textContent, 'post title').to.contain('Published Post with Second tag');

                    // Filter shows selected tag
                    const filter = find('[data-test-tag-select]');
                    expect(filter.textContent.trim(), 'filter text').to.contain('B - Second');
                });
            });

            describe('context menu actions', function () {
                describe('single post', function () {
                    it('can duplicate a post', async function () {
                        await visit('/posts');

                        // get the post
                        const post = find(`[data-test-post-id="${publishedPost.id}"]`);
                        expect(post, 'post').to.exist;

                        await triggerEvent(post, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu'); // this is a <ul> element

                        let buttons = contextMenu.querySelectorAll('button');

                        expect(contextMenu, 'context menu').to.exist;
                        expect(buttons.length, 'context menu buttons').to.equal(6);
                        expect(buttons[0].innerText.trim(), 'context menu button 1').to.contain('Copy link to post');
                        expect(buttons[1].innerText.trim(), 'context menu button 1').to.contain('Unpublish');
                        expect(buttons[2].innerText.trim(), 'context menu button 2').to.contain('Feature'); // or Unfeature
                        expect(buttons[3].innerText.trim(), 'context menu button 3').to.contain('Add a tag');
                        expect(buttons[4].innerText.trim(), 'context menu button 4').to.contain('Duplicate');
                        expect(buttons[5].innerText.trim(), 'context menu button 5').to.contain('Delete');

                        // duplicate the post
                        await click(buttons[4]);

                        const posts = findAll('[data-test-post-id]');
                        expect(posts.length, 'all posts count').to.equal(5);
                        let [lastRequest] = this.server.pretender.handledRequests.slice(-1);
                        expect(lastRequest.url, 'request url').to.match(new RegExp(`/posts/${publishedPost.id}/copy/`));
                    });

                    it('can copy a post link', async function () {
                        sinon.stub(navigator.clipboard, 'writeText').resolves();

                        await visit('/posts');

                        // get the post
                        const post = find(`[data-test-post-id="${publishedPost.id}"]`);
                        expect(post, 'post').to.exist;

                        await triggerEvent(post, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu'); // this is a <ul> element

                        let buttons = contextMenu.querySelectorAll('button');

                        expect(contextMenu, 'context menu').to.exist;
                        expect(buttons.length, 'context menu buttons').to.equal(6);
                        expect(buttons[0].innerText.trim(), 'context menu button 1').to.contain('Copy link to post');
                        expect(buttons[1].innerText.trim(), 'context menu button 1').to.contain('Unpublish');
                        expect(buttons[2].innerText.trim(), 'context menu button 2').to.contain('Feature'); // or Unfeature
                        expect(buttons[3].innerText.trim(), 'context menu button 3').to.contain('Add a tag');
                        expect(buttons[4].innerText.trim(), 'context menu button 4').to.contain('Duplicate');
                        expect(buttons[5].innerText.trim(), 'context menu button 5').to.contain('Delete');

                        // Copy the post link
                        await click(buttons[0]);

                        // Check that the notification is displayed
                        expect(find('[data-test-text="notification-content"]')).to.contain.text('Post link copied');

                        // Check that the clipboard contains the right content
                        expect(navigator.clipboard.writeText.calledOnce).to.be.true;
                        expect(navigator.clipboard.writeText.firstCall.args[0]).to.equal(`http://localhost:4200/${publishedPost.slug}/`);
                    });

                    it('can copy a preview link', async function () {
                        sinon.stub(navigator.clipboard, 'writeText').resolves();

                        await visit('/posts');

                        // get the post
                        const post = find(`[data-test-post-id="${draftPost.id}"]`);
                        expect(post, 'post').to.exist;

                        await triggerEvent(post, 'contextmenu');

                        let contextMenu = find('.gh-posts-context-menu'); // this is a <ul> element

                        let buttons = contextMenu.querySelectorAll('button');

                        expect(contextMenu, 'context menu').to.exist;
                        expect(buttons.length, 'context menu buttons').to.equal(5);
                        expect(buttons[0].innerText.trim(), 'context menu button 1').to.contain('Copy preview link');
                        expect(buttons[1].innerText.trim(), 'context menu button 2').to.contain('Feature'); // or Unfeature
                        expect(buttons[2].innerText.trim(), 'context menu button 3').to.contain('Add a tag');
                        expect(buttons[3].innerText.trim(), 'context menu button 4').to.contain('Duplicate');
                        expect(buttons[4].innerText.trim(), 'context menu button 5').to.contain('Delete');

                        // Copy the preview link
                        await click(buttons[0]);

                        // Check that the notification is displayed
                        expect(find('[data-test-text="notification-content"]')).to.contain.text('Preview link copied');

                        // Check that the clipboard contains the right content
                        expect(n